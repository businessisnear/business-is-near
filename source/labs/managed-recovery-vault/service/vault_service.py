"""Private managed recovery service; no transaction/model/worker authority.

All rights reserved. Reuses byte-identical public NEP-413 owner authentication.
Wrapping secrets are generated internally and never returned or logged.
"""
from __future__ import annotations
import base64,contextlib,fcntl,hashlib,hmac,json,os,re,secrets,stat,tempfile
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from wallet_auth import (OwnerAuthentication,NearWalletAuthority,AuthenticationError,
    _private_root,_read,_write,_account,_b58,canonical)

KINDS=('mission','task','mandate','inbox');HEX=re.compile(r'^[a-f0-9]{64}$')
ID=re.compile(r'^[A-Za-z0-9_-]{1,64}$');KEY_ID='managed-vault-v1'
def exact(value,fields):
    if not isinstance(value,dict) or set(value)!=set(fields):raise AuthenticationError('Exact vault fields required')
    return value
def text(value,limit=16384):
    if not isinstance(value,str) or not value:raise AuthenticationError('Bounded vault text required')
    try:raw=value.encode('utf-8')
    except UnicodeError as error:raise AuthenticationError('Invalid vault Unicode') from error
    if len(raw)>limit:raise AuthenticationError('Vault text exceeds bound')
    return raw
