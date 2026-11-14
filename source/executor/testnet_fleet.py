"""Opt-in bounded founder service: public testnet registry, pinned local Gemma only.

The issuer reads only the separately configured service-operator key. Per-company
workers receive receiver-scoped function-call keys. This is local file/process
separation, not strong isolation from other processes of the same OS user.
"""
from __future__ import annotations
import argparse
import contextlib
import copy
import datetime
import fcntl
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error

from executor import testnet_mock as adapter
from executor.crypto import public_manifest
from executor.local_model import MODEL, EXPECTED_DIGEST
from executor.operations import BusinessExecutor
from executor.rpc_gateway import READ, WRITE, PreflightRefused, GatewayError, PREFLIGHT_STAGES, PREFLIGHT_TYPES

PROFILE = 'public-testnet-founder-fleet-v1'
SERVICE = 'near-founder-worker-service-v1'
GENESIS = 'FWJ9kR6KFWoyMoNjpLXXGHeuiy7tEY6GmoFeCA5yuc6b'
METHODS = frozenset(('company_tick','company_attest','company_archive','ai_reserve_call','ai_complete_call'))
OPERATIONS = frozenset(('content_draft','website_build'))
CAP_COMPANIES, CAP_COMPANY_CALLS, CAP_CALLS = 8, 2, 16
SOURCE = Path(__file__).resolve().parents[1]
NAME = re.compile(r'(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*\Z')


def require(ok, message):
    if not ok:
        raise ValueError(message)


class ServiceUnavailable(ValueError):
    """A shared service/lease check failed; no company may dispatch new work."""


class FleetAccountingError(ValueError):
    """Aggregate spend cannot be proved from the original private ledgers."""


class SharedIssuerUncertain(ValueError):
    """The shared FullAccess issuer may have consumed its nonce; stop globally."""


class CompanyPreflightRefused(ValueError):
    """The trusted issuer proved this company was refused before any signature."""


class RegistryReadUnavailable(OSError):
    def __init__(self,method,status,kind,attempts):
        super().__init__('Fixed read-only registry transport unavailable')
        self.diagnostic={'method':method,'http_status':status,'error_kind':kind,'attempts':attempts,'read_only':True}


def read_failure(error):
    seen=set()
    while error is not None and id(error) not in seen:
        seen.add(id(error))
        if isinstance(error,RegistryReadUnavailable):return error.diagnostic
        error=error.__cause__
    return None


def bridge_read_failure(error):
    if not isinstance(error,PreflightRefused):return None
    d=error.diagnostic;stage=d.get('stage','');status=d.get('http_status');kind=d.get('error_type')
    transport=status in (429,500,502,503,504) or kind in ('TypeError','AbortError','TimeoutError','RPCDeadlineError','RetriesExceeded','RPCCommandDeadlineError')
    if not stage.startswith('rpc.') or not transport:return None
    method={'rpc.status':'status','rpc.block':'block'}.get(stage,'query')
    return {'method':method,'http_status':status,'error_kind':kind,'attempts':1,'read_only':True,'no_dispatch':{'schema':1,'source':'trusted_local_bridge','journal_pending':False,'signing_started':False,'intent_saved':False,'submission_started':False}}


def bridge_read_result(result,command,pending):
    # RPCGateway.call has already matched this response to its generated request
    # ID on the trusted child pipe. READ never signs. Do not reuse this boundary
    # for reconcile, pending writes, semantic/decode failures or arbitrary text.
    if command not in READ-{'reconcile'} or pending is not False or not isinstance(result,dict):return None
    if set(result)!={'id','ok','error','tx','diagnostic','no_dispatch'} or not isinstance(result['id'],str) or not re.fullmatch(r'[a-f0-9]{32}',result['id']):return None
    if result['ok'] is not False or result['tx'] is not None or result['no_dispatch'] is not None or result['error']!='Restricted RPC operation refused':return None
    d=result['diagnostic']
    if not isinstance(d,dict) or set(d)!={'stage','error_type','http_status'} or d['stage'] not in PREFLIGHT_STAGES or d['error_type'] not in PREFLIGHT_TYPES:return None
    if d['http_status'] is not None and (type(d['http_status']) is not int or not 100<=d['http_status']<=599):return None
    error=PreflightRefused(dict(d))
    return error if bridge_read_failure(error) is not None else None


def read_json(path, limit=2_000_000):
    adapter._file(str(path))
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        info=os.fstat(fd)
        require(info.st_size<=limit,'Private state size limit exceeded')
        raw=os.read(fd,limit+1)
        require(len(raw)<=limit,'Private state grew during read')
    finally:
        os.close(fd)
    def unique(items):
        result={}
        for key,value in items:
            require(key not in result,'Duplicate private state field')
            result[key]=value
        return result
    result=json.loads(raw,object_pairs_hook=unique)
    require(isinstance(result,dict),'Private JSON object required')
    return result


def atomic(path,value):
    raw=json.dumps(value,sort_keys=True,separators=(',',':')).encode()
    require(len(raw)<=2_000_000,'Fleet state capacity exceeded')
    temporary=path.with_name('.'+path.name+'-'+os.urandom(8).hex())
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(raw);stream.flush();os.fsync(stream.fileno())
        os.replace(temporary,path)
        directory=os.open(path.parent,os.O_RDONLY)
        try:os.fsync(directory)
        finally:os.close(directory)
    finally:
        if temporary.exists():temporary.unlink()


def read_json_bytes(path):
    adapter._file(str(path));fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        require(os.fstat(fd).st_size<=2_000_000,'Private recovery input exceeds bound')
        raw=os.read(fd,2_000_001);require(len(raw)<=2_000_000,'Private recovery input grew beyond bound');return raw
    finally:os.close(fd)


def write_once(path,raw):
    try:fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    except FileExistsError:
        require(read_json_bytes(path)==raw,'Immutable recovery snapshot already differs');return
    with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
    fd=os.open(path.parent,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)


def issuer_lock_snapshot(root,item):
    name=item.get('name');require(name in ('issuer-grant.lock','issuer-heartbeat.lock'),'Exact issuer lock name required')
    directory=root/name;adapter._directory(str(directory));info=directory.lstat()
    require(sorted(p.name for p in directory.iterdir())==['owner.json'],'Issuer lock contents changed')
    file=directory/'owner.json';raw=read_json_bytes(file);owner=json.loads(raw);entry=file.lstat()
    require(isinstance(owner,dict) and set(owner)=={'schema','pid','action','company','operator_id','factory_id','created_at'} and owner['schema']=='near-fleet-issuer-lock-v1' and type(owner['pid']) is int and owner['pid']>1,'Exact issuer lock owner required')
    facts={'name':name,'owner':owner,'owner_sha256':hashlib.sha256(raw).hexdigest(),'dev':info.st_dev,'ino':info.st_ino,'owner_dev':entry.st_dev,'owner_ino':entry.st_ino}
    require(facts==item,'Original issuer lock identity changed')
    try:os.kill(owner['pid'],0)
    except ProcessLookupError:pass
    except OSError as error:raise ValueError('Issuer lock process is uncertain') from error
    else:raise ValueError('Issuer lock process is still live')
    return directory,file,raw


