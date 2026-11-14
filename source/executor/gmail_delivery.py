"""Gmail v1 text-email adapter. No network is enabled by importing this module.

Google SEND acceptance and a verified SENT copy establish provider submission,
not recipient delivery. The private HTTPS transport has no retry/redirect code.
"""
from __future__ import annotations
import base64
from dataclasses import dataclass
from email import policy
from email.message import EmailMessage
from email.parser import BytesParser
from email.utils import format_datetime
from datetime import datetime,timezone
import hashlib
import http.client
import json
import re
import ssl
from urllib.parse import urlencode

BASE='https://gmail.googleapis.com'
PREFIX='/gmail/v1/users/me'
ID=re.compile(r'^[A-Za-z0-9_-]{1,128}$')
ADDRESS=re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?\.[A-Za-z]{2,63}$")
SCHEMA='near-gmail-text-v1'
PROVIDER='gmail-v1'
class DeliveryError(ValueError): pass
class AmbiguousRequest(DeliveryError): pass
class NetworkDisabled(DeliveryError): pass

def canonical(value): return json.dumps(value,ensure_ascii=True,separators=(',',':'),sort_keys=True)
def sha(value): return hashlib.sha256(value.encode('utf-8') if isinstance(value,str) else value).hexdigest()
def address(value):
    if not isinstance(value,str) or len(value)>254 or not ADDRESS.fullmatch(value) or '..' in value or value.startswith('.') or '.@' in value:
        raise DeliveryError('One plain ASCII mailbox address is required')
    local,domain=value.rsplit('@',1)
    if any(not label or len(label)>63 or label.startswith('-') or label.endswith('-') for label in domain.split('.')): raise DeliveryError('Invalid mailbox domain')
    return local+'@'+domain.lower()

def validate_intent(v):
    fields={'schema','provider','intent_id','account_profile','sender','recipient','subject','body'}
    if not isinstance(v,dict) or set(v)!=fields or v['schema']!=SCHEMA or v['provider']!=PROVIDER: raise DeliveryError('Exact typed Gmail intent required')
    if not isinstance(v['intent_id'],str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,47}',v['intent_id']): raise DeliveryError('Invalid intent ID')
    if not isinstance(v['account_profile'],str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,31}',v['account_profile']): raise DeliveryError('Invalid owner credential alias')
    if v['sender']!=address(v['sender']) or v['recipient']!=address(v['recipient']): raise DeliveryError('Canonical approved addresses required')
    subject,body=v['subject'],v['body']
    if not isinstance(subject,str) or not subject.strip() or len(subject.encode('utf-8'))>240 or any(ord(c)<32 or ord(c)==127 for c in subject): raise DeliveryError('Invalid one-line subject')
    if not isinstance(body,str) or not body.strip() or len(body.encode('utf-8'))>3000 or '\r' in body or any(ord(c)<32 and c not in '\n\t' or ord(c)==127 for c in body): raise DeliveryError('Invalid bounded plaintext body')
    # Force validation of surrogates before MIME serialization.
    subject.encode('utf-8');body.encode('utf-8')
    return dict(v)

def profile_hash(alias,account): return sha(canonical(['gmail-account-profile-v1',alias,address(account)]))
def commitments(v):
    v=validate_intent(v)
    return {'sender_hash':sha(v['sender']),'recipient_hash':sha(v['recipient']),'content_hash':sha(canonical([v['subject'],v['body']])),'profile_hash':profile_hash(v['account_profile'],v['sender'])}
def message_id(intent_hash):
    if not isinstance(intent_hash,str) or not re.fullmatch(r'[0-9a-f]{64}',intent_hash): raise DeliveryError('Invalid intent commitment')
    return '<near-'+intent_hash+'@outbox.invalid>'
def raw_message(v,intent_hash,authorized_at='0'):
    v=validate_intent(v);m=EmailMessage(policy=policy.SMTP)
    m['Date']=format_datetime(datetime.fromtimestamp(int(authorized_at),timezone.utc));m['From']=v['sender'];m['To']=v['recipient'];m['Subject']=v['subject'];m['Message-ID']=message_id(intent_hash);m['X-Near-Intent-ID']=v['intent_id']
    m.set_content(v['body'],subtype='plain',charset='utf-8',cte='base64')
    return m.as_bytes()
def b64(data):return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')
def unb64(text):
    if not isinstance(text,str) or len(text)>24000 or not re.fullmatch(r'[A-Za-z0-9_-]*={0,2}',text):raise DeliveryError('Invalid provider base64url')
    try:return base64.b64decode(text+'='*((-len(text))%4),altchars=b'-_',validate=True)
    except Exception as e:raise DeliveryError('Invalid provider base64url') from e

@dataclass(frozen=True)
class Request:
    kind:str
    method:str
    path:str
    body:dict|None=None
    def validate(self):
        if self.kind=='profile':ok=self.method=='GET' and self.path==PREFIX+'/profile' and self.body is None
        elif self.kind=='send':ok=self.method=='POST' and self.path==PREFIX+'/messages/send' and isinstance(self.body,dict) and set(self.body)=={'raw'} and isinstance(self.body['raw'],str) and len(self.body['raw'])<=18000
        elif self.kind=='search':
            pattern=re.escape(PREFIX+'/messages?')+r'q=rfc822msgid%3A%3Cnear-[0-9a-f]{64}%40outbox\.invalid%3E&maxResults=2&includeSpamTrash=true'
            ok=self.method=='GET' and re.fullmatch(pattern,self.path) is not None and self.body is None
        elif self.kind=='verify':ok=self.method=='GET' and re.fullmatch(re.escape(PREFIX+'/messages/')+r'[A-Za-z0-9_-]{1,128}\?format=raw',self.path) is not None and self.body is None
        else:ok=False
        if not ok:raise DeliveryError('Fixed Gmail request target required')
        return self
    @property
    def digest(self):self.validate();return sha(canonical([self.kind,self.method,BASE+self.path,self.body]))

