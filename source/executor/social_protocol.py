"""Bounded fixed-host social HTTP protocol; import and defaults open no sockets."""
from __future__ import annotations
from dataclasses import dataclass
import hashlib
import http.client
import json
import re
import ssl
from urllib.parse import urlsplit,parse_qsl
from executor.gmail_delivery import canonical,sha

PROVIDERS=('x','instagram','facebook_pages','tiktok','youtube','pinterest')
HOSTS={'x':('api.x.com',),'instagram':('graph.facebook.com',),'facebook_pages':('graph.facebook.com',),'pinterest':('api.pinterest.com',),'tiktok':('open.tiktokapis.com','open-upload.tiktokapis.com'),'youtube':('www.googleapis.com',)}
WRITES={'x':('publish',),'facebook_pages':('publish',),'pinterest':('publish',),'instagram':('stage','publish'),'tiktok':('stage','upload'),'youtube':('stage','upload')}
SCOPES={'x':{'tweet.read','tweet.write','users.read'},'facebook_pages':{'pages_manage_posts','pages_read_engagement','pages_show_list'},'instagram':{'instagram_basic','instagram_content_publish','pages_read_engagement','pages_show_list'},'pinterest':{'user_accounts:read','boards:read','boards:write','pins:read','pins:write'},'tiktok':{'user.info.basic','video.publish'},'youtube':{'https://www.googleapis.com/auth/youtube.upload','https://www.googleapis.com/auth/youtube.readonly'}}
GRAPH='v26.0' # Verified against Meta's official generated SDK, not an unversioned API.
MAX_BODY=12*1024*1024
class SocialError(ValueError):pass
class SocialUnknown(SocialError):pass
class SocialDisabled(SocialError):pass
class ProviderPending(SocialError):pass

def exact(v,keys):
    if not isinstance(v,dict) or set(v)!=set(keys):raise SocialError('Exact typed social fields required')
def bounded_text(v,maximum,*,empty=False):
    if not isinstance(v,str) or (not empty and not v.strip()) or len(v.encode('utf-8'))>maximum or any(ord(c)<32 and c not in '\n\t' or ord(c)==127 for c in v):raise SocialError('Invalid bounded social text')
    return v

def opaque(v,provider,*,stage=False):
    pattern=r'[A-Za-z0-9_.~-]{1,160}' if stage else (r'[0-9]{1,32}(?:_[0-9]{1,32})?' if provider=='facebook_pages' else r'[0-9]{1,25}' if provider=='x' else r'[0-9]{1,32}' if provider in ('instagram','pinterest') else r'[A-Za-z0-9_-]{1,128}')
    if not isinstance(v,str) or re.fullmatch(pattern,v) is None:raise SocialError('Invalid exact provider ID')
    return v

def known_url(value,provider):
    """Only provider-issued upload URLs; model/intent URLs cannot select transport."""
    if not isinstance(value,str) or len(value)>4096:raise SocialError('Invalid bounded upload URL')
    p=urlsplit(value)
    if p.scheme!='https' or p.username or p.password or p.port not in (None,443) or p.fragment or any(ord(c)<33 or ord(c)>126 for c in value):raise SocialError('Fixed HTTPS provider upload URL required')
    pairs=parse_qsl(p.query,keep_blank_values=True,strict_parsing=True)
    if len({k for k,v in pairs})!=len(pairs) or any(not v or len(v)>2048 for k,v in pairs):raise SocialError('Invalid exact upload query')
    q=dict(pairs)
    if provider=='tiktok':ok=p.hostname=='open-upload.tiktokapis.com' and p.path=='/video/' and set(q)=={'upload_id','upload_token'}
    elif provider=='youtube':ok=p.hostname=='www.googleapis.com' and p.path=='/upload/youtube/v3/videos' and set(q) in ({'uploadType','upload_id'},{'uploadType','upload_id','part'}) and q.get('uploadType')=='resumable' and ('part' not in q or q['part']=='snippet,status')
    else:ok=False
    if not ok:raise SocialError('Fixed provider-issued upload target required')
    return p.hostname,p.path+'?'+p.query