def load_fleet(path):
    spec=read_json(adapter._file(str(path)),16384)
    fields={'schema','profile','factory_id','factory_code_hash','template_sha256','company_code_hash','operator_id','worker_key_id','worker_public_key','service_expires_at','operator_key_file','heartbeat_key_file','root_dir'}
    require(set(spec)==fields and type(spec['schema']) is int and spec['schema']==1 and spec['profile']==PROFILE,'Exact explicit fleet profile required')
    require(adapter._ACCOUNT.fullmatch(spec['factory_id']) and adapter._ACCOUNT.fullmatch(spec['operator_id']) and spec['factory_id']!=spec['operator_id'],'Distinct named testnet factory/operator required')
    require(adapter._CODE.fullmatch(spec['factory_code_hash']) and adapter._CODE.fullmatch(spec['company_code_hash']) and adapter._HASH.fullmatch(spec['template_sha256']) and adapter._HASH.fullmatch(spec['worker_key_id']),'Pinned deployment identities required')
    require(isinstance(spec['worker_public_key'],str) and hashlib.sha256(spec['worker_public_key'].encode()).hexdigest()==spec['worker_key_id'],'Worker public encryption identity differs')
    require(isinstance(spec['service_expires_at'],str) and re.fullmatch(r'[1-9][0-9]{9,10}',spec['service_expires_at']),'Finite service expiry required')
    root=adapter._directory(spec['root_dir'])
    for field in ('operator_key_file','heartbeat_key_file'):
        adapter._file(spec[field])  # Stat only; Node issuer is the key reader.
    require(spec['operator_key_file']!=spec['heartbeat_key_file'],'Issuer and heartbeat keys must differ')
    vault=adapter._directory(str(root/'vault'))
    for name in ('master.key','launch.pem'):
        adapter._file(str(vault/name))
    return spec


def validate_service(service,spec,now,*,online=False,local_now=None):
    require(isinstance(service,dict) and service.get('schema')==SERVICE,'Native worker service view required')
    expected={key:spec[key] for key in ('operator_id','worker_public_key','worker_key_id','service_expires_at')}
    expected.update(execution_backend='local_gemma_mock',model=MODEL,model_digest=EXPECTED_DIGEST,cloud_billing_verified=False,tee_verified=False,max_companies=8,max_reservations_per_company=2,max_reservations_global=16)
    require(all(service.get(k)==v for k,v in expected.items()),'Factory worker service differs from immutable pins')
    require(type(now) is int and now<int(spec['service_expires_at']),'Worker service expired')
    if online:
        clock=int(time.time()) if local_now is None else local_now
        for field in ('heartbeat_at','heartbeat_expires_at','observed_at'):
            require(isinstance(service.get(field),str) and re.fullmatch(r'0|[1-9][0-9]{0,10}',service[field]),'Exact native worker heartbeat required')
        at,expiry,observed=(int(service[k]) for k in ('heartbeat_at','heartbeat_expires_at','observed_at'))
        require(service.get('online') is True and observed==now and 0<at<=now<expiry<=min(at+600,int(spec['service_expires_at'])) and type(clock) is int and abs(clock-now)<=60 and clock<expiry and clock<int(spec['service_expires_at']),'Native worker service is offline, stale or expired')
    return service


