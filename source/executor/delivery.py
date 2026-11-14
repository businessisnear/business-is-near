"""Explicit encrypted-intent delivery. Draft operations never call this module.

Default transport is disabled. Production construction is deliberately separate
and requires an owner live flag and the actual finalized restricted NEAR bridge.
All request reservations and the private journal precede provider transport.
"""
from __future__ import annotations
import base64
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import secrets
import select
import stat
import subprocess
import tempfile
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from executor.crypto import open_record_key
from executor.gmail_delivery import (DeliveryError,AmbiguousRequest,NetworkDisabled,RecordingTransport,DisabledTransport,
    Response,canonical,sha,address,commitments,profile_hash,validate_intent,profile_request,send_request,search_request,
    verify_request,provider_ids,verify_sent_copy,_HTTPSGmailTransport,_LivePermit,_LIVE_SEAL)

ROOT=Path(__file__).resolve().parents[1]
SOURCE_FILES=('contract/onchain/outbox.ts','executor/delivery.py','executor/gmail_delivery.py','executor/delivery_rpc.mjs','executor/crypto.py','app/worker_crypto.py','executor/journal.mjs','executor/outcome.mjs','executor/package-lock.json')
class _Suppressed(DeliveryError):pass

SCOPES={'https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.readonly'}

def private_directory(path):
    p=Path(path).absolute();p.mkdir(mode=0o700,parents=True,exist_ok=True)
    st=p.lstat()
    if p.resolve()!=p or not stat.S_ISDIR(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid():raise DeliveryError('Private owner-controlled directory required')
    return p

def private_read(path,max_bytes=65536):
    p=Path(path)
    if not p.is_absolute() or p.parent.resolve()!=p.parent:raise DeliveryError('Absolute nonsymlink credential path required')
    st=p.parent.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid():raise DeliveryError('Private credential parent required')
    fd=os.open(p,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid() or st.st_size>max_bytes:raise DeliveryError('Unsafe private file')
        with os.fdopen(fd,'rb',closefd=False) as f:data=f.read(max_bytes+1)
        if len(data)>max_bytes:raise DeliveryError('Private file too large')
        return data
    finally:os.close(fd)

def private_write(path,data):
    p=Path(path);private_directory(p.parent)
    if p.is_symlink():raise DeliveryError('Unsafe journal symlink')
    fd,temp=tempfile.mkstemp(prefix='.delivery-',dir=p.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
        os.replace(temp,p)
        directory=os.open(p.parent,os.O_RDONLY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if os.path.exists(temp):os.unlink(temp)

def execution_manifest(vault):
    pem=vault.private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode('ascii')
    files=[[name,sha((ROOT/name).read_bytes())] for name in SOURCE_FILES]
    return {'worker_public_key':pem,'worker_key_id':sha(pem),'source_hash':sha(canonical(files)),
            'worker_hash':sha((ROOT/'executor/delivery.py').read_bytes()),'source_files':dict(files)}

class CredentialRegistry:
    """Owner-owned private file; no token values in repr, arguments, or exports."""
    synthetic=False
    def __init__(self,path):self._path=Path(path)
    def credential(self,alias):
        v=json.loads(private_read(self._path))
        if not isinstance(v,dict) or set(v)!={'schema','profiles'} or v['schema']!=1 or not isinstance(v['profiles'],dict):raise DeliveryError('Invalid protected credential registry')
        p=v['profiles'].get(alias)
        if not isinstance(p,dict) or set(p)!={'provider','account','access_token','scopes'} or p['provider']!='gmail-v1' or p['account']!=address(p['account']):raise DeliveryError('Exact approved Gmail account profile required')
        if not isinstance(p['access_token'],str) or not 8<=len(p['access_token'])<=8192 or any(ord(c)<33 or ord(c)>126 for c in p['access_token']):raise DeliveryError('Invalid protected OAuth access token')
        if not isinstance(p['scopes'],list) or len(p['scopes'])!=2 or set(p['scopes'])!=SCOPES:raise DeliveryError('Exact send and readonly OAuth scopes required')
        return p
    def __repr__(self):return '<CredentialRegistry protected>'

class MemoryCredentialRegistry:
    """SYNTHETIC fixtures only; cannot be used by the live factory."""
    synthetic=True
    def __init__(self,alias,account):self._alias=alias;self._account=address(account)
    def credential(self,alias):
        if alias!=self._alias:raise DeliveryError('Unapproved credential alias')
        return {'provider':'gmail-v1','account':self._account,'access_token':'synthetic','scopes':sorted(SCOPES)}

class SuppressionList:
    """Private owner-maintained suppression/opt-out state, re-read before SEND."""
    synthetic=False
    def __init__(self,path):self._path=Path(path)
    def allows(self,recipient):
        v=json.loads(private_read(self._path))
        if not isinstance(v,dict) or set(v)!={'schema','suppressed','opted_out'} or v['schema']!=1:raise DeliveryError('Valid suppression and opt-out file required')
        denied=[]
        for name in ('suppressed','opted_out'):
            if not isinstance(v[name],list) or len(v[name])>10000:raise DeliveryError('Invalid suppression file')
            denied.extend(address(x).casefold() for x in v[name])
        return address(recipient).casefold() not in denied

class MemorySuppression:
    synthetic=True
    def __init__(self,denied=()):self.denied={address(x).casefold() for x in denied}
    def allows(self,recipient):return address(recipient).casefold() not in self.denied

class EncryptedJournal:
    def __init__(self,root,vault):self.root=private_directory(root);self.key=vault.master
    @contextlib.contextmanager
    def lease(self,intent_id):
        if not isinstance(intent_id,str) or not __import__('re').fullmatch(r'[a-z][a-z0-9_-]{0,47}',intent_id):raise DeliveryError('Invalid intent ID')
        fd=os.open(self.root/('intent-'+intent_id+'.lease'),os.O_RDWR|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
        try:
            st=os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid():raise DeliveryError('Unsafe delivery lease')
            try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError as e:raise DeliveryError('Another delivery worker holds the intent lease') from e
            yield
        finally:os.close(fd)
    def read(self,intent_id):
        try:v=json.loads(private_read(self.root/('intent-'+intent_id+'.json')))
        except FileNotFoundError:return None
        try:
            if set(v)!={'schema','nonce','ciphertext'} or v['schema']!=1:raise ValueError()
            raw=AESGCM(self.key).decrypt(base64.b64decode(v['nonce'],validate=True),base64.b64decode(v['ciphertext'],validate=True),intent_id.encode())
            result=json.loads(raw)
            if not isinstance(result,dict) or result.get('schema')!=1 or result.get('id')!=intent_id:raise ValueError()
            return result
        except Exception as e:raise DeliveryError('Encrypted delivery journal could not be opened') from e
    def save(self,value):
        ident=value['id'];nonce=secrets.token_bytes(12);raw=AESGCM(self.key).encrypt(nonce,canonical(value).encode(),ident.encode())
        private_write(self.root/('intent-'+ident+'.json'),canonical({'schema':1,'nonce':base64.b64encode(nonce).decode(),'ciphertext':base64.b64encode(raw).decode()}).encode())

class DeliveryWorker:
    def __init__(self,authority,vault,data_dir,registry,suppression,transport=None):
        self.authority=authority;self.vault=vault;self.registry=registry;self.suppression=suppression;self.transport=transport or DisabledTransport();self.journal=EncryptedJournal(data_dir,vault);self.manifest=execution_manifest(vault)
        if type(self.transport) not in (RecordingTransport,DisabledTransport,_HTTPSGmailTransport):raise NetworkDisabled('Only fixed disabled, synthetic, or gated Gmail transports are allowed')
    def _snapshot(self,ident):
        snap=self.authority.snapshot(ident)
        if not isinstance(snap,dict) or snap.get('finality')!='final' or not isinstance(snap.get('state'),dict) or not isinstance(snap.get('intent'),dict):raise DeliveryError('Finalized NEAR authorization required')
        state,grant=snap['state'],snap['intent']
        if snap.get('code_hash')!=state.get('contract_code_hash'):raise DeliveryError('Contract code pin mismatch')
        for key in ('source_hash','worker_hash','worker_key_id'):
            if state.get(key)!=self.manifest[key] or grant.get(key)!=self.manifest[key]:raise DeliveryError('Local source/worker/key pin mismatch')
        if grant.get('id')!=ident or grant.get('schema')!='near-gmail-text-v1' or grant.get('provider')!='gmail-v1' or grant.get('profile_hash')!=state.get('profile_hash'):raise DeliveryError('Typed delivery authority mismatch')
        if type(self.transport) is _HTTPSGmailTransport and (not isinstance(self.authority,NearOutboxAuthority) or self.authority.config['network']=='sandbox' or state.get('live_enabled') is not True):raise NetworkDisabled('Owner live enable and actual production NEAR authority required')
        return snap
    def _request(self,j,request,credential):
        request.validate();kind=request.kind;old=j['requests'].get(kind)
        if old:
            if old['hash']!=request.digest:raise DeliveryError('Durable request hash conflict')
            if old['state']=='done':return Response(old['status'],old['data'])
            raise AmbiguousRequest('Previously reserved request cannot be repeated')
        j['requests'][kind]={'hash':request.digest,'state':'reserving'};self.journal.save(j)
        try:result=self.authority.reserve_request({'id':j['id'],'intent_hash':j['intent_hash'],'kind':kind,'request_id':kind,'request_hash':request.digest,'live':not self.transport.network_disabled})
        except Exception:
            j['requests'][kind]['state']='unknown';self.journal.save(j);raise
        if result.get('duplicate') is not False or result.get('network_authorized') is not True or result.get('request_hash')!=request.digest:
            j['requests'][kind]['state']='unknown';self.journal.save(j);raise AmbiguousRequest('Existing chain reservation cannot authorize another network request')
        j['requests'][kind]['state']='inflight';self.journal.save(j)
        permit=None
        if type(self.transport) is _HTTPSGmailTransport:
            if type(self.authority) is not NearOutboxAuthority or not result.get('_final_near_reservation'):raise NetworkDisabled('Actual finalized NEAR reservation required')
            permit=_LivePermit(_LIVE_SEAL,request.digest,self.authority.identity,True)
        if kind=='send' and not self.suppression.allows(j['intent']['recipient']):
            j['requests'][kind]['state']='not_sent_suppressed';self.journal.save(j);raise _Suppressed('Recipient suppressed before transport')
        try:response=self.transport.request(request,credential['access_token'],permit).validate()
        except Exception:
            j['requests'][kind]['state']='unknown';self.journal.save(j);raise AmbiguousRequest('Provider request outcome unknown')
        j['requests'][kind]={'hash':request.digest,'state':'done','status':response.status,'data':response.data};self.journal.save(j)
        return response
    def _receipt(self,j,status,reason,ident='',thread=''):
        cm=j['commitments'];value={'status':status,'provider_message_id':ident,'provider_thread_id':thread,'account_hash':cm['sender_hash'],'recipient_hash':cm['recipient_hash'],'content_hash':cm['content_hash'],'reason':reason}
        value['receipt_hash']=sha(canonical(['near-delivery-receipt-v1',j['intent_hash'],value]));j['receipt']=value;j['receipt_synced']=False;self.journal.save(j)
        return self._sync(j)
    def _sync(self,j):
        if not j.get('receipt_synced'):
            self.authority.record_receipt({'id':j['id'],'intent_hash':j['intent_hash'],'receipt':j['receipt']});j['receipt_synced']=True;self.journal.save(j)
        return dict(j['receipt'],operator_attestation=True,recipient_delivery_proven=False,provider='synthetic fixture' if self.transport.network_disabled else 'Gmail API')
    def run(self,ident):
        if type(self.transport) is DisabledTransport:raise NetworkDisabled('Gmail delivery is disabled; choose an explicit synthetic or live factory')
        with self.journal.lease(ident):return self._run(ident)
    def _run(self,ident):
        snap=self._snapshot(ident);grant=snap['intent'];state=snap['state'];j=self.journal.read(ident)
        if j and j['intent_hash']!=grant['intent_hash']:raise DeliveryError('Durable intent conflict')
        if j and j.get('receipt'):
            result=self._sync(j)
            if j['receipt']['status']!='unknown':return result
        elif grant.get('status') in ('confirmed','failed'):
            # Lost private cache cannot authorize transport; return the attested receipt.
            return dict(grant['receipt'],operator_attestation=True,recipient_delivery_proven=False,provider='on-chain operator attestation')
        if state.get('frozen') or grant.get('status')=='cancelled' or int(state['observed_at'])>=int(grant['expires_at']):raise DeliveryError('Delivery authority frozen, cancelled, or expired')
        if sha(grant['encrypted_intent'])!=grant['intent_hash']:raise DeliveryError('Encrypted intent hash mismatch')
        key=open_record_key(self.vault,grant['sealed_record_key'],grant['worker_key_id'])
        intent=validate_intent(json.loads(self.vault.decrypt(grant['encrypted_intent'],key)));cm=commitments(intent)
        if intent['intent_id']!=ident or any(grant.get(k)!=v for k,v in cm.items()):raise DeliveryError('Approved private intent commitments mismatch')
        credential=self.registry.credential(intent['account_profile'])
        if credential['account']!=intent['sender'] or profile_hash(intent['account_profile'],credential['account'])!=grant['profile_hash']:raise DeliveryError('Credential registry account/profile mismatch')
        if not j:
            j={'schema':1,'id':ident,'authorized_at':grant.get('authorized_at','0'),'intent_hash':grant['intent_hash'],'intent':intent,'commitments':cm,'requests':{},'receipt':None,'receipt_synced':False};self.journal.save(j)
        if grant.get('send_reserved') and 'send' not in j['requests']:
            # Missing/lost cache is uncertainty, never permission for a second SEND.
            self._receipt(j,'unknown','send_reserved_without_private_result')
        if j.get('receipt') and j['receipt']['status']=='unknown':return self._reconcile(j,credential)
        self.authority.claim({'id':ident,'intent_hash':grant['intent_hash'],**{k:self.manifest[k] for k in ('source_hash','worker_hash','worker_key_id')},'profile_hash':cm['profile_hash']})
        if not self.suppression.allows(intent['recipient']):return self._receipt(j,'failed','recipient_suppressed')
        try:
            profile=self._request(j,profile_request(),credential)
            if profile.status!=200 or profile.data.get('emailAddress')!=intent['sender']:return self._receipt(j,'failed','account_profile_not_verified')
        except Exception:return self._receipt(j,'failed','account_profile_request_failed')
        # Suppression is re-read immediately before reserving/transporting SEND.
        if not self.suppression.allows(intent['recipient']):return self._receipt(j,'failed','recipient_suppressed')
        try:sent=self._request(j,send_request(intent,j['intent_hash'],j['authorized_at']),credential)
        except _Suppressed:return self._receipt(j,'failed','recipient_suppressed')
        except Exception:return self._receipt(j,'unknown','send_outcome_unknown')
        if 400<=sent.status<500 and sent.status not in (408,409,429):return self._receipt(j,'failed','provider_rejected_request')
        if sent.status!=200:return self._receipt(j,'unknown','send_outcome_unknown')
        try:
            provider_id,thread=provider_ids(sent.data)
            response=self._request(j,verify_request(provider_id),credential)
            if response.status!=200:raise DeliveryError('Sent copy unavailable')
            provider_id,thread=verify_sent_copy(response.data,intent,j['intent_hash'],provider_id,thread)
        except Exception:return self._receipt(j,'unknown','sent_copy_not_verified')
        return self._receipt(j,'confirmed','gmail_sent_copy_verified',provider_id,thread)
    def _reconcile(self,j,credential):
        # No code path from unknown reaches SEND. One search and one exact GET.
        try:
            found=self._request(j,search_request(j['intent_hash']),credential)
            if found.status!=200 or found.data.get('nextPageToken') or not isinstance(found.data.get('messages'),list) or len(found.data['messages'])!=1:return self._sync(j)
            ident,thread=provider_ids(found.data['messages'][0])
            result=self._request(j,verify_request(ident),credential)
            if result.status!=200:return self._sync(j)
            ident,thread=verify_sent_copy(result.data,j['intent'],j['intent_hash'],ident,thread)
        except Exception:return self._sync(j)
        return self._receipt(j,'confirmed','gmail_sent_copy_verified',ident,thread)

class NearOutboxAuthority:
    """Actual signed restricted-key NEAR adapter. No provider credentials enter it."""
    def __init__(self,config):
        allowed={'network','rpc_url','chain_id','contract_id','operator_id','operator_key_file','journal','expected_code_hash'}
        if not isinstance(config,dict) or set(config)!=allowed:raise DeliveryError('Exact NEAR authority configuration required')
        self.config=dict(config);self.proc=None;self.fd=None;self.identity=sha(canonical({k:v for k,v in config.items() if k!='operator_key_file'}));self.history=[]
    def start(self):
        directory=private_directory(Path(self.config['journal']).parent)
        self.fd=os.open(str(directory/Path(self.config['journal']).name)+'.lease',os.O_RDWR|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
        st=os.fstat(self.fd)
        if not stat.S_ISREG(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid():raise DeliveryError('Unsafe NEAR bridge lease')
        try:fcntl.flock(self.fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as e:raise DeliveryError('Another NEAR bridge holds the lease') from e
        env={k:os.environ[k] for k in ('PATH','LANG','LC_ALL','TMPDIR','TZ') if k in os.environ}
        self.proc=subprocess.Popen(['node',str(ROOT/'executor/delivery_rpc.mjs')],cwd=ROOT,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1,pass_fds=(self.fd,))
        self.proc.stdin.write(canonical({'config':self.config,'lease_fd':self.fd})+'\n');self.proc.stdin.flush();r=self._read()
        if r.get('ready') is not True:self.close();raise DeliveryError('Restricted NEAR authority refused startup')
        return self
    def _read(self):
        if not select.select([self.proc.stdout],[],[],50)[0]:raise AmbiguousRequest('NEAR outcome unknown; no provider request allowed')
        line=self.proc.stdout.readline()
        if not line or len(line)>131072:raise AmbiguousRequest('NEAR bridge unavailable')
        r=json.loads(line)
        if r.get('ok') is False:
            stage=r.get('stage','unknown');kind=r.get('error_type','Unknown')
            import re
            if not re.fullmatch(r'[a-z_]{1,32}',stage) or not re.fullmatch(r'[A-Za-z_]{1,64}',kind):stage,kind='unknown','Unknown'
            raise DeliveryError('NEAR authority rejected request at '+stage+' ('+kind+')')
        return r
    def _call(self,method,args):
        if self.proc is None:raise DeliveryError('NEAR bridge not started')
        self.proc.stdin.write(canonical({'method':method,'args':args})+'\n');self.proc.stdin.flush();r=self._read()
        if r.get('tx'):self.history.append(r['tx'])
        return r
    def snapshot(self,ident):return self._call('snapshot',{'id':ident})['snapshot']
    def claim(self,args):return self._call('claim',args)['value']
    def reserve_request(self,args):
        r=self._call('reserve_request',args);value=r['value'];value['_final_near_reservation']=bool(r.get('tx') and r.get('finality')=='final');return value
    def record_receipt(self,args):return self._call('record_receipt',args)['value']
    def close(self):
        if self.proc:
            try:self.proc.stdin.close();self.proc.wait(timeout=5)
            except Exception:self.proc.kill();self.proc.wait(timeout=5)
            self.proc=None
        if self.fd is not None:os.close(self.fd);self.fd=None


def production_worker(*,authority,vault,data_dir,registry,suppression,owner_live_enable=False):
    """Explicit dormant factory. Never called by default or by draft operations.

    Live OAuth enrollment/refresh is external and unimplemented. The caller must
    supply owner-protected access tokens; every Gmail request consumes a fresh
    finalized NEAR reservation. This session never invokes this factory.
    """
    if owner_live_enable is not True or type(authority) is not NearOutboxAuthority or authority.config['network'] not in ('mainnet','testnet') or type(registry) is not CredentialRegistry or type(suppression) is not SuppressionList:raise NetworkDisabled('Explicit owner live configuration and real NEAR authority required')
    return DeliveryWorker(authority,vault,data_dir,registry,suppression,_HTTPSGmailTransport(_LIVE_SEAL,authority.identity))