def digest(value):return hashlib.sha256(value.encode() if isinstance(value,str) else value).hexdigest()
def strict_json(raw):
    def pairs(items):
        result={}
        for key,value in items:
            if key in result:raise AuthenticationError('Duplicate JSON fields')
            result[key]=value
        return result
    try:return json.loads(raw,object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
    except Exception as error:raise AuthenticationError('Invalid bounded JSON') from error
def scope(value):
    if value.get('kind') not in KINDS or not isinstance(value.get('record_id'),str) or not HEX.fullmatch(value['record_id']) or not isinstance(value.get('commitment'),str) or not HEX.fullmatch(value['commitment']):raise AuthenticationError('Invalid recovery scope')
    return {key:value[key] for key in ('kind','record_id','commitment')}
def binding(value):
    exact(value,('schema','network','chain_id','genesis_hash','company_id','owner','code_hash','record_id','commitment','kind'))
    if type(value['schema']) is not int or value['schema']!=1 or value['network'] not in ('sandbox','testnet','mainnet') or not isinstance(value['chain_id'],str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}',value['chain_id']):raise AuthenticationError('Invalid recovery binding')
    _account(value['company_id']);_account(value['owner']);_b58(value['genesis_hash'],32);_b58(value['code_hash'],32);scope(value)
    return dict(value)

class RecoveryStore:
    """Owner-private AEAD files, atomic create-only publication and fsync ACK.

    Only NEW service keys are used. Losing an initialized wrapping key fails
    closed; it is never regenerated over existing records or an init marker.
    """
    def __init__(self,root):
        self.root=_private_root(root);self.records=_private_root(self.root/'records')
        self.key_path=self.root/'wrapping-key.v1';self.marker=self.root/'initialized.json'
        with self.lease():
            if not self.key_path.exists():
                if self.marker.exists() or any(self.records.iterdir()):raise AuthenticationError('Initialized vault wrapping key unavailable')
                fd=os.open(self.key_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
                try:os.write(fd,secrets.token_bytes(32));os.fsync(fd)
                finally:os.close(fd)
                self._sync_dir(self.root)
            key=_read(self.key_path)
            if len(key)!=32:raise AuthenticationError('Invalid protected wrapping key')
            # A visible complete key after an earlier failed fsync is not
            # durable proof. Re-confirm the SAME existing file and root on
            # EVERY startup, before any encrypted record can receive an ACK.
            self._sync_private_file(self.key_path);self._sync_dir(self.root)
            self.aead=AESGCM(key)
            if self.marker.exists():
                if strict_json(_read(self.marker))!={'schema':1,'key_id':KEY_ID}:raise AuthenticationError('Vault key lifecycle changed')
            else:_write(self.marker,canonical({'schema':1,'key_id':KEY_ID}).encode())
            self._sync_private_file(self.marker);self._sync_dir(self.root)
    @staticmethod
    def _sync_private_file(path):
        fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
        try:
            s=os.fstat(fd)
            if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077 or s.st_nlink!=1:raise AuthenticationError('Unsafe protected vault file')
            os.fsync(fd)
        finally:os.close(fd)
    @staticmethod
    def _sync_dir(path):
        fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
        try:os.fsync(fd)
        finally:os.close(fd)
    @contextlib.contextmanager
    def lease(self):
        fd=os.open(self.root/'vault.lock',os.O_RDWR|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
        try:
            s=os.fstat(fd)
            if not stat.S_ISREG(s.st_mode) or s.st_uid!=os.getuid() or s.st_mode&0o077 or s.st_nlink!=1:raise AuthenticationError('Unsafe vault lock')
            fcntl.flock(fd,fcntl.LOCK_EX);yield
        finally:os.close(fd)
    def _path(self,b):return self.records/(digest(canonical(binding(b)))+'.json')
    def _row(self,path):
        row=strict_json(_read(path));exact(row,('schema','key_id','binding','iv','ciphertext'))
        if row['schema']!=1 or row['key_id']!=KEY_ID:raise AuthenticationError('Unknown recovery key version')
        binding(row['binding'])
        if path!=self._path(row['binding']):raise AuthenticationError('Recovery path binding changed')
        return row
    def _open(self,row,b):
        if row['binding']!=b:raise AuthenticationError('Recovery owner or scope changed')
        try:
            iv=base64.b64decode(row['iv'],validate=True);cipher=base64.b64decode(row['ciphertext'],validate=True)
            if len(iv)!=12 or not 16<=len(cipher)<=16400 or base64.b64encode(iv).decode()!=row['iv'] or base64.b64encode(cipher).decode()!=row['ciphertext']:raise ValueError()
            value=self.aead.decrypt(iv,cipher,canonical(b).encode()).decode('utf-8');text(value);return value
        except Exception as error:raise AuthenticationError('Recovery authentication unavailable') from error
    def save(self,b,recovery):
        b=binding(b);raw=text(recovery);path=self._path(b)
        with self.lease():
            if path.exists():
                row=self._row(path)
                if not hmac.compare_digest(self._open(row,b).encode(),raw):raise AuthenticationError('Recovery conflict; original never overwritten')
            else:
                names=list(self.records.iterdir())
                if len(names)>=256:raise AuthenticationError('Managed recovery capacity reached')
                iv=secrets.token_bytes(12);row={'schema':1,'key_id':KEY_ID,'binding':b,'iv':base64.b64encode(iv).decode(),'ciphertext':base64.b64encode(self.aead.encrypt(iv,raw,canonical(b).encode())).decode()}
                fd,tmp=tempfile.mkstemp(prefix='.wrapped-',dir=self.records)
                try:
                    with os.fdopen(fd,'wb') as stream:stream.write(canonical(row).encode());stream.flush();os.fsync(stream.fileno())
                    # No overwrite or replace: a competing/foreign original is
                    # never replaced, even if its contents are malformed.
                    os.link(tmp,path,follow_symlinks=False)
                finally:
                    if os.path.exists(tmp):os.unlink(tmp)
            # Re-confirm BOTH existing and new complete bytes. A previous
            # visible file with failed fsync never gets an ACK from read alone.
            fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
            try:os.fsync(fd)
            finally:os.close(fd)
            self._sync_dir(self.records);row=self._row(path)
            if not hmac.compare_digest(self._open(row,b).encode(),raw):raise AuthenticationError('Durable recovery readback changed')
            return {'schema':1,'saved':True,'binding':dict(b),'kind':b['kind'],'record_id':b['record_id'],'commitment':b['commitment'],'vault_record':digest(canonical(row)),'custody':'service-wrapped','wallet_native_storage':False}
    def open(self,b):
        b=binding(b)
        with self.lease():return {'binding':b,'recovery':self._open(self._row(self._path(b)),b)}
    def list(self,identity):
        result=[]
        with self.lease():
            names=list(self.records.iterdir())
            if len(names)>256:raise AuthenticationError('Recovery inventory exceeds bound')
            for path in sorted(names):
                if not re.fullmatch(r'[a-f0-9]{64}\.json',path.name):raise AuthenticationError('Unknown recovery inventory entry')
                row=self._row(path);b=row['binding']
                if all(b.get(k)==v for k,v in identity.items()):result.append(dict(b))
        return {'bindings':result}

class ManagedRecovery:
    def __init__(self,root,origin,authority):
        self.root=_private_root(root);self.authority=authority;self.origin=origin
        # Authority is trusted host code. Public constructor validates all pins;
        # synthetic tests provide a typed no-network implementation.
        if authority.network not in ('sandbox','testnet','mainnet') or not isinstance(authority.chain_id,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}',authority.chain_id):raise AuthenticationError('Invalid reviewed authority')
        _b58(authority.genesis_hash,32)
        if not isinstance(authority.companies,dict) or not 1<=len(authority.companies)<=16:raise AuthenticationError('Reviewed company allowlist required')
        for company,code in authority.companies.items():_account(company);_b58(code,32)
        self.auth=OwnerAuthentication(self.root/'authentication',origin,authority);self.store=RecoveryStore(self.root/'encrypted-recovery')
    def public(self):return {'schema':1,'origin':self.origin,'network':self.authority.network,'chain_id':self.authority.chain_id,'genesis_hash':self.authority.genesis_hash,'companies':dict(self.authority.companies),'signs_transactions':False,'calls_models':False,'custody':'service-wrapped','wallet_native_storage':False}
    def identity(self,session,csrf,company):
        identity=self.auth.authorize(session,csrf,company);b=identity['boundary']
        if b['genesis_hash']!=self.authority.genesis_hash or b['chain_id']!=self.authority.chain_id or b['code_hash']!=self.authority.companies.get(company):raise AuthenticationError('Reviewed recovery boundary changed')
        return {'network':self.authority.network,'chain_id':b['chain_id'],'genesis_hash':b['genesis_hash'],'company_id':company,'owner':identity['account_id'],'code_hash':b['code_hash']}
    def operation(self,action,body,session,csrf):
        fields=('company_id',) if action=='list' else ('company_id','kind','record_id','commitment')+(('recovery',) if action=='save' else ('actual_id',) if action=='context' else ())
        exact(body,fields);company=_account(body['company_id'])
        if action not in ('save','open','list','context'):raise AuthenticationError('Unknown recovery operation')
        if action=='save':text(body['recovery'])
        i=self.identity(session,csrf,company)
        if action=='list':result=self.store.list(i)
        else:
            b=binding({'schema':1,**i,**scope(body)})
            if action=='save':result=self.store.save(b,body['recovery'])
            elif action=='open':result=self.store.open(b)
            else:result=self.context(b,body['actual_id'],session,csrf)
        if self.identity(session,csrf,company)!=i:raise AuthenticationError('Owner changed during recovery operation')
        return result
    def context(self,b,actual_id,session,csrf):
        if not isinstance(actual_id,str) or not 1<=len(actual_id)<=64:raise AuthenticationError('Invalid original record identifier')
        if digest('recovery-id-v1\0'+b['kind']+'\0'+actual_id)!=b['record_id']:raise AuthenticationError('Original record identifier differs')
        identity=self.auth.authorize(session,csrf,b['company_id']);anchor=identity['boundary'];company=b['company_id']
        if b['kind']=='mission':
            if actual_id!=company:raise AuthenticationError('Mission belongs to another company')
            method='company_state';args={}
        elif b['kind']=='task' and ID.fullmatch(actual_id):method='company_task';args={'id':actual_id}
        else:raise AuthenticationError('Context is supported for mission/task only')
        view=self.authority._rpc('query',{'request_type':'call_function','account_id':company,'method_name':method,'args_base64':base64.b64encode(canonical(args).encode()).decode(),'block_id':anchor['block_hash']})
        raw=view.get('result')
        if view.get('block_hash')!=anchor['block_hash'] or view.get('block_height')!=anchor['block_height'] or not isinstance(raw,list) or len(raw)>65536 or any(type(v) is not int or not 0<=v<=255 for v in raw):raise AuthenticationError('Recovery context escaped its FINAL boundary')
        value=strict_json(bytes(raw))
        if not isinstance(value,dict):raise AuthenticationError('Original record unavailable')
        if b['kind']=='task':
            if value.get('scope_hash')!=b['commitment'] or value.get('id',actual_id)!=actual_id:raise AuthenticationError('Task scope changed')
            value={**value,'id':actual_id};context={'company_id':company,'task_id':actual_id,'task':value}
        else:
            if value.get('owner')!=b['owner'] or not isinstance(value.get('idea_hash'),str) or not HEX.fullmatch(value['idea_hash']) or not isinstance(value.get('goal_hash'),str) or not HEX.fullmatch(value['goal_hash']) or digest('mission-commit-v1\0'+value['idea_hash']+'\0'+value['goal_hash'])!=b['commitment']:raise AuthenticationError('Mission commitments changed')
            context={'company_id':company,'company':value}
        return {'binding':dict(b),'context':context}