class PublicRegistry:
    """Fixed public read-only RPC. No URL, method or account comes from a model."""
    def __init__(self,spec):
        self.spec=spec;self.sequence=0;self.last=0
    def request(self,method,params):
        require(method in ('status','block','query','EXPERIMENTAL_protocol_config'),'Read-only registry method required')
        for attempt in range(1,4):
            gap=1-(time.monotonic()-self.last)
            if gap>0:time.sleep(gap)
            self.last=time.monotonic();self.sequence+=1
            payload=json.dumps({'jsonrpc':'2.0','id':self.sequence,'method':method,'params':params}).encode()
            request=urllib.request.Request(adapter.RPC,data=payload,headers={'Content-Type':'application/json'})
            try:
                with urllib.request.urlopen(request,timeout=10) as response:
                    require(response.status==200,'Registry RPC unavailable')
                    raw=response.read(2_000_001);require(len(raw)<=2_000_000,'Registry response exceeds bound')
            except (urllib.error.URLError,TimeoutError,ConnectionError) as error:
                status=error.code if isinstance(error,urllib.error.HTTPError) else None
                retry=status in (429,500,502,503,504) or not isinstance(error,urllib.error.HTTPError)
                if not retry or attempt==3:raise RegistryReadUnavailable(method,status,type(error).__name__,attempt) from error
                time.sleep(2**attempt);continue
            result=json.loads(raw)
            require(result.get('jsonrpc')=='2.0' and result.get('id')==self.sequence and 'error' not in result and 'result' in result,'Registry RPC rejected request')
            return result['result']
    @staticmethod
    def bound(value,block,height=None):
        require(isinstance(value,dict) and value.get('block_hash')==block and type(value.get('block_height')) is int and value['block_height']>=0 and (height is None or value['block_height']==height),'Registry response is not bound to the requested FINAL block')
        return value
    def account(self,account,header):
        return self.bound(self.request('query',{'request_type':'view_account','account_id':account,'block_id':header['hash']}),header['hash'],header['height'])
    def operator_ready(self,header=None):
        header=header or self.request('block',{'finality':'final'})['header']
        require(adapter._CODE.fullmatch(header['hash']) and type(header['height']) is int and abs(int(header['timestamp_nanosec'])//1_000_000_000-int(time.time()))<=600,'Current FINAL operator quote required')
        account=self.account(self.spec['operator_id'],header)
        protocol=self.request('EXPERIMENTAL_protocol_config',{'block_id':header['hash']})
        return validate_operator_liquidity(account,protocol,header)
    def dispatch_ready(self):
        """Fresh shared FINAL identity/liveness/liquidity before every new effect.

        Exact already-sent intents use gateway.reconcile(), which bypasses this
        new-dispatch gate and never broadcasts or invokes a model.
        """
        try:
            require(int(time.time())<int(self.spec['service_expires_at']),'Worker lease expired before dispatch')
            status=self.request('status',[])
            require(status.get('chain_id')=='testnet' and status.get('genesis_hash')==GENESIS and status.get('sync_info',{}).get('syncing') is False,'Fixed synchronized testnet genesis required')
            header=self.request('block',{'finality':'final'})['header']
            require(adapter._CODE.fullmatch(header['hash']) and type(header['height']) is int,'Finalized dispatch block required')
            now=int(header['timestamp_nanosec'])//1_000_000_000
            require(abs(now-int(time.time()))<=60,'Dispatch finalized clock is stale')
            require(self.account(self.spec['factory_id'],header).get('code_hash')==self.spec['factory_code_hash'],'Factory code changed before dispatch')
            state=self.view(self.spec['factory_id'],'state',{},header['hash'],header['height'])
            require(state.get('frozen') is False,'Factory is frozen before dispatch')
            service=self.view(self.spec['factory_id'],'worker_service',{},header['hash'],header['height'])
            self.operator_ready(header)
            return validate_service(service,self.spec,now,online=True)
        except Exception as error:
            raise ServiceUnavailable('Shared service dispatch preflight failed') from error
    def view(self,account,method,args,block,height=None):
        import base64
        require(NAME.fullmatch(account) and method in ('worker_service','list','template','state','company_state','execution_profile','ai_policy'),'Bounded registry view required')
        value=self.request('query',{'request_type':'call_function','account_id':account,'method_name':method,'args_base64':base64.b64encode(json.dumps(args).encode()).decode(),'block_id':block})
        self.bound(value,block,height)
        require(isinstance(value.get('result'),list) and len(value['result'])<=1_000_000,'Bounded view bytes required')
        return json.loads(bytes(value['result']))
    def discover(self,*,online=True):
        s=self.spec
        status=self.request('status',[])
        require(status.get('chain_id')=='testnet' and status.get('genesis_hash')==GENESIS and status.get('sync_info',{}).get('syncing') is False,'Fixed synchronized testnet genesis required')
        header=self.request('block',{'finality':'final'})['header']
        require(adapter._CODE.fullmatch(header['hash']) and type(header['height']) is int,'Finalized registry block required')
        now=int(header['timestamp_nanosec'])//1_000_000_000
        require(abs(now-int(time.time()))<=600,'Registry finalized clock is stale')
        info=self.account(s['factory_id'],header)
        require(info.get('code_hash')==s['factory_code_hash'],'Factory code changed')
        self.operator_ready(header)
        service=validate_service(self.view(s['factory_id'],'worker_service',{},header['hash'],header['height']),s,now,online=online)
        if not online:require(self.view(s['factory_id'],'state',{},header['hash'],header['height']).get('frozen') is False,'Factory is frozen during recovery audit')
        page=self.view(s['factory_id'],'list',{'from':0,'limit':8},header['hash'],header['height'])
        require(type(page.get('total')) is int and 0<=page['total']<=CAP_COMPANIES and isinstance(page.get('records'),list) and len(page['records'])==page['total'],'Bounded complete factory registry required')
        records=[];seen=set()
        for record in page['records']:
            child=record.get('child')
            require(isinstance(child,str) and adapter._ACCOUNT.fullmatch(child) and child.endswith('.'+s['factory_id']) and child not in seen,'Factory registry child identity mismatch')
            seen.add(child)
            require(NAME.fullmatch(record.get('creator','')) and record.get('template_sha256')==s['template_sha256'] and record.get('config',{}).get('operator')==s['operator_id'] and record['config'].get('supplier')==s['operator_id'],'Factory registry owner, template or operator differs')
            if record.get('phase')=='active':records.append(record)
        return {'block':header,'now':now,'service':service,'records':records}
    def company_ready(self,record,header):
        s=self.spec;child=record['child']
        block=header['hash'];height=header['height'];info=self.account(child,header)
        require(info.get('code_hash')==s['company_code_hash'],'Factory child code changed')
        treasury=self.view(child,'state',{},block,height)
        require(treasury.get('owner')==record['creator'] and treasury.get('operator')==s['operator_id'],'Original factory owner/operator differs')
        if treasury.get('frozen') is not False:return False
        profile=self.view(child,'execution_profile',{},block,height)
        if profile is None:return False
        require(profile.get('profile')=='business-operations-v1' and profile.get('target_origin')=='' and profile.get('worker_key_id')==s['worker_key_id'] and profile.get('worker_public_key')==s['worker_public_key'],'Owner configured a different execution profile')
        policy=self.view(child,'ai_policy',{},block,height)
        if not policy.get('enabled') or not policy.get('scope_consent'):return False
        validate_policy(policy)
        return True


def validate_policy(p):
    require(p.get('selected_model')=='economy' and p.get('allow_economy') is True and p.get('allow_expensive') is False,'Fleet permits economy authorization only')
    limits={'per_call_nanos':1_000_000,'daily_nanos':2_000_000,'lifetime_nanos':2_000_000,'max_input_tokens':4608,'max_output_tokens':512,'max_calls_per_job':1,'max_calls_per_day':2}
    for key,maximum in limits.items():
        value=p.get(key)
        require(type(value) in (str,int) and re.fullmatch(r'[1-9][0-9]*',str(value)) and int(value)<=maximum,'Owner AI policy exceeds service '+key)
    return p


def validate_operator_liquidity(account,protocol,header):
    def number(value):
        require(isinstance(value,str) and re.fullmatch(r'0|[1-9][0-9]{0,38}',value) and int(value)<2**128,'Exact current operator/storage/gas amount required')
        return int(value)
    cost=number(protocol['runtime_config']['storage_amount_per_byte'])
    price=max(number(header['gas_price']),number(protocol['runtime_config']['min_gas_purchase_price']))
    usage=account.get('storage_usage');require(type(usage) is int and 0<=usage<=2**53-1 and cost>0 and price>0,'Exact current operator storage/gas quote required')
    liquid=number(account['amount'])-number(account['locked'])-usage*cost
    require(liquid>=500_000_000_000_000_000_000_000+152_000_000_000_000*price,'Service operator liquid balance below0.5TESTNEAR plus worker/concurrent-heartbeat upfront')
    return liquid


def model_ready():
    # Retry only this fixed read-only health endpoint. Inference and signed
    # effects retain their original unknown-outcome and no-resend handling.
    for attempt in range(1,4):
        connection=http.client.HTTPConnection('127.0.0.1',11434,timeout=5)
        try:
            connection.request('GET','/api/tags');response=connection.getresponse();raw=response.read(1_048_577)
            if response.status in (429,500,502,503,504):raise RegistryReadUnavailable('local_model_tags',response.status,'HTTPError',attempt)
            require(response.status==200 and len(raw)<=1_048_576,'Local model identity unavailable')
            matches=[m for m in json.loads(raw).get('models',[]) if m.get('name')==MODEL]
            require(len(matches)==1 and matches[0].get('digest')==EXPECTED_DIGEST,'Pinned local Gemma unavailable')
            return
        except RegistryReadUnavailable:
            if attempt==3:raise
        except (TimeoutError,ConnectionError,OSError) as error:
            if attempt==3:raise RegistryReadUnavailable('local_model_tags',None,type(error).__name__,attempt) from error
        finally:connection.close()
        time.sleep(2**attempt)


class FleetLimitedClient:
    def __init__(self,inner,budget,before_new=None):self.inner=inner;self.budget=budget;self.before_new=before_new
    def configure(self,*args,**kwargs):return self.inner.configure(*args,**kwargs)
    def status(self):return self.inner.status()
    def reconcile_staged(self,*args,**kwargs):return self.inner.reconcile_staged(*args,**kwargs)
    def complete(self,cache_key,messages,job_id):
        # The fleet lease serializes all model-producing ticks. Check before a
        # new logical reservation is inserted. Existing IDs retain the bounded
        # client's own cached/conflict/unknown handling unchanged.
        raw=self.inner.inner._read()
        key=hashlib.sha256(self.inner.inner.identity_key.encode()).digest()
        prior=any(hmac.new(key,(model+'\0'+cache_key).encode(),hashlib.sha256).hexdigest() in raw['calls'] for model in ('economy','expensive'))
        company,total=self.budget()
        if not prior and (company>=CAP_COMPANY_CALLS or total>=CAP_CALLS):
            return {'ok':False,'reason':'fleet_logical_reservation_limit'}
        if not prior and self.before_new:self.before_new()
        return self.inner.complete(cache_key,messages,job_id)


class FleetGateway:
    def __init__(self,inner,owner,worker,before_write=None,on_read_failure=None):self.inner=inner;self.owner=owner;self.worker=worker;self.config=inner.config;self.before_write=before_write;self.on_read_failure=on_read_failure
    @property
    def pending(self):return self.inner.pending
    def snapshot(self):
        result=self.call('state')
        if result.get('ok') is not True or not isinstance(result.get('state'),dict):raise GatewayError('Chain state unavailable')
        return result['state']
    def reconcile(self):return self.inner.reconcile()
    def call(self,command,**args):
        require(command not in WRITE or command in METHODS,'Fleet worker operation is outside its five-method grant')
        if command in WRITE and self.before_write:self.before_write()
        try:result=self.inner.call(command,**args)
        except PreflightRefused as error:
            if self.on_read_failure and bridge_read_failure(error):raise self.on_read_failure(error) from error
            raise
        read_error=bridge_read_result(result,command,self.inner.pending)
        if read_error is not None and self.on_read_failure:raise self.on_read_failure(read_error) from read_error
        if command=='ai_policy' and result.get('ok'):
            validate_policy(result['policy'])
        if command=='company_list' and result.get('ok'):
            for task in result['tasks']['items']:
                require(task.get('operation') in OPERATIONS and task.get('kind')=='general' and task.get('approved_by')==self.owner and task.get('worker_key_id')==self.worker and not task.get('mandate_id') and not task.get('inbox_id'),'Only ordinary owner-approved website/content tasks are serviced')
        return result


class FleetExecutor(BusinessExecutor):
    def _open_operation(self,task):
        key,scope=super()._open_operation(task)
        allowed={'profile','operation','brief','context','sources','use_ai'}
        if 'locale' in scope:allowed.add('locale')
        require(set(scope)==allowed and scope.get('operation') in OPERATIONS and all(set(source)=={'id','text'} for source in scope.get('sources',[])),'Only bounded supplied-text website/content scopes are serviced')
        return key,scope


class Fleet:
    def __init__(self,config_file,spec,registry=None,issuer=None,*,allow_halted=False):
        self.config_file=str(config_file);self.spec=spec;self.root=Path(spec['root_dir']);self.registry=registry or PublicRegistry(spec)
        self.issuer=issuer or self._issuer;self.path=self.root/'fleet-state.json';self.state_lock=threading.RLock();self.heartbeat_lock=threading.RLock();self.stop=threading.Event();self.fatal=None;self.fatal_error=None;self.read_pause_error=None;self.in_tick=None;self.deadline=None
        identity={k:spec[k] for k in ('profile','factory_id','factory_code_hash','template_sha256','company_code_hash','operator_id','worker_key_id','service_expires_at')}
        if self.path.exists():
            self.state=read_json(self.path)
            require(self.state.get('schema')==1 and self.state.get('identity')==identity and isinstance(self.state.get('companies'),dict),'Existing fleet state identity changed')
            require(allow_halted or not self.state.get('halted'),'Fleet halted; inspect original private journals before any restart')
        else:
            require(not allow_halted,'Original halted fleet state is missing; recovery cannot initialize a new state')
            require(not (self.root/'companies').exists(),'Existing company state has no matching fleet registry')
            self.state={'schema':1,'identity':identity,'companies':{},'last_block_height':0,'halted':None};self.save()
        require(len(self.state['companies'])<=CAP_COMPANIES,'Fleet company capacity exceeded')
        self.companies=self.root/'companies'
        if not self.companies.exists():
            require(not allow_halted,'Original company directory is missing during recovery audit');self.companies.mkdir(mode=0o700)
        adapter._directory(str(self.companies))
    def save(self):
        with self.state_lock:atomic(self.path,self.state)
    def _issuer(self,action,company=None):
        argv=['node','--dns-result-order=ipv4first','--network-family-autoselection-attempt-timeout=2000',str(SOURCE/'executor/fleet_enrollment.mjs'),self.config_file,action]
        if company:argv.append(company)
        env={key:os.environ[key] for key in ('PATH','LANG','LC_ALL','TMPDIR','TZ') if key in os.environ}
        try:
            result=subprocess.run(argv,cwd=SOURCE,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=110,check=False)
            require(len(result.stdout)<=16384,'Issuer response exceeds bound')
            value=json.loads(result.stdout)
            if result.returncode==2 and isinstance(value,dict) and set(value)=={'status','action','company','read_failure','no_dispatch'} and value.get('status')=='read_unavailable' and value.get('action')==action and value.get('company')==company:
                d=value['read_failure'];proof={'schema':1,'source':'trusted_local_issuer','journal_pending':False,'signing_started':False,'intent_saved':False,'submission_started':False}
                require(value['no_dispatch']==proof and isinstance(d,dict) and set(d)=={'method','http_status','error_kind','attempts','read_only'} and d['method'] in ('status','block','query','EXPERIMENTAL_protocol_config') and (d['http_status'] is None or type(d['http_status']) is int and 100<=d['http_status']<=599) and isinstance(d['error_kind'],str) and re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}',d['error_kind']) and d['attempts']==1 and d['read_only'] is True,'Exact trusted issuer transport preflight required')
                converted=RegistryReadUnavailable(d['method'],d['http_status'],d['error_kind'],1);converted.diagnostic={**d,'no_dispatch':proof}
                if company and company in self.state['companies']:
                    self.state['companies'][company]['read_preflight']=converted.diagnostic;self.save()
                raise converted
            if action=='grant' and result.returncode==2 and value=={'status':'company_refused','company':company,'no_dispatch':{'schema':1,'scope':'company_enrollment','shared_pending_checked':True,'signing_started':False,'intent_saved':False,'submission_started':False}}:
                raise CompanyPreflightRefused('Company enrollment refused before signature with no shared pending intent')
            require(result.returncode==0 and value.get('status') in ('final','enrolled'),'Issuer uncertain or refused; preserve original signed-intent journal')
            return value
        except Exception as error:
            if isinstance(error,(CompanyPreflightRefused,RegistryReadUnavailable)):raise
            if action=='grant':raise SharedIssuerUncertain('Shared enrollment issuer requires original-journal review') from error
            raise
    def quarantine(self,record,reason):
        """Retain a company and every journal; only explicit operator review resumes it."""
        child=record['child'];binding={k:record[k] for k in ('id','creator','child','request_hash','template_sha256')}
        with self.state_lock:
            row=self.state['companies'].get(child)
            if row is None:
                require(len(self.state['companies'])<CAP_COMPANIES,'Fleet company capacity exceeded')
                row={'binding':binding,'logical_calls':0,'phase':'quarantined','enrollment_started':False,'enrollment_attempts':0,'enrollment_no_dispatch':0,'enrollment_effect_recorded':False};self.state['companies'][child]=row
            if not row.get('quarantine'):
                row['quarantine']={'reason':reason,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'instruction':'Inspect this company original issuer/worker/model journals. No automatic retry, resend, ledger clearing or key regeneration.'}
            self.save()
    def counts(self,company=None,allow_inflight=False):
        try:return self._counts(company,allow_inflight)
        except Exception as error:
            raise FleetAccountingError('Aggregate inference accounting requires original-ledger review') from error
    def _counts(self,company=None,allow_inflight=False):
        total=0;selected=0
        with self.state_lock:
            for child,row in self.state['companies'].items():
                directory=self.companies/hashlib.sha256(child.encode()).hexdigest()
                path=directory/adapter.LEDGER_DIRECTORY/'ledger.json'
                if row.get('runtime_created'):
                    require(all(file.exists() for file in (path,directory/'near-ai/ledger.json',directory/'rpc-journal.json')),'Previously initialized runtime accounting or RPC journal is missing')
                    require(not read_json(directory/'near-ai/ledger.json').get('calls'),'Unexpected alternate inference ledger requires operator review')
                if path.exists():
                    ledger=read_json(path)
                    require(isinstance(ledger.get('calls'),dict),'Fleet inference ledger missing calls')
                    calls=ledger['calls'];count=len(calls)
                    require(all(isinstance(value,dict) and value.get('status') in ('complete','unknown') for value in calls.values()),'Malformed inference accounting status')
                    if any(value.get('status')!='complete' for value in calls.values()) and not (allow_inflight and self.in_tick==child):
                        self.quarantine(row['binding'],'unresolved_model_outcome')
                else:
                    require(row.get('logical_calls',0)==0,'Previously observed inference ledger is missing')
                    count=0
                require(count>=row.get('logical_calls',0) and count<=CAP_COMPANY_CALLS,'Logical call count decreased or exceeds service cap')
                total+=count
                if child==company:selected=count
            require(total<=CAP_CALLS,'Global logical reservation cap exceeded')
        return selected,total
    def heartbeat(self):
        with self.heartbeat_lock:
            model_ready();self.counts(allow_inflight=True)
            require(not self.fatal and not self.stop.is_set() and (self.deadline is None or time.monotonic()<self.deadline),'Fleet service is stopping or finite runtime ended')
            result=self.issuer('heartbeat')
            require(isinstance(result,dict) and result.get('status')=='final','Heartbeat is not FINAL; preserve the original journal')
            return result
    def queue_read_pause(self,error):
        require(read_failure(error) is not None,'Only source-controlled read transport failure may pause')
        with self.state_lock:self.read_pause_error=error
    def record_read_pause(self,error,delay,source):
        diagnostic=read_failure(error);require(diagnostic is not None and delay in (30,60,120),'Bounded known read cooldown required')
        with self.state_lock:
            self.state['read_pause_count']=self.state.get('read_pause_count',0)+1
            self.state['last_read_pause']={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':source,'cooldown_seconds':delay,'read_failure':diagnostic,'writes_retried':0,'models_retried':0};self.save()
    def _heartbeat_loop(self):
        delay=300;backoff=30
        while not self.stop.wait(min(delay,max(0,self.deadline-time.monotonic())) if self.deadline is not None else delay):
            if self.deadline is not None and time.monotonic()>=self.deadline:return
            try:self.heartbeat();delay=300;backoff=30
            except Exception as error:
                if read_failure(error) is not None:
                    self.queue_read_pause(error);self.record_read_pause(error,backoff,'heartbeat');delay=backoff;backoff=min(120,backoff*2);continue
                self.fatal=type(error).__name__;self.fatal_error=error;self.stop.set();return
    def prepare(self,record):
        child=record['child'];ident=hashlib.sha256(child.encode()).hexdigest();directory=self.companies/ident
        binding={k:record[k] for k in ('id','creator','child','request_hash','template_sha256')}
        with self.state_lock:
            row=self.state['companies'].get(child)
            if row:require(row['binding']==binding,'Existing factory company identity changed')
            else:
                require(len(self.state['companies'])<CAP_COMPANIES and not directory.exists(),'New company directory must be fresh')
                self.state['companies'][child]={'binding':binding,'logical_calls':0,'phase':'preparing','enrollment_started':False,'enrollment_attempts':0,'enrollment_no_dispatch':0,'enrollment_effect_recorded':False};self.save()
            needs_enrollment=self.state['companies'][child]['phase']=='preparing'
        if not directory.exists():directory.mkdir(mode=0o700)
        adapter._directory(str(directory));vault=directory/'vault'
        if not vault.exists():vault.mkdir(mode=0o700)
        adapter._directory(str(vault))
        # Restore only the SAME service RSA/master bytes, never generate a new
        # identity over existing cache/accounting or unknown outcomes.
        for name in ('master.key','launch.pem'):
            source=self.root/'vault'/name;target=vault/name;adapter._file(str(source));raw=source.read_bytes()
            if target.exists():adapter._file(str(target));require(target.read_bytes()==raw,'Per-company vault identity differs')
            else:
                fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
                with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
        if needs_enrollment:
            # This monotone high-water mark is not a read-failure hint. Missing
            # originals after an issuer attempt can never become "never issued".
            with self.state_lock:
                row=self.state['companies'][child]
                attempts=row.get('enrollment_attempts',0);closed=row.get('enrollment_no_dispatch',0)
                require(type(attempts) is int and 0<=attempts<2**53-1 and type(closed) is int and 0<=closed<=attempts,'Enrollment attempt accounting changed')
                require(row.get('enrollment_effect_recorded') is None or type(row['enrollment_effect_recorded']) is bool,'Enrollment effect high-water mark changed')
                row['enrollment_started']=True
                attempt_no=attempts+1;row['enrollment_attempts']=attempt_no
                row.pop('read_preflight',None)
                self.save()
            try:
                issued=self.issuer('grant',child)
                require(isinstance(issued,dict) and issued.get('status') in ('final','enrolled'),'Enrollment is not FINAL; preserve the original journal')
                with self.state_lock:
                    self.state['companies'][child]['enrollment_effect_recorded']=True;self.save()
            except Exception as error:
                if isinstance(error,(CompanyPreflightRefused,RegistryReadUnavailable)):
                    with self.state_lock:
                        row=self.state['companies'][child]
                        require(row['enrollment_attempts']==attempt_no,'Issuer attempt changed before no-dispatch completion')
                        row['enrollment_no_dispatch']=row.get('enrollment_no_dispatch',0)+1
                        row['last_enrollment_no_dispatch']={'schema':1,'attempt':row['enrollment_attempts'],'source':'trusted_local_issuer','kind':type(error).__name__,'signing_started':False,'intent_saved':False,'submission_started':False}
                        self.save()
                    raise
                raise SharedIssuerUncertain('Shared enrollment outcome requires original-journal review') from error
        else:
            require(self.state['companies'][child]['phase']=='enrolled','Unknown private enrollment phase')
        gateway={'network':'testnet','rpc_url':adapter.RPC,'chain_id':'testnet','contract_id':child,'operator_id':self.spec['operator_id'],'operator_key_file':str(directory/'restricted-operator.json'),'journal':str(directory/'rpc-journal.json'),'expected_code_hash':self.spec['company_code_hash'],'worker_key_id':self.spec['worker_key_id']}
        worker={'data_dir':str(directory),'gateway':gateway};worker_path=directory/'worker-config.json'
        profile={'schema':1,'profile':adapter.PROFILE,'worker_config':str(worker_path),'pins':{k:gateway[k] for k in ('contract_id','expected_code_hash','worker_key_id')},'model':MODEL,'model_digest':EXPECTED_DIGEST,'acknowledgement':adapter.ACKNOWLEDGEMENT}
        for file,value in ((worker_path,worker),(directory/'mock-profile.json',profile)):
            if file.exists():require(read_json(file)==value,'Existing company worker configuration differs')
            else:atomic(file,value)
        with self.state_lock:self.state['companies'][child]['phase']='enrolled';self.save()
        return adapter.load_profile(str(directory/'mock-profile.json'))
    def dispatch_ready(self):return self._dispatch_ready()
    def model_dispatch_ready(self):return self._dispatch_ready(post_reservation=True)
    def _dispatch_ready(self,*,post_reservation=False):
        def bounded():
            if self.read_pause_error is not None and not post_reservation:raise ServiceUnavailable('Known read cooldown must finish before new effects') from self.read_pause_error
            require(not self.fatal and not self.stop.is_set() and int(time.time())<int(self.spec['service_expires_at']) and (self.deadline is None or time.monotonic()<self.deadline),'Fleet is stopping, finite runtime ended or lease expired')
        try:
            # A queued heartbeat-read pause blocks new reservations and writes.
            # An already reserved model call independently rechecks local and
            # native availability, fatal/stop and the original finite deadline.
            bounded();model_ready();bounded();ready=self.registry.dispatch_ready();bounded();return ready
        except Exception as error:
            if read_failure(error) is not None:
                self.queue_read_pause(error);raise ServiceUnavailable('Shared read transport requires bounded cooldown') from error
            # NearAIClient deliberately catches transport/reservation failures.
            # Preserve a shared stop even when that inner client returns unknown.
            self.fatal='ServiceUnavailable';self.fatal_error=error;self.stop.set()
            raise ServiceUnavailable('Shared service is unavailable before dispatch') from error
    def fail_bridge_read(self,record,error):
        diagnostic=bridge_read_failure(error);require(diagnostic is not None,'Trusted correlated bridge read refusal required')
        converted=RegistryReadUnavailable(diagnostic['method'],diagnostic['http_status'],diagnostic['error_kind'],1);converted.diagnostic=diagnostic
        row=self.state['companies'][record['child']];row['read_preflight']=diagnostic;self.save()
        self.queue_read_pause(converted);return converted
    def _tick_company(self,record,header):
        if not self.registry.company_ready(record,header):return None
        self.dispatch_ready()
        profile=self.prepare(record);gateway=adapter.DiagnosticRPCGateway(dict(profile.gateway))
        try:
            snapshot=gateway.start();adapter._check_started(profile,gateway,snapshot)
            require(snapshot['contract'].get('owner')==record['creator'],'Worker owner differs from factory creator')
            vault=adapter._ExistingVault(profile.data_dir/'vault');require(public_manifest(vault)['worker_key_id']==self.spec['worker_key_id'],'Service encryption key differs')
            adapter._bind_runtime(profile)
            bounded=FleetGateway(gateway,record['creator'],self.spec['worker_key_id'],self.dispatch_ready,lambda error:self.fail_bridge_read(record,error))
            with self.state_lock:
                self.state['companies'][record['child']]['runtime_created']=True;self.save()
                engine=adapter.create_executor(profile,bounded,executor_class=FleetExecutor,before_model=self.model_dispatch_ready)
            engine.client=FleetLimitedClient(engine.client,lambda:self.counts(record['child'],allow_inflight=True),self.dispatch_ready)
            self.in_tick=record['child']
            result=engine.tick();self.in_tick=None
            if self.fatal:raise ServiceUnavailable('Shared dispatch gate stopped the fleet during this tick') from self.fatal_error
            count,total=self.counts(record['child'])
            self.state['companies'][record['child']]['logical_calls']=count;self.save()
            if self.read_pause_error is not None:raise ServiceUnavailable('Known read failure ended this tick without retry') from self.read_pause_error
            return {'company_id':record['child'],'status':result.get('status'),'logical_calls':count,'fleet_logical_calls':total}
        except PreflightRefused as error:
            if bridge_read_failure(error):raise self.fail_bridge_read(record,error) from error
            raise
        finally:self.in_tick=None;gateway.close()
    def tick(self,found=None):
        found=found or self.registry.discover();height=found['block']['height']
        require(height>=self.state['last_block_height'],'Final registry height went backwards')
        self.state['last_block_height']=height;self.save();results=[]
        for record in found['records']:
            if self.stop.is_set():break
            require(int(time.time())<int(self.spec['service_expires_at']),'Service expired')
            if self.state['companies'].get(record['child'],{}).get('quarantine'):
                results.append({'company_id':record['child'],'status':'quarantined'});continue
            try:
                result=self._tick_company(record,found['block'])
                if result:results.append(result)
            except (ServiceUnavailable,FleetAccountingError,SharedIssuerUncertain,RegistryReadUnavailable):raise
            except Exception as error:
                self.quarantine(record,type(error).__name__)
                results.append({'company_id':record['child'],'status':'quarantined'})
        return results
    def run(self,seconds=172800,interval=15):
        require(type(seconds) is int and 1<=seconds<=172800 and type(interval) is int and 10<=interval<=60,'Finite fleet service bounds required')
        wall_remaining=int(self.spec['service_expires_at'])-int(time.time())
        require(0<wall_remaining<=172800,'Service has expired or exceeds48hours')
        deadline=time.monotonic()+min(seconds,wall_remaining);self.deadline=deadline
        try:
            vault=adapter._ExistingVault(self.root/'vault')
            require(public_manifest(vault)['worker_key_id']==self.spec['worker_key_id'],'Shared service RSA differs before announcing readiness')
            self.counts();backoff=30;recovering=False
            try:self.heartbeat()
            except Exception as error:
                if read_failure(error) is None:raise
                self.queue_read_pause(error)
            thread=threading.Thread(target=self._heartbeat_loop,name='founder-fleet-heartbeat',daemon=False);thread.start()
            while time.monotonic()<deadline and not self.stop.is_set():
                try:
                    found=None
                    if recovering:
                        # An old online Native heartbeat cannot clear a known
                        # local-health pause until the model is healthy again.
                        previous=self.read_pause_error
                        model_ready()
                        found=self.registry.discover(online=False)
                        if found['service'].get('online') is not True:self.heartbeat();found=None
                        with self.state_lock:
                            if self.read_pause_error is previous:self.read_pause_error=None
                    if self.read_pause_error is not None:raise ServiceUnavailable('Known read cooldown pending') from self.read_pause_error
                    if not recovering:model_ready()
                    print(json.dumps({'profile':PROFILE,'execution_backend':'local_ollama','companies':self.tick(found)}),flush=True)
                    backoff=30;recovering=False;self.stop.wait(min(interval,max(0,deadline-time.monotonic())))
                except Exception as error:
                    if read_failure(error) is None:raise
                    self.counts(allow_inflight=True);self.queue_read_pause(error);self.record_read_pause(error,backoff,'registry_or_worker')
                    print(json.dumps({'profile':PROFILE,'status':'known_read_cooldown','seconds':backoff,'read_failure':read_failure(error),'writes_retried':0,'models_retried':0}),flush=True)
                    self.stop.wait(min(backoff,max(0,deadline-time.monotonic())));backoff=min(120,backoff*2);recovering=True
            if self.fatal:
                if self.fatal_error is not None:raise self.fatal_error
                raise ServiceUnavailable('Service heartbeat failed; fleet halted')
        except BaseException as error:
            self.state['halted']={'error_kind':type(error).__name__,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'instruction':'Inspect original private issuer/worker/model journals; no automatic resend or ledger clearing.'}
            diagnostic=read_failure(error)
            if diagnostic:self.state['halted']['read_failure']=diagnostic
            self.save();raise
        finally:
            self.stop.set()
            if 'thread' in locals():thread.join(timeout=115);require(not thread.is_alive(),'Heartbeat subprocess teardown uncertain')

    def recovery_audit(self):
        """Read-only proof for an explicit transport-halt resume, never a resend."""
        original=read_json_bytes(self.path);require(json.loads(original)==self.state,'Fleet state changed before recovery audit')
        halted=self.state.get('halted');require(isinstance(halted,dict),'Only a halted fleet can be audited for resume')
        legacy=halted.get('error_kind')=='HTTPError' and 'read_failure' not in halted
        diagnostic=halted.get('read_failure')
        operator_stop=halted.get('error_kind')=='KeyboardInterrupt'
        require(operator_stop or legacy or (isinstance(diagnostic,dict) and diagnostic.get('read_only') is True and diagnostic.get('method') in ('status','block','query','EXPERIMENTAL_protocol_config')),'Halt is not a known read-only transport failure or explicit operator stop')
        require(len(self.state.get('resume_history',[]))<3,'Explicit transport resume lifetime cap reached')
        argv=['node','--dns-result-order=ipv4first','--network-family-autoselection-attempt-timeout=2000',str(SOURCE/'executor/fleet_enrollment.mjs'),self.config_file,'audit-journals']
        env={k:os.environ[k] for k in ('PATH','LANG','LC_ALL','TMPDIR','TZ') if k in os.environ}
        result=subprocess.run(argv,cwd=SOURCE,env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=110,check=False)
        require(result.returncode==0 and len(result.stdout)<=131072,'Original signed-intent journals could not be audited')
        journals=json.loads(result.stdout);require(journals.get('status')=='audited' and journals.get('factory')==self.spec['factory_id'] and journals.get('operator')==self.spec['operator_id'] and all(journals.get(k)==0 for k in ('key_reads','network_requests','signatures','broadcasts')),'Exact offline journal audit required')
        issuer_locks=journals.get('issuer_locks',[]);require(isinstance(issuer_locks,list) and len(issuer_locks)<=2 and len({r.get('name') for r in issuer_locks})==len(issuer_locks),'Exact bounded issuer lock audit required')
        for item in issuer_locks:issuer_lock_snapshot(self.root,item)
        require({r['company'] for r in journals['companies']}==set(self.state['companies']),'Company journal inventory differs from retained fleet state')
        hashes=dict(journals['journal_files']);logical={};lanes={r['company']:r for r in journals['companies']}
        for child,row in self.state['companies'].items():
            lane=lanes[child]
            require(lane.get('phase') in ('unstarted_no_dispatch','prepared_no_dispatch','enrolled_no_dispatch','initialized_final') and type(lane.get('accounting_required')) is bool,'Exact dispatch-phase audit required')
            require(lane['accounting_required']==(row.get('runtime_created') is True),'Retained worker accounting phase differs')
            directory=self.companies/hashlib.sha256(child.encode()).hexdigest()
            logical[child]=0
            for name in (adapter.LEDGER_DIRECTORY+'/ledger.json','near-ai/ledger.json'):
                file=directory/name
                if not file.exists():require(not lane['accounting_required'] and row.get('logical_calls',0)==0,'Initialized original inference accounting is missing');continue
                ledger=read_json(file);calls=ledger.get('calls');require(isinstance(calls,dict) and all(isinstance(call,dict) and call.get('status')=='complete' for call in calls.values()),'Unknown inference reservations must remain halted')
                if name.startswith('near-ai/'):require(not calls,'Alternate inference ledger is not empty')
                else:logical[child]=len(calls)
                require(lane['accounting_required'] or not calls,'Uninitialized company has inference reservations')
                hashes[str(file.relative_to(self.root))]=hashlib.sha256(file.read_bytes()).hexdigest()
        self.counts()
        if legacy:require(sum(logical.values())==0 and all(r['worker_writes']==0 for r in journals['companies']),'Legacy unclassified HTTPError requires proof no worker writes or model reservations occurred')
        found=self.registry.discover(online=False);require(found['block']['height']>=self.state['last_block_height'],'Recovery FINAL height went backwards')
        records={r['child']:r for r in found['records']};restore=[]
        for child,row in self.state['companies'].items():
            record=records.get(child);require(record is not None and {k:record[k] for k in row['binding']}==row['binding'],'Original active factory company binding changed')
            quarantine=row.get('quarantine')
            if quarantine and quarantine.get('reason') not in ('HTTPError','RegistryReadUnavailable'):continue
            if lanes[child]['phase']=='prepared_no_dispatch' or lanes[child].get('worker_key_present') is False:continue
            try:ready=self.registry.company_ready(record,found['block'])
            except ValueError:ready=False
            if quarantine and ready:restore.append(child)
        require(self.path.read_bytes()==original,'Fleet state changed during recovery audit')
        for name,digest in hashes.items():require(hashlib.sha256(read_json_bytes(self.root/name)).hexdigest()==digest,'Original journal/ledger changed during recovery audit')
        return {'schema':'near-founder-transport-resume-audit-v1','resume_reason':'OPERATOR_STOP' if operator_stop else 'TRANSPORT_RECOVERY','state_sha256':hashlib.sha256(original).hexdigest(),'identity':self.state['identity'],'journal_files':hashes,'issuer_locks':issuer_locks,'logical_calls':logical,'restore_companies':restore,'legacy_no_worker_writes_or_inference':legacy,'observed_block_hash':found['block']['hash'],'observed_block_height':found['block']['height'],'service_online_observed':found['service'].get('online'),'lease_expires_at':self.spec['service_expires_at'],'audited_at':int(time.time()),'expires_at':int(time.time())+300,'signatures':0,'broadcasts':0,'model_calls':0}

    def prepare_resume(self):
        audit=self.recovery_audit();raw=json.dumps(audit,sort_keys=True,separators=(',',':')).encode();digest=hashlib.sha256(raw).hexdigest();directory=self.root/'resume-audits'
        if not directory.exists():directory.mkdir(mode=0o700)
        adapter._directory(str(directory));write_once(directory/(digest+'.json'),raw)
        return {'status':'resume_audited_not_activated','resume_reason':audit['resume_reason'],'audit_sha256':digest,'audit_file':str(directory/(digest+'.json')),'expires_at':audit['expires_at'],'service_online_observed':audit['service_online_observed'],'signatures':0,'broadcasts':0,'model_calls':0}

    def approve_resume(self,digest):
        require(isinstance(digest,str) and re.fullmatch(r'[a-f0-9]{64}',digest),'Exact Root-reviewed recovery audit hash required')
        file=self.root/'resume-audits'/(digest+'.json');raw=read_json_bytes(file);require(hashlib.sha256(raw).hexdigest()==digest,'Recovery audit changed');audit=json.loads(raw)
        require(audit.get('schema')=='near-founder-transport-resume-audit-v1' and int(time.time())<audit['expires_at'],'Original recovery approval expired')
        fresh=self.recovery_audit()
        for field in ('resume_reason','state_sha256','identity','journal_files','issuer_locks','logical_calls','restore_companies','legacy_no_worker_writes_or_inference'):require(fresh[field]==audit[field],'Original recovery inputs changed; review a fresh audit')
        require(int(time.time())<audit['expires_at'] and int(time.time())<int(self.spec['service_expires_at']),'Recovery approval or service lease expired during its fresh audit')
        original=read_json_bytes(self.path);require(hashlib.sha256(original).hexdigest()==audit['state_sha256'],'Original halted state changed')
        write_once(file.parent/('original-'+audit['state_sha256']+'.json'),original)
        # Only the exact Root-approved, repeatedly audited DEAD owners may be
        # removed under the fleet lease. Preserve their full metadata first.
        locks=audit['issuer_locks'];snapshots=[issuer_lock_snapshot(self.root,item) for item in locks]
        if locks:write_once(file.parent/('issuer-locks-'+digest+'.json'),json.dumps(locks,sort_keys=True,separators=(',',':')).encode())
        for item,(directory,owner_file,owner_raw) in zip(locks,snapshots):
            issuer_lock_snapshot(self.root,item)
            owner_file.unlink();directory.rmdir()
            fd=os.open(self.root,os.O_RDONLY)
            try:os.fsync(fd)
            finally:os.close(fd)
        next_state=copy.deepcopy(self.state);next_state.setdefault('halted_history',[]).append(next_state['halted']);next_state['halted']=None
        for child in audit['restore_companies']:
            row=next_state['companies'][child];row.setdefault('quarantine_history',[]).append(row['quarantine']);row['quarantine']=None
            if row['phase']=='quarantined':row['phase']='preparing'
        next_state.setdefault('resume_history',[]).append({'reason':audit['resume_reason'],'audit_sha256':digest,'original_state_sha256':audit['state_sha256'],'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'journal_and_model_ledgers_preserved':True})
        self.state=next_state;self.save()
        return {'status':'explicit_operator_stop_resume_recorded_not_activated' if audit['resume_reason']=='OPERATOR_STOP' else 'explicit_transport_resume_recorded_not_activated','resume_reason':audit['resume_reason'],'audit_sha256':digest,'original_state_sha256':audit['state_sha256'],'preserved_journal_files':len(audit['journal_files']),'retained_logical_reservations':sum(audit['logical_calls'].values()),'signatures':0,'broadcasts':0,'model_calls':0}


@contextlib.contextmanager
def fleet_lease(root):
    path=root/'fleet.lease';fd=os.open(path,os.O_RDWR|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
    try:
        info=os.fstat(fd);require(stat.S_ISREG(info.st_mode) and not info.st_mode&0o077 and info.st_uid==os.getuid(),'Private fleet lease required')
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);yield
    finally:os.close(fd)


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('action',choices=('validate','prepare','run','audit-resume','resume'));parser.add_argument('--config',required=True);parser.add_argument('--confirm-testnet-founder-service',action='store_true');parser.add_argument('--approved-resume-sha');parser.add_argument('--seconds',type=int,default=172800);parser.add_argument('--interval',type=int,default=15);args=parser.parse_args(argv)
    spec=load_fleet(args.config)
    if args.action=='validate':
        print(json.dumps({'profile':PROFILE,'network':'testnet','factory_id':spec['factory_id'],'worker_key_id':spec['worker_key_id'],'execution_backend':'local_ollama','cloud_billing_verified':False,'tee_verified':False,'max_companies':8,'max_logical_reservations_per_company':2,'max_logical_reservations_global':16,'service_expires_at':spec['service_expires_at'],'credential_files_read':False,'network_requests':0,'activated':False}));return 0
    if args.action=='prepare':
        with fleet_lease(Path(spec['root_dir'])):Fleet(args.config,spec)
        print(json.dumps({'profile':PROFILE,'prepared':True,'credential_files_read':False,'network_requests':0,'activated':False}));return 0
    if args.action in ('audit-resume','resume'):
        with fleet_lease(Path(spec['root_dir'])):
            service=Fleet(args.config,spec,allow_halted=True)
            result=service.prepare_resume() if args.action=='audit-resume' else service.approve_resume(args.approved_resume_sha)
        print(json.dumps(result));return 0
    require(args.confirm_testnet_founder_service,'Explicit finite testnet founder-service activation required')
    with fleet_lease(Path(spec['root_dir'])):
        Fleet(args.config,spec).run(args.seconds,args.interval)
    return 0


if __name__=='__main__':
    signal.signal(signal.SIGTERM,lambda *_:(_ for _ in ()).throw(KeyboardInterrupt()))
    try:raise SystemExit(main())
    except KeyboardInterrupt:raise SystemExit(130)
    except Exception as error:
        print(json.dumps({'profile':PROFILE,'status':'refused_or_halted','error_kind':type(error).__name__,'action':'Inspect protected configuration and original journals; no automatic retry.'}),flush=True);raise SystemExit(2)