@dataclass(frozen=True)
class SocialRequest:
    provider:str
    kind:str
    method:str
    host:str
    path:str
    body:bytes=b''
    headers:tuple=()
    auth:bool=True
    @property
    def write(self):return self.kind in WRITES.get(self.provider,())
    def validate(self):
        if self.provider not in HOSTS or self.host not in HOSTS[self.provider] or self.method not in ('GET','POST','PUT') or not isinstance(self.body,bytes) or len(self.body)>MAX_BODY:raise SocialError('Fixed bounded social request required')
        if not isinstance(self.path,str) or len(self.path)>4096 or not self.path.startswith('/') or self.path.startswith('//') or '#' in self.path or any(ord(c)<33 or ord(c)>126 for c in self.path):raise SocialError('Invalid provider path')
        allowed={'Content-Type','Content-Range','X-Upload-Content-Length','X-Upload-Content-Type'}
        if not isinstance(self.headers,tuple) or len(dict(self.headers))!=len(self.headers) or any(k not in allowed or not isinstance(v,str) or len(v)>200 or any(ord(c)<32 or ord(c)>126 for c in v) for k,v in self.headers):raise SocialError('Fixed provider header fields required')
        if not self.auth and not (self.provider=='tiktok' and self.kind=='upload'):raise SocialError('Fixed provider authentication mode required')
        # Each provider module owns its exact path/method/body schema.
        from executor.social_providers import validate_request
        try:validate_request(self)
        except SocialError:raise
        except (ValueError,KeyError,TypeError,UnicodeError) as e:raise SocialError('Malformed typed provider request denied') from e
        return self
    @property
    def digest(self):
        self.validate();return sha(canonical([self.provider,self.kind,self.method,self.host,self.path,sha(self.body),len(self.body),list(self.headers),self.auth]))

def json_request(provider,kind,method,host,path,payload=None,headers=()):
    body=b'' if payload is None else canonical(payload).encode()
    return SocialRequest(provider,kind,method,host,path,body,(('Content-Type','application/json; charset=utf-8'),)+tuple(headers)).validate()

@dataclass(frozen=True)
class SocialResponse:
    status:int
    data:dict
    headers:dict|None=None
    def validate(self):
        if type(self.status) is not int or not 100<=self.status<=599 or not isinstance(self.data,dict) or len(canonical(self.data).encode())>65536:raise SocialError('Invalid bounded social response')
        if self.headers is not None and (not isinstance(self.headers,dict) or set(self.headers)-{'location'} or any(not isinstance(v,str) or len(v)>4096 or '\r' in v or '\n' in v for v in self.headers.values())):raise SocialError('Invalid bounded response headers')
        return self

class SocialRecordingTransport:
    """Explicit SYNTHETIC fixture, never a live transport or network factory."""
    network_disabled=True
    def __init__(self,handler):self.handler=handler;self.calls=[]
    def request(self,request,token,permit=None):
        request.validate();self.calls.append({'provider':request.provider,'kind':request.kind,'method':request.method,'host':request.host,'path':request.path.split('?',1)[0],'request_hash':request.digest,'body_hash':sha(request.body),'body_bytes':len(request.body)})
        return self.handler(request).validate()

class SocialDisabledTransport:
    network_disabled=True
    def request(self,*args,**kwargs):raise SocialDisabled('Social network transport is disabled')

_SOCIAL_LIVE_SEAL=object()
@dataclass(frozen=True)
class SocialLivePermit:
    seal:object
    digest:str
    authority_id:str
    finalized:bool

class SocialHTTPSTransport:
    """Dormant real transport: fixed TLS hosts, bounded I/O, no redirects/retries."""
    network_disabled=False
    def __init__(self,seal,authority_id):
        if seal is not _SOCIAL_LIVE_SEAL:raise SocialDisabled('Explicit live social factory required')
        self.authority_id=authority_id
    def request(self,request,token,permit=None):
        request.validate()
        if not isinstance(permit,SocialLivePermit) or permit.seal is not _SOCIAL_LIVE_SEAL or not permit.finalized or permit.authority_id!=self.authority_id or permit.digest!=request.digest:raise SocialDisabled('Exact fresh FINAL NEAR social reservation required')
        if not isinstance(token,str) or not 8<=len(token)<=8192 or any(ord(c)<33 or ord(c)>126 for c in token):raise SocialError('Invalid protected OAuth token')
        headers=dict(request.headers);headers['Accept']='application/json'
        if request.auth:headers['Authorization']='Bearer '+token
        connection=http.client.HTTPSConnection(request.host,443,timeout=15,context=ssl.create_default_context())
        try:
            connection.request(request.method,request.path,body=request.body or None,headers=headers)
            response=connection.getresponse();raw=response.read(65537)
            if len(raw)>65536:raise SocialUnknown('Provider response exceeded bound')
            if 300<=response.status<400 and not (request.provider=='youtube' and request.kind=='upload_status' and response.status==308):raise SocialUnknown('Provider redirect refused')
            try:data=json.loads(raw.decode()) if raw else {}
            except Exception as e:raise SocialUnknown('Provider response was not bounded JSON') from e
            location=response.getheader('Location');h={} if location is None else {'location':location}
            return SocialResponse(response.status,data,h).validate()
        except (TimeoutError,OSError,http.client.HTTPException) as e:raise SocialUnknown('Provider request outcome unknown') from e
        finally:connection.close()
