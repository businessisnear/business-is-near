"""NEP-413 owner authentication. Authentication never signs a transaction.

HTTP/cookie handling belongs to the host. It must supply a same-origin protected
pre-auth browser binding, enforce Origin, and keep returned session tokens out of
URLs, logs, exports and browser storage. Each use rechecks FINAL key/owner pins.
"""
from __future__ import annotations
import base64
import contextlib
import fcntl
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import stat
import struct
import tempfile
import time
from urllib.parse import urlsplit
from urllib.request import Request,build_opener,ProxyHandler,HTTPRedirectHandler
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

TAG=2**31+413
ACCOUNT=re.compile(r'^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$')
TOKEN=re.compile(r'^[A-Za-z0-9_-]{43}$')
ALPHABET='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
class AuthenticationError(ValueError):pass

def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True)
def sha(value):return hashlib.sha256(value.encode() if isinstance(value,str) else value).hexdigest()
def _account(value):
    if not isinstance(value,str) or not ACCOUNT.fullmatch(value):raise AuthenticationError('Invalid NEAR identity')
    return value
def _token(value):
    if not isinstance(value,str) or not TOKEN.fullmatch(value):raise AuthenticationError('Invalid protected browser/session token')
    try:raw=base64.urlsafe_b64decode(value+'=')
    except Exception as e:raise AuthenticationError('Invalid token') from e
    if len(raw)!=32 or base64.urlsafe_b64encode(raw).decode().rstrip('=')!=value:raise AuthenticationError('Noncanonical token')
    return value
