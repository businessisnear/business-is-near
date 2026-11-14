"""Opt-in, bounded NEAR AI HTTP client. HTTPS alone does not verify TEE.

Catalog snapshot 2026-11-08: https://near.ai/models/Qwen/Qwen3-VL-30B-A3B-Instruct
$0.15/$0.55 per million input/output; https://near.ai/models/Qwen/Qwen3.8-27B
$0.04/$1.35. The latter is conservatively reserved at $0.44/$3.30. Rates may
change: local caps are estimates, not provider-side billing guarantees.
"""
import datetime
import fcntl
import hashlib
import hmac
import http.client
import json
import math
import os
from pathlib import Path
import re
import stat
import tempfile
import threading
import socket
import secrets
from app.model_schema import response_format

MODELS={'economy':('Qwen/Qwen3-VL-30B-A3B-Instruct',150,550),'expensive':('Qwen/Qwen3.8-27B',40,1350)} # USD nanos per token
DEFAULT={'enabled':False,'scope_consent':False,'model':'economy','allow_expensive':False,'per_call_nanos':10_000_000,'daily_nanos':20_000_000,'run_nanos':50_000_000,'max_input_tokens':4608,'max_output_tokens':512,'max_calls_per_job':2,'max_calls_per_day':4}
_NAME=re.compile(r'^[A-Za-z0-9_-]{1,100}$')

def _completion_text(response,model,*,cloud=False):
    """Cloud metadata is mandatory on the wire; native adapters validate theirs.

    The injected native transport interface can omit Cloud-only metadata, but
    explicit refusal, truncation, tool instructions or mismatched metadata are
    never accepted. Content is preserved exactly for the encrypted cache.
    """
    if not isinstance(response,dict):raise ValueError('Invalid completion response')
    choices=response.get('choices')
    if not isinstance(choices,list) or len(choices)!=1 or not isinstance(choices[0],dict):raise ValueError('One completion required')
    choice=choices[0];message=choice.get('message')
    if not isinstance(message,dict):raise ValueError('Assistant content required')
    if (cloud or 'model' in response) and response.get('model')!=model:raise ValueError('Completion model changed')
    if (cloud or 'finish_reason' in choice) and choice.get('finish_reason')!='stop':raise ValueError('Completion did not finish')
    if (cloud or 'role' in message) and message.get('role')!='assistant':raise ValueError('Assistant role required')
    if 'index' in choice and (type(choice['index']) is not int or choice['index']!=0):raise ValueError('Invalid completion index')
    if message.get('tool_calls') not in (None,[]) or message.get('function_call') is not None or message.get('refusal') not in (None,''):
        raise ValueError('Tool calls and refusals are not completion content')
    text=message.get('content')
    if not isinstance(text,str) or not text.strip() or len(text.encode('utf-8'))>16384:raise ValueError('Bounded completion content required')
    return text

def _cloud_response(raw,model):
    def unique(pairs):
        result={}
        for key,value in pairs:
            if key in result:raise ValueError('Duplicate provider field')
            result[key]=value
        return result
    def constant(unused):raise ValueError('Nonfinite provider value')
    def finite(raw):
        value=float(raw)
        if not math.isfinite(value):raise ValueError('Nonfinite provider value')
        return value
    response=json.loads(raw,object_pairs_hook=unique,parse_constant=constant,parse_float=finite)
    _completion_text(response,model,cloud=True)
    return response

def _transaction(tx):
    if not isinstance(tx,dict):return None
    amount=tx.get('tokens_burnt');receipts=tx.get('receipts')
    if not isinstance(amount,str) or not re.fullmatch(r'0|[1-9][0-9]*',amount) or not isinstance(tx.get('hash'),str) or not tx['hash'] or not isinstance(receipts,list) or not all(isinstance(x,str) for x in receipts):return None
    return {k:tx.get(k) for k in ('method','job_id','hash','signer','receiver','gas_burnt','tokens_burnt','receipts')}