def profile_request():return Request('profile','GET',PREFIX+'/profile')
def send_request(v,h,authorized_at='0'):return Request('send','POST',PREFIX+'/messages/send',{'raw':b64(raw_message(v,h,authorized_at))})
def search_request(h):return Request('search','GET',PREFIX+'/messages?'+urlencode([('q','rfc822msgid:'+message_id(h)),('maxResults','2'),('includeSpamTrash','true')]))
def verify_request(provider_id):
    if not isinstance(provider_id,str) or not ID.fullmatch(provider_id):raise DeliveryError('Invalid opaque provider message ID')
    return Request('verify','GET',PREFIX+'/messages/'+provider_id+'?format=raw')

@dataclass(frozen=True)
class Response:
    status:int
    data:dict
    def validate(self):
        if type(self.status) is not int or not 100<=self.status<=599 or not isinstance(self.data,dict) or len(canonical(self.data).encode())>32768:raise DeliveryError('Invalid bounded provider response')
        return self

class RecordingTransport:
    """SYNTHETIC test fixture; does not resolve DNS or open a socket."""
    network_disabled=True
    def __init__(self,handler):self.handler=handler;self.calls=[]
    def request(self,request,token,permit=None):
        request.validate()
        self.calls.append({'kind':request.kind,'method':request.method,'url':BASE+request.path,'body':request.body})
        return self.handler(request).validate()

class DisabledTransport:
    network_disabled=True
    def request(self,*args,**kwargs):raise NetworkDisabled('Gmail network is disabled')

_LIVE_SEAL=object()
@dataclass(frozen=True)
class _LivePermit:
    seal:object
    digest:str
    authority_id:str
    finalized_reservation:bool

class _HTTPSGmailTransport:
    """Dormant real transport; only the explicit production factory issues it.

    Credentials stay in the Authorization header. No proxies, redirects, request
    retries, dynamic hosts, model-selected endpoints, or token refresh occurs.
    """
    network_disabled=False
    def __init__(self,seal,authority_id):
        if seal is not _LIVE_SEAL:raise NetworkDisabled('Explicit live NEAR factory required')
        self._authority_id=authority_id
    def request(self,request,token,permit=None):
        request.validate()
        if not isinstance(permit,_LivePermit) or permit.seal is not _LIVE_SEAL or not permit.finalized_reservation or permit.authority_id!=self._authority_id or permit.digest!=request.digest:raise NetworkDisabled('Exact finalized NEAR request permit required')
        if not isinstance(token,str) or not 8<=len(token)<=8192 or any(ord(c)<33 or ord(c)>126 for c in token):raise DeliveryError('Invalid protected OAuth access token')
        payload=None if request.body is None else canonical(request.body).encode()
        conn=http.client.HTTPSConnection('gmail.googleapis.com',443,timeout=15,context=ssl.create_default_context())
        try:
            conn.request(request.method,request.path,body=payload,headers={'Authorization':'Bearer '+token,'Accept':'application/json','Content-Type':'application/json; charset=utf-8'})
            response=conn.getresponse();raw=response.read(32769)
            if len(raw)>32768:raise AmbiguousRequest('Provider response exceeded bound')
            if 300<=response.status<=399:raise AmbiguousRequest('Provider redirect refused')
            try:data=json.loads(raw.decode('utf-8'))
            except Exception as e:raise AmbiguousRequest('Provider response was not a JSON object') from e
            return Response(response.status,data).validate()
        except (TimeoutError,OSError,http.client.HTTPException) as e:raise AmbiguousRequest('Provider request outcome unknown') from e
        finally:conn.close()

def provider_ids(v):
    if not isinstance(v,dict) or not all(isinstance(v.get(k),str) and ID.fullmatch(v[k]) for k in ('id','threadId')):raise DeliveryError('Exact bounded provider IDs required')
    return v['id'],v['threadId']

def verify_sent_copy(data,intent,intent_hash,expected_id=None,expected_thread=None):
    ident,thread=provider_ids(data)
    if expected_id is not None and ident!=expected_id or expected_thread is not None and thread!=expected_thread:raise DeliveryError('Provider message/thread conflict')
    if not isinstance(data.get('labelIds'),list) or 'SENT' not in data['labelIds']:raise DeliveryError('Provider sent copy required')
    parsed=BytesParser(policy=policy.default).parsebytes(unb64(data.get('raw')))
    if parsed.defects or parsed.is_multipart() or parsed.get_content_type()!='text/plain':raise DeliveryError('Exact plain-text sent copy required')
    expected={'from':intent['sender'],'to':intent['recipient'],'subject':intent['subject'],'message-id':message_id(intent_hash),'x-near-intent-id':intent['intent_id']}
    if parsed.get_all('cc') or parsed.get_all('bcc') or parsed.get_all('resent-to') or parsed.get_all('resent-from'):raise DeliveryError('Unexpected recipient headers')
    for name,value in expected.items():
        entries=parsed.get_all(name,[])
        if len(entries)!=1 or str(entries[0])!=value:raise DeliveryError('Original account/recipient/content metadata mismatch')
    try:body=parsed.get_content()
    except Exception as e:raise DeliveryError('Invalid provider content encoding') from e
    if body.replace('\r\n','\n')!=intent['body']+('' if intent['body'].endswith('\n') else '\n'):raise DeliveryError('Original plaintext body mismatch')
    return ident,thread