def _b58(value,length):
    if not isinstance(value,str) or not 1<=len(value)<=100:raise AuthenticationError('Invalid base58 identity')
    number=0
    for character in value:
        if character not in ALPHABET:raise AuthenticationError('Invalid base58 identity')
        number=number*58+ALPHABET.index(character)
    raw=b'\0'*(len(value)-len(value.lstrip('1')))+(number.to_bytes((number.bit_length()+7)//8,'big') if number else b'')
    if len(raw)!=length:raise AuthenticationError('Invalid key/hash size')
    return raw
def public_key(value):
    if not isinstance(value,str) or not value.startswith('ed25519:'):raise AuthenticationError('NEP-413 requires an ed25519 full-access key')
    return _b58(value[8:],32)
def _string(value,max_bytes):
    if not isinstance(value,str):raise AuthenticationError('Invalid NEP-413 text')
    try:raw=value.encode('utf-8')
    except UnicodeError as e:raise AuthenticationError('Invalid Unicode') from e
    if not raw or len(raw)>max_bytes or any(ord(c)<32 or ord(c)==127 for c in value):raise AuthenticationError('Invalid bounded NEP-413 text')
    return struct.pack('<I',len(raw))+raw

def serialize_nep413(message,nonce,recipient,callback_url=None):
    if type(nonce) is not bytes or len(nonce)!=32:raise AuthenticationError('Exact 32-byte nonce required')
    result=struct.pack('<I',TAG)+_string(message,2000)+nonce+_string(recipient,256)
    return result+(b'\x00' if callback_url is None else b'\x01'+_string(callback_url,512))

def verify_signature(challenge,signed):
    if not isinstance(signed,dict) or set(signed)!={'accountId','publicKey','signature','state'}:raise AuthenticationError('Exact signed message fields required')
    if signed['accountId']!=challenge['account_id'] or signed['state']!=challenge['state']:raise AuthenticationError('Signed identity/state differs from the challenge')
    key=public_key(signed['publicKey'])
    try:
        if not isinstance(signed['signature'],str) or len(signed['signature'])!=88:raise ValueError()
        signature=base64.b64decode(signed['signature'],validate=True)
        if len(signature)!=64 or base64.b64encode(signature).decode()!=signed['signature']:raise ValueError()
        nonce=base64.b64decode(challenge['nonce'],validate=True)
        payload=serialize_nep413(challenge['message'],nonce,challenge['recipient'],challenge['callback_url'])
        Ed25519PublicKey.from_public_bytes(key).verify(signature,hashlib.sha256(payload).digest())
    except Exception as e:raise AuthenticationError('Wallet signature is invalid') from e
    return signed['publicKey']

def _private_root(path):
    p=Path(path).absolute()
    if p.resolve()!=p:raise AuthenticationError('Private authentication path cannot traverse symlinks')
    p.mkdir(mode=0o700,parents=True,exist_ok=True);s=p.lstat()
    if not stat.S_ISDIR(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077:raise AuthenticationError('Private owner-controlled authentication directory required')
    return p
def _read(path):
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077 or s.st_nlink!=1 or s.st_size>262144:raise AuthenticationError('Unsafe authentication state')
        with os.fdopen(fd,'rb',closefd=False) as f:return f.read(262145)
    finally:os.close(fd)
def _write(path,value):
    if path.is_symlink():raise AuthenticationError('Unsafe authentication state link')
    fd,name=tempfile.mkstemp(prefix='.auth-',dir=path.parent)
    try:
        with os.fdopen(fd,'wb') as f:f.write(value);f.flush();os.fsync(f.fileno())
        os.replace(name,path);directory=os.open(path.parent,os.O_RDONLY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if os.path.exists(name):os.unlink(name)

class OwnerAuthentication:
    """Durable one-use challenges and hashed tokens for a trusted RPC authority.

    authority.snapshot(company, account, key) must fetch one FINAL block, verify
    configured network/genesis/code and return the exact key permission and owner.
    This injected interface is trusted host code, never request/model supplied.
    """
    def __init__(self,root,origin,authority,*,clock=time.time):
        parsed=urlsplit(origin)
        local=parsed.scheme=='http' and parsed.hostname=='127.0.0.1'
        if not isinstance(origin,str) or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path or not parsed.hostname or parsed.scheme!='https' and not local or origin.endswith('/'):raise AuthenticationError('Exact HTTPS origin or explicit numeric loopback required')
        self.root=_private_root(root);self.origin=origin;self.authority=authority;self.clock=clock
        self.path=self.root/'authentication.json';self.secret_path=self.root/'authentication.secret';self.lock_path=self.root/'authentication.lock'
        with self._lease():
            if not self.secret_path.exists():
                fd=os.open(self.secret_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
                with os.fdopen(fd,'wb') as f:f.write(secrets.token_bytes(32));f.flush();os.fsync(f.fileno())
            self.secret=_read(self.secret_path)
            if len(self.secret)!=32:raise AuthenticationError('Invalid authentication secret')
            if not self.path.exists():self._save({'schema':1,'origin':origin,'challenges':{},'sessions':{}})
            self._load()
    @contextlib.contextmanager
    def _lease(self):
        fd=os.open(self.lock_path,os.O_RDWR|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
        try:
            s=os.fstat(fd)
            if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077 or s.st_nlink!=1:raise AuthenticationError('Unsafe authentication lease')
            fcntl.flock(fd,fcntl.LOCK_EX);yield
        finally:os.close(fd)
    def _load(self):
        value=json.loads(_read(self.path))
        if not isinstance(value,dict) or set(value)!={'schema','origin','challenges','sessions'} or value['schema']!=1 or value['origin']!=self.origin or not isinstance(value['challenges'],dict) or not isinstance(value['sessions'],dict):raise AuthenticationError('Authentication state identity changed')
        return value
    def _save(self,value):_write(self.path,canonical(value).encode())
    def _hashed(self,value):return hmac.new(self.secret,_token(value).encode(),hashlib.sha256).hexdigest()
    def _now(self):
        now=self.clock()
        if type(now) not in (int,float) or not 0<=now<2**53:raise AuthenticationError('Invalid authentication clock')
        return int(now)
    def begin(self,company_id,account_id,browser_binding):
        _account(company_id);_account(account_id);binding=self._hashed(browser_binding);now=self._now()
        state=secrets.token_urlsafe(32);nonce=secrets.token_bytes(32)
        with self._lease():
            data=self._load()
            for name in ('challenges','sessions'):data[name]={k:v for k,v in data[name].items() if v['expires_at']>now}
            if len(data['challenges'])>=128 or len(data['sessions'])>=128:raise AuthenticationError('Authentication capacity reached')
            if sum(v['company_id']==company_id and v['account_id']==account_id for v in data['challenges'].values())>=4:raise AuthenticationError('Too many pending identity challenges')
            challenge={'state':state,'company_id':company_id,'account_id':account_id,'nonce':base64.b64encode(nonce).decode(),'recipient':self.origin,'callback_url':self.origin+'/wallet-auth-callback.html','issued_at':now,'expires_at':now+120}
            challenge['message']='Sign in to the private business workspace. Company: '+company_id+'. Account: '+account_id+'. Origin: '+self.origin+'. Expires at Unix '+str(challenge['expires_at'])+'. This grants no transactions, payments or provider actions.'
            data['challenges'][state]={**challenge,'browser_binding_hash':binding};self._save(data)
        return challenge
    def _boundary(self,company,account,key):
        snap=self.authority.snapshot(company,account,key)
        required={'chain_id','genesis_hash','block_hash','block_height','company_id','code_hash','owner','account_id','public_key','permission'}
        if not isinstance(snap,dict) or set(snap)!=required or snap['company_id']!=company or snap['owner']!=account or snap['account_id']!=account or snap['public_key']!=key or snap['permission']!='FullAccess':raise AuthenticationError('Current FINAL owner/full-access key required')
        if not isinstance(snap['chain_id'],str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}',snap['chain_id']) or type(snap['block_height']) is not int or snap['block_height']<0:raise AuthenticationError('Invalid FINAL identity boundary')
        for name in ('genesis_hash','block_hash','code_hash'):_b58(snap[name],32)
        return snap
    def exchange(self,signed,browser_binding):
        binding=self._hashed(browser_binding);now=self._now()
        if not isinstance(signed,dict) or not isinstance(signed.get('state'),str):raise AuthenticationError('Missing signed state')
        with self._lease():
            data=self._load();record=data['challenges'].get(signed['state'])
            if not record or record['issued_at']>now or record['expires_at']<=now or not hmac.compare_digest(record['browser_binding_hash'],binding):raise AuthenticationError('Challenge expired, consumed or belongs to another browser')
            key=verify_signature(record,signed)
            # Consume before RPC so an interrupted verification never makes a
            # signed message reusable. The user can request a fresh challenge.
            del data['challenges'][signed['state']];self._save(data)
            snap=self._boundary(record['company_id'],record['account_id'],key)
            finished=self._now()
            if finished<now or finished>=record['expires_at']:raise AuthenticationError('Challenge expired during identity verification')
            data['sessions']={k:v for k,v in data['sessions'].items() if v['expires_at']>now}
            if len(data['sessions'])>=128:raise AuthenticationError('Authentication session capacity reached')
            token=secrets.token_urlsafe(32);csrf=secrets.token_urlsafe(32)
            session={'company_id':record['company_id'],'account_id':record['account_id'],'public_key':key,'issued_at':finished,'expires_at':finished+900,'csrf_hash':self._hashed(csrf),'boundary':snap}
            data['sessions'][self._hashed(token)]=session;self._save(data)
        return {'token':token,'csrf':csrf,'company_id':session['company_id'],'account_id':session['account_id'],'expires_at':session['expires_at'],'boundary':snap}
    def authorize(self,token,csrf,company_id):
        key=self._hashed(token);csrf_hash=self._hashed(csrf);now=self._now();_account(company_id)
        with self._lease():
            data=self._load();session=data['sessions'].get(key)
            if not session or session['issued_at']>now or session['expires_at']<=now or session['company_id']!=company_id or not hmac.compare_digest(session['csrf_hash'],csrf_hash):raise AuthenticationError('Session is absent, expired or belongs to another workspace')
            snap=self._boundary(company_id,session['account_id'],session['public_key'])
            finished=self._now()
            if finished<now or finished>=session['expires_at']:raise AuthenticationError('Session expired during identity verification')
            previous=session['boundary']
            if any(snap[k]!=previous[k] for k in ('chain_id','genesis_hash','company_id','code_hash','owner','account_id','public_key')) or snap['block_height']<previous['block_height']:raise AuthenticationError('Authenticated company/network identity changed')
            session['boundary']=snap;self._save(data)
        return {'company_id':company_id,'account_id':session['account_id'],'role':'owner','boundary':snap}
    def logout(self,token):
        key=self._hashed(token)
        with self._lease():
            data=self._load();data['sessions'].pop(key,None);self._save(data)


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):raise AuthenticationError('Wallet RPC redirect refused')


class NearWalletAuthority:
    """Fixed-endpoint read-only RPC, with independently configured code/genesis.

    sandbox=True explicitly permits only numeric loopback. Public configurations
    use the exact official network RPC. No caller/model supplies a URL or pin.
    """
    def __init__(self,*,network,chain_id,rpc_url,genesis_height,genesis_hash,companies,sandbox=False):
        if network not in ('testnet','mainnet','sandbox') or type(sandbox) is not bool or sandbox!=(network=='sandbox'):raise AuthenticationError('Explicit wallet RPC network required')
        if not isinstance(chain_id,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}',chain_id) or network!='sandbox' and chain_id!=network:raise AuthenticationError('Expected chain identity required')
        if not isinstance(rpc_url,str):raise AuthenticationError('Fixed wallet RPC required')
        parsed=urlsplit(rpc_url)
        local=parsed.scheme=='http' and parsed.hostname=='127.0.0.1' and parsed.port is not None and 1024<=parsed.port<=65535 and parsed.netloc=='127.0.0.1:'+str(parsed.port) and not parsed.path and not parsed.query and not parsed.fragment
        if network=='sandbox' and not local or network!='sandbox' and rpc_url!='https://rpc.'+network+'.near.org':raise AuthenticationError('Unapproved wallet RPC target')
        if type(genesis_height) is not int or genesis_height<0:raise AuthenticationError('Expected genesis height required')
        _b58(genesis_hash,32)
        if not isinstance(companies,dict) or not 1<=len(companies)<=16:raise AuthenticationError('Reviewed company/code allowlist required')
        for company,code in companies.items():_account(company);_b58(code,32)
        self.network=network;self.chain_id=chain_id;self.rpc_url=rpc_url;self.genesis_height=genesis_height;self.genesis_hash=genesis_hash;self.companies=dict(companies);self.sequence=0
        self.opener=build_opener(ProxyHandler({}),_NoRedirect())
    def _rpc(self,method,params):
        if method not in ('status','block','query'):raise AuthenticationError('Read-only wallet RPC required')
        self.sequence+=1;ident=self.sequence
        body=canonical({'jsonrpc':'2.0','id':ident,'method':method,'params':params}).encode()
        request=Request(self.rpc_url,data=body,headers={'Content-Type':'application/json'},method='POST')
        try:
            with self.opener.open(request,timeout=8) as response:
                if response.status!=200 or response.geturl()!=self.rpc_url:raise AuthenticationError('Wallet RPC response target changed')
                raw=response.read(1048577)
                if len(raw)>1048576:raise AuthenticationError('Wallet RPC response too large')
            result=json.loads(raw)
            if not isinstance(result,dict) or result.get('jsonrpc')!='2.0' or result.get('id')!=ident or 'error' in result or not isinstance(result.get('result'),dict):raise AuthenticationError('Wallet RPC response rejected')
            return result['result']
        except AuthenticationError:raise
        except Exception as e:raise AuthenticationError('Current wallet RPC identity is unavailable') from e
    def snapshot(self,company,account,key):
        _account(company);_account(account);public_key(key)
        if company not in self.companies:raise AuthenticationError('Company is not enabled for this private workspace')
        status=self._rpc('status',[])
        if status.get('chain_id')!=self.chain_id:raise AuthenticationError('Wallet RPC chain identity changed')
        genesis=self._rpc('block',{'block_id':self.genesis_height})
        if genesis.get('header',{}).get('hash')!=self.genesis_hash or genesis.get('header',{}).get('height')!=self.genesis_height:raise AuthenticationError('Wallet RPC genesis changed')
        block=self._rpc('block',{'finality':'final'});header=block.get('header',{});block_hash=header.get('hash');height=header.get('height');_b58(block_hash,32)
        if type(height) is not int or height<self.genesis_height:raise AuthenticationError('Invalid wallet FINAL height')
        def query(params):
            value=self._rpc('query',{**params,'block_id':block_hash})
            if value.get('block_hash')!=block_hash or value.get('block_height')!=height:raise AuthenticationError('Wallet RPC read escaped its FINAL block')
            return value
        code=query({'request_type':'view_account','account_id':company})
        if code.get('code_hash')!=self.companies[company]:raise AuthenticationError('Private workspace company code changed')
        state=query({'request_type':'call_function','account_id':company,'method_name':'company_state','args_base64':base64.b64encode(b'{}').decode()})
        data=state.get('result')
        if not isinstance(data,list) or len(data)>32768 or any(type(x) is not int or not 0<=x<=255 for x in data):raise AuthenticationError('Invalid company identity response')
        try:owner=_account(json.loads(bytes(data))['owner'])
        except Exception as e:raise AuthenticationError('Invalid company owner response') from e
        permission=query({'request_type':'view_access_key','account_id':account,'public_key':key}).get('permission')
        return {'chain_id':self.chain_id,'genesis_hash':self.genesis_hash,'block_hash':block_hash,'block_height':height,'company_id':company,'code_hash':self.companies[company],'owner':owner,'account_id':account,'public_key':key,'permission':permission}