def _http(payload,key):
    conn=http.client.HTTPSConnection('cloud-api.near.ai',443,timeout=20)
    active_socket=[None]
    def abort():
        try:
            sock=conn.sock or active_socket[0]
            if sock:sock.shutdown(socket.SHUT_RDWR)
        except OSError: pass
    timer=threading.Timer(20,abort);timer.daemon=True;timer.start()
    try:
        conn.request('POST','/v1/chat/completions',body=json.dumps(payload,separators=(',',':')).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','Accept':'application/json'})
        active_socket[0]=conn.sock  # HTTPConnection may clear .sock on Connection: close.
        response=conn.getresponse();raw=response.read(131073)
        if response.status!=200 or len(raw)>131072: raise ValueError('Provider request failed')
        return _cloud_response(raw,payload['model'])
    finally: timer.cancel();conn.close()

class NearAIClient:
    def __init__(self,ledger_path,protect,unprotect,transport=None,key_provider=None,authority=None,identity_key=None):
        self.path=Path(ledger_path)
        if not self.path.is_absolute():raise ValueError('Ledger path must be absolute')
        self.path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        st=self.path.parent.lstat()
        if not stat.S_ISDIR(st.st_mode) or st.st_mode & 0o077 or st.st_uid!=os.getuid():raise ValueError('Ledger directory must be private')
        if not callable(protect) or not callable(unprotect):raise ValueError('Encrypted cache callbacks required')
        self.protect,self.unprotect,self.transport=protect,unprotect,transport or _http
        self.authority=authority
        if identity_key is not None and (not isinstance(identity_key,str) or len(identity_key)<16 or len(identity_key)>256):raise ValueError('Invalid private identity key')
        self.identity_key=identity_key
        self.key_provider=key_provider or (lambda: os.environ.get('NEAR_AI_API_KEY') or os.environ.get('NEARAI_API_KEY'))
        self.lock_path=self.path.with_name(self.path.name+'.lock')
        self.marker_path=self.path.with_name(self.path.name+'.identity')
        self._initialize_ledger()

    def _lock(self):
        fd=os.open(self.lock_path,os.O_CREAT|os.O_RDWR|getattr(os,'O_NOFOLLOW',0),0o600)
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid():os.close(fd);raise ValueError('Unsafe ledger lock')
        fcntl.flock(fd,fcntl.LOCK_EX);return fd
    def _marker(self):
        fd=os.open(self.marker_path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
        try:
            st=os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid() or st.st_size>128:raise ValueError('Unsafe ledger identity')
            value=os.read(fd,129).decode('ascii')
            if not re.fullmatch(r'[a-f0-9]{64}',value):raise ValueError('Invalid ledger identity')
            return value
        finally:os.close(fd)
    def _initialize_ledger(self):
        # A missing ledger after provisioning is not a new zero-spend account.
        # The sentinel detects individual file loss or substitution, not rollback
        # or loss of the entire volume; a provider-side cap remains mandatory.
        fd=self._lock()
        try:
            try:identity=self._marker()
            except FileNotFoundError:
                identity=secrets.token_hex(32)
                try:data=self._read(legacy=True)
                except FileNotFoundError:data={'policy':dict(DEFAULT),'calls':{}}
                if 'identity' in data:
                    raise ValueError('Provisioned ledger identity marker is missing; reconcile the original ledger')
                data['policy']=dict(data['policy'],enabled=False,scope_consent=False,allow_expensive=False)
                data['identity']=identity;self._write(data)
                marker_fd=os.open(self.marker_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
                with os.fdopen(marker_fd,'w') as marker:marker.write(identity);marker.flush();os.fsync(marker.fileno())
                directory=os.open(self.path.parent,os.O_RDONLY)
                try:os.fsync(directory)
                finally:os.close(directory)
            self._read()
        finally:os.close(fd)
    def _read(self,legacy=False):
        try: fd=os.open(self.path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
        except FileNotFoundError:raise
        try:
            st=os.fstat(fd)
            if not stat.S_ISREG(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid() or st.st_size>4_000_000:raise ValueError('Unsafe ledger')
            with os.fdopen(fd,'r',closefd=False) as f: data=json.load(f)
            valid_keys=({'policy','calls'},{'policy','calls','identity'},{'policy','calls','identity','policy_transactions','policy_fees_incomplete'}) if legacy else ({'policy','calls','identity'},{'policy','calls','identity','policy_transactions','policy_fees_incomplete'})
            if not isinstance(data,dict) or set(data) not in valid_keys or not isinstance(data['calls'],dict) or not isinstance(data['policy'],dict):raise ValueError('Invalid ledger')
            if not legacy and data.get('identity')!=self._marker():raise ValueError('Ledger identity mismatch')
            return data
        finally:os.close(fd)
    def _write(self,data):
        raw=json.dumps(data,separators=(',',':')).encode()
        if len(raw)>4_000_000:raise ValueError('Ledger full')
        fd,tmp=tempfile.mkstemp(dir=self.path.parent,prefix='.near-ai-')
        try:
            with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
            if self.path.is_symlink():raise ValueError('Unsafe ledger')
            os.replace(tmp,self.path)
            d=os.open(self.path.parent,os.O_RDONLY)
            try:os.fsync(d)
            finally:os.close(d)
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
    @staticmethod
    def validate_policy(policy):
        if not isinstance(policy,dict) or set(policy)!=set(DEFAULT):raise ValueError('Complete policy required')
        for k in ('enabled','scope_consent','allow_expensive'):
            if type(policy[k]) is not bool:raise ValueError('Invalid consent')
        if policy['model'] not in MODELS or (policy['enabled'] and not policy['scope_consent']) or (policy['model']=='expensive' and not policy['allow_expensive']):raise ValueError('Explicit model and scope consent required')
        for k in ('per_call_nanos','daily_nanos','run_nanos','max_input_tokens','max_output_tokens','max_calls_per_job','max_calls_per_day'):
            if type(policy[k]) is not int or not 1<=policy[k]<=DEFAULT[k]:raise ValueError('Limit exceeds default ceiling')
        return dict(policy)
    def configure(self,policy):
        policy=self.validate_policy(policy)
        # Revocation reaches the contract even if a request holds the local lock.
        policy_tx=self.authority.configure(policy) if self.authority is not None else None
        fd=self._lock()
        try:
            d=self._read()
            if self.authority is not None:
                tx=_transaction(policy_tx);history=d.setdefault('policy_transactions',[])
                if tx is None:d['policy_fees_incomplete']=True
                else:history.append(tx)
                if len(history)>100:history.pop(0);d['policy_fees_incomplete']=True
                d.setdefault('policy_fees_incomplete',False)
            d['policy']=dict(policy);self._write(d)
        finally:os.close(fd)
        return self.status()
    def status(self):
        # Atomic rename gives readers a consistent pre/post-write snapshot.
        d=self._read();today=datetime.datetime.now(datetime.timezone.utc).date().isoformat();calls=list(d['calls'].values())
        from app.cloud_media_client import budget_entries
        try:media_calls=budget_entries(self.path);media_ledger_available=True;calls+=media_calls
        except (OSError,ValueError):media_calls=[];media_ledger_available=False
        try:configured=bool(self.key_provider())
        except Exception:configured=False
        local_policy=dict(d['policy']);effective=dict(local_policy);authority_ok=None;chain_policy=None
        if not media_ledger_available:effective['enabled']=False
        if self.authority is not None:
            try:
                chain_policy=self.authority.status();authority_ok=all(chain_policy.get(k)==v for k,v in self.authority.translate(local_policy).items())
                if authority_ok and local_policy['enabled']:self.authority.check(local_policy)
                if not authority_ok:effective['enabled']=False
            except Exception:authority_ok=False;effective['enabled']=False
        policy_txs=d.get('policy_transactions',[]);operator_txs=[tx for x in calls for tx in (x.get('reserve_tx'),x.get('complete_tx')) if tx is not None]
        incomplete=bool(d.get('policy_fees_incomplete')) or any(x.get('status')!='complete' or x.get('reserve_tx') is None or x.get('complete_tx') is None for x in calls)
        if self.authority is not None and isinstance(chain_policy,dict) and chain_policy.get('version',0)>len(policy_txs):incomplete=True
        return {'policy':effective,'local_policy':local_policy,'chain_policy':chain_policy,'chain_authority_available':authority_ok,'key_configured':configured,'calls_today':sum(x['day']==today for x in calls),'model_calls':len(calls),'reserved_or_spent_today_nanos':sum(x['charge'] for x in calls if x['day']==today),'reserved_or_spent_run_nanos':sum(x['charge'] for x in calls),'estimated_spent_nanos':sum(x.get('estimated_cost_nanos',0) for x in calls),'known_prompt_tokens':sum(x.get('usage',{}).get('prompt_tokens',0) for x in calls),'known_completion_tokens':sum(x.get('usage',{}).get('completion_tokens',0) for x in calls),'known_reasoning_tokens':sum(x.get('usage',{}).get('reasoning_tokens',0) for x in calls),'unresolved_calls':sum(x['status']=='unknown' for x in calls),'chain_owner_policy_gas_yocto':str(sum(int(x['tokens_burnt']) for x in policy_txs)),'chain_operator_gas_yocto':str(sum(int(x['tokens_burnt']) for x in operator_txs)),'chain_tx_fees_unknown':incomplete,'chain_policy_transactions':policy_txs,'chain_operator_transactions':operator_txs,'cloud_media_ledger_available':media_ledger_available,'cloud_media_calls':len(media_calls),'provider_cost_unknown_calls':sum(x.get('provider_cost_unknown') is True for x in calls),'billing_estimate':True,'provider_rate_snapshot':'2026-11-08; actual provider billing and current prices may differ','verified_attestation':False}
    def reconcile_staged(self,call_id):
        """Read-only chain commitment recovery; never sends inference/completion.

        Operator first reconciles any original RPC pending hash separately.
        A legacy unknown without an encrypted staged cache is unrecoverable here.
        Returned metadata contains no decrypted answer or private recovery key.
        """
        if not isinstance(call_id,str) or not _NAME.fullmatch(call_id):raise ValueError('Invalid original call identifier')
        fd=self._lock()
        try:
            d=self._read();entry=d['calls'].get(call_id)
            if not isinstance(entry,dict) or entry.get('status')!='unknown' or self.authority is None:
                return {'ok':False,'reason':'staged_cache_unavailable'}
            cache=entry.get('staged_cache');commitment=entry.get('staged_cache_sha256')
            if not isinstance(cache,str) or not 1<=len(cache)<=8192 or not isinstance(commitment,str) or hashlib.sha256(cache.encode()).hexdigest()!=commitment:
                return {'ok':False,'reason':'staged_cache_unavailable'}
            try:
                # This callback is a read-only ai_call view, not complete().
                self.authority.check_cache(call_id,cache)
                result=json.loads(self.unprotect(cache))
                if not isinstance(result,dict) or set(result)!={'text','usage','model','estimated_cost_nanos','verified_attestation'}:raise ValueError()
                model=entry.get('model')
                if model not in MODELS or result['model']!=MODELS[model][0] or result['verified_attestation'] is not False:raise ValueError()
                if not isinstance(result['text'],str) or not result['text'] or len(result['text'].encode())>16384:raise ValueError()
                usage=result['usage']
                if not isinstance(usage,dict) or set(usage)!={'prompt_tokens','completion_tokens','reasoning_tokens','total_tokens'} or any(type(v) is not int or v<0 for v in usage.values()):raise ValueError()
                i,o=usage['prompt_tokens'],usage['completion_tokens']
                if i>DEFAULT['max_input_tokens'] or o>DEFAULT['max_output_tokens'] or usage['total_tokens']!=i+o or usage['reasoning_tokens']>o:raise ValueError()
                cost=i*MODELS[model][1]+o*MODELS[model][2]
                if type(result['estimated_cost_nanos']) is not int or result['estimated_cost_nanos']!=cost or cost>entry['charge']:raise ValueError()
            except Exception:return {'ok':False,'reason':'staged_commitment_unconfirmed'}
            entry.update(status='complete',estimated_cost_nanos=cost,usage=usage,cache=cache)
            entry.pop('staged_cache',None);entry.pop('staged_cache_sha256',None)
            self._write(d)
            return {'ok':True,'recovered':True,'cached':True,'call_id':call_id}
        finally:os.close(fd)
    def complete(self,cache_key,messages,job_id):
        if not isinstance(cache_key,str) or not _NAME.fullmatch(cache_key) or not isinstance(job_id,str) or not _NAME.fullmatch(job_id):raise ValueError('Invalid call or job identifier')
        if not isinstance(messages,list) or not 1<=len(messages)<=8:raise ValueError('Invalid messages')
        for m in messages:
            if not isinstance(m,dict) or set(m)!={'role','content'} or m['role'] not in ('system','user') or not isinstance(m['content'],str):raise ValueError('Invalid message')
        encoded=json.dumps(messages,ensure_ascii=False,separators=(',',':')).encode('utf-8')
        if len(encoded)>4096:raise ValueError('Prompt exceeds limit')
        output_format=response_format(messages)
        # The fixed JSON-object hint fits inside existing framing. A schema may
        # add provider input tokens: reserve its complete serialized descriptor
        # as well, without raising the owner's input/count/spend ceilings.
        schema_bytes=(len(json.dumps(output_format,ensure_ascii=False,separators=(',',':')).encode())
                      if output_format['type']=='json_schema' else 0)
        input_bound=len(encoded)+schema_bytes+256;prompt_hash=hashlib.sha256(encoded).hexdigest();job_hash=hashlib.sha256(job_id.encode()).hexdigest()
        fd=self._lock()
        try:
            d=self._read();p=d['policy']
            private_key=hashlib.sha256(self.identity_key.encode()).digest() if self.identity_key is not None else bytes.fromhex(d['identity'])
            def call_id(model):return hmac.new(private_key,(model+'\0'+cache_key).encode(),hashlib.sha256).hexdigest()
            ident=call_id(p['model']);old=d['calls'].get(ident)
            if not p['enabled'] or not p['scope_consent']:return {'ok':False,'reason':'disabled'}
            if p['model']=='expensive' and not p['allow_expensive']:return {'ok':False,'reason':'expensive_not_approved'}
            try:
                authority_version=self.authority.check(p) if self.authority is not None else None
            except Exception:return {'ok':False,'reason':'chain_authority_unavailable'}
            # A model switch is not a safe retry when an earlier request may
            # already have been billed. Preserve its reservation and halt.
            for candidate in MODELS:
                prior=d['calls'].get(call_id(candidate))
                legacy=d['calls'].get(hashlib.sha256((candidate+'\0'+cache_key).encode()).hexdigest())
                if (prior and prior.get('status')!='complete') or legacy:return {'ok':False,'reason':'outcome_unknown'}
            if old:
                if old['prompt_hash']!=prompt_hash:return {'ok':False,'reason':'idempotency_conflict'}
                if old['model']!=p['model']:return {'ok':False,'reason':'model_changed'}
                if old['status']!='complete':return {'ok':False,'reason':'outcome_unknown'}
                try:
                    if self.authority is not None:self.authority.check_cache(ident,old['cache'])
                    result=json.loads(self.unprotect(old['cache']))
                    if not isinstance(result,dict) or not isinstance(result.get('text'),str) or not isinstance(result.get('usage'),dict):raise ValueError()
                    return {'ok':True,'cached':True,**result}
                except Exception:return {'ok':False,'reason':'cache_unavailable'}
            try:key=self.key_provider()
            except Exception:key=None
            if not key:return {'ok':False,'reason':'key_unavailable'}
            if input_bound>p['max_input_tokens']:return {'ok':False,'reason':'input_limit'}
            model,inp,out=MODELS[p['model']];reserve_in,reserve_out=(440,3300) if p['model']=='expensive' else (inp,out);reserve=input_bound*reserve_in+p['max_output_tokens']*reserve_out
            today=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
            from app.cloud_media_client import budget_entries
            try:calls=list(d['calls'].values())+budget_entries(self.path)
            except (OSError,ValueError):return {'ok':False,'reason':'media_budget_ledger_unavailable'}
            if reserve>p['per_call_nanos'] or sum(x['charge'] for x in calls)+reserve>p['run_nanos'] or sum(x['charge'] for x in calls if x['day']==today)+reserve>p['daily_nanos'] or sum(x['day']==today for x in calls)>=p['max_calls_per_day'] or sum(x['job_hash']==job_hash for x in calls)>=p['max_calls_per_job']:return {'ok':False,'reason':'budget_or_count_limit'}
            # Denied/missing logical work must not create a signed reservation,
            # publish its label, or poison a fresh cache intent as "unknown".
            if self.authority is not None:
                try:self.authority.check_job(job_id)
                except Exception:return {'ok':False,'reason':'job_not_authorized'}
            entry={'status':'unknown','charge':reserve,'day':today,'job_hash':job_hash,'prompt_hash':prompt_hash,'model':p['model']};d['calls'][ident]=entry;self._write(d)
            # No retries. An exception, invalid response, or cache failure retains reservation.
            try:
                if self.authority is not None:
                    # Never publish an unsalted hash of sensitive prompt text.
                    # The private local identity blinds this commitment.
                    chain_prompt_hash=hmac.new(private_key,encoded,hashlib.sha256).hexdigest()
                    reserve_tx=self.authority.reserve(id=ident,job_id=job_id,model=p['model'],policy_version=authority_version,prompt_hash=chain_prompt_hash,input_tokens=input_bound,output_tokens=p['max_output_tokens'])
                    entry['reserve_tx']=_transaction(reserve_tx);self._write(d)
                    self.authority.check(p,expected_version=authority_version)
                response=self.transport({'model':model,'messages':messages,'max_tokens':p['max_output_tokens'],
                                         'temperature':0,'response_format':output_format},key)
                text=_completion_text(response,model)
                usage=response['usage'];i=usage['prompt_tokens'];o=usage['completion_tokens'];total=usage['total_tokens']
                if any(type(x) is not int or x<0 for x in (i,o,total)) or i>input_bound or o>p['max_output_tokens'] or total!=i+o:raise ValueError()
                details=usage.get('completion_tokens_details') or {};reasoning=details.get('reasoning_tokens',0)
                if type(reasoning) is not int or not 0<=reasoning<=o:raise ValueError()
                result={'text':text,'usage':{'prompt_tokens':i,'completion_tokens':o,'reasoning_tokens':reasoning,'total_tokens':total},'model':model,'estimated_cost_nanos':i*inp+o*out,'verified_attestation':False}
                cache=self.protect(json.dumps(result,separators=(',',':')))
                if not isinstance(cache,str) or not cache or len(cache)>8192:raise ValueError()
                envelope=json.loads(cache)
                if not isinstance(envelope,dict) or set(envelope)!={'v','alg','kdf','iterations','salt','iv','ciphertext'} or envelope.get('v')!=1 or envelope.get('alg')!='AES-256-GCM' or envelope.get('kdf')!='PBKDF2-SHA256' or envelope.get('iterations')!=600000 or self.unprotect(cache)!=json.dumps(result,separators=(',',':')):raise ValueError()
                # Persist the exact encrypted response before a completion can
                # become an unknown on-chain write. Status remains unknown.
                entry['staged_cache']=cache
                entry['staged_cache_sha256']=hashlib.sha256(cache.encode('utf-8')).hexdigest()
                self._write(d)
                if self.authority is not None:entry['complete_tx']=_transaction(self.authority.complete(ident,cache));self._write(d)
                entry.update(status='complete',estimated_cost_nanos=result['estimated_cost_nanos'],usage=result['usage'],cache=cache)
                entry.pop('staged_cache',None);entry.pop('staged_cache_sha256',None);self._write(d)
                return {'ok':True,'cached':False,**result}
            except Exception:return {'ok':False,'reason':'outcome_unknown'}
        finally:os.close(fd)
