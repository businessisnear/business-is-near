"""Restricted NEAR testnet/local-sandbox NDJSON worker gateway.

This class never loads an owner/customer credential and cannot sign deposits.
Unknown broadcasts halt writes until explicit chain-status reconciliation.
"""
import fcntl, hashlib, json, os, select, stat, subprocess, threading
from pathlib import Path
from uuid import uuid4

ROOT=Path(__file__).resolve().parents[1]
READ={'state','company_state','execution_profile','company_task','company_list','company_history','company_tick_readiness','job','jobs_list','order_quote','company_order_quote','company_solvency','ai_policy','ai_call','ai_media_policy','ai_media_call','reconcile','company_mandate','company_mandates','company_mandate_readiness','company_inbox','company_inbox_messages'}
WRITE={'approve_order','company_tick','company_attest','settle','pay','cancel','decline_order','company_archive','company_archive_keeper','ai_reserve_call','ai_complete_call','ai_reserve_media_call','ai_complete_media_call','company_run_mandate','company_commit_plan'}
ENV={'network':'PROOF_WORK_RPC_NETWORK','rpc_url':'PROOF_WORK_RPC_URL','chain_id':'PROOF_WORK_RPC_CHAIN_ID','contract_id':'PROOF_WORK_CONTRACT_ID','operator_id':'PROOF_WORK_OPERATOR_ID','operator_key_file':'PROOF_WORK_OPERATOR_KEY_FILE','journal':'PROOF_WORK_RPC_JOURNAL','expected_code_hash':'PROOF_WORK_EXPECTED_CODE_HASH','worker_key_id':'PROOF_WORK_WORKER_KEY_ID'}
class GatewayError(RuntimeError):pass
class UnknownOutcome(GatewayError):pass
class PreflightRefused(GatewayError):
 """Trusted local bridge proved refusal before signing; worker still halts."""
 def __init__(self,diagnostic):
  super().__init__('Local RPC preflight refused before signing; worker halted')
  self.diagnostic=diagnostic

PREFLIGHT_TYPES={'Error','TypeError','SyntaxError','RangeError','AbortError','TimeoutError','RPCDeadlineError','ProviderError','RetriesExceeded','UnknownTransaction','UNKNOWN_TRANSACTION','HANDLER_ERROR','INVALID_REQUEST','UNKNOWN_ACCOUNT','UNKNOWN_ACCESS_KEY','CONTRACT_EXECUTION_ERROR','NO_CONTRACT_CODE','SERVER_ERROR','INTERNAL_ERROR','TIMEOUT_ERROR','RPCCommandDeadlineError','RPCCommandStoppedError','OtherError'}
PREFLIGHT_STAGES={'local.validation','local.identity','local.journal','local.archive','local.decode','rpc.status','rpc.access_key','rpc.account','rpc.block'}|{'rpc.view.'+x for x in READ-{'reconcile'}}
PREFLIGHT_KEYS={'version','disposition','scope','request_id','request_sha256','method','stage','journal_validated','journal_pending','signing_started','intent_saved','submission_started'}
def _startup_hash(config):
 return hashlib.sha256(json.dumps([config.get(k) for k in ('network','rpc_url','contract_id','operator_id','expected_code_hash','worker_key_id')],separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def _local_preflight(result,scope,request_id,request_hash,command,pending):
 # Exact schema/correlation over the existing trusted parent-child pipe. Neither
 # an SDK object nor arbitrary error fields can manufacture this local assertion.
 p=result.get('no_dispatch');d=result.get('diagnostic')
 expected={'ready','error','no_dispatch','diagnostic'} if scope=='startup' else {'id','ok','error','tx','no_dispatch','diagnostic'}
 if set(result)!=expected or pending is not False or not isinstance(p,dict) or set(p)!=PREFLIGHT_KEYS:return None
 if result.get('error')!='Restricted RPC operation refused' or scope=='write' and (result.get('ok') is not False or result.get('tx') is not None) or scope=='startup' and result.get('ready') is not False:return None
 if type(p['version']) is not int or p['version']!=1 or p['disposition']!='local_preflight_refused' or p['scope']!=scope or p['request_id']!=request_id or p['request_sha256']!=request_hash or p['method']!=command or not isinstance(p['stage'],str) or p['stage'] not in PREFLIGHT_STAGES:return None
 if p['journal_validated'] is not True or any(p[k] is not False for k in ('journal_pending','signing_started','intent_saved','submission_started')):return None
 if not isinstance(d,dict) or set(d)!={'stage','error_type','http_status'} or d['stage']!=p['stage'] or not isinstance(d['error_type'],str) or d['error_type'] not in PREFLIGHT_TYPES:return None
 if d['http_status'] is not None and (type(d['http_status']) is not int or not 100<=d['http_status']<=599):return None
 return dict(d)

class RPCGateway:
 def __init__(self,config,timeout=90):
  if not isinstance(config,dict) or set(config)-set(ENV):raise ValueError('Invalid RPC gateway config')
  self.config=dict(config);self.timeout=timeout;self.proc=None;self.lock=threading.RLock();self.broken=False;self.pending=False;self.lease_fd=None
 def _acquire_lease(self):
  journal=self.config.get('journal')
  if not isinstance(journal,str) or not Path(journal).is_absolute():raise ValueError('Absolute journal path required')
  directory=Path(journal).parent;st=directory.lstat()
  if not stat.S_ISDIR(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid():raise ValueError('Journal directory must be private')
  fd=os.open(journal+'.lease',os.O_RDWR|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
  try:
   st=os.fstat(fd)
   if not stat.S_ISREG(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid():raise ValueError('Unsafe RPC lease')
   try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
   except BlockingIOError as exc:raise GatewayError('Another worker holds the RPC lease') from exc
   if os.path.lexists(journal+'.lock'):raise GatewayError('Legacy RPC lock exists; inspect it before recovery')
   self.lease_fd=fd
  except Exception:os.close(fd);raise
 def _read(self,timeout):
  ready,_,_=select.select([self.proc.stdout],[],[],timeout)
  if not ready:raise UnknownOutcome('RPC bridge timeout; reconcile before retry')
  line=self.proc.stdout.readline()
  if not line:raise UnknownOutcome('RPC bridge stopped; reconcile before retry')
  try:value=json.loads(line)
  except (ValueError,UnicodeError) as exc:raise UnknownOutcome('Invalid RPC bridge response') from exc
  if not isinstance(value,dict):raise UnknownOutcome('Invalid RPC bridge response')
  return value
 def start(self):
  with self.lock:
   if self.proc is not None or self.broken:raise GatewayError('Gateway already started or failed closed')
   # The Node child signs only with its restricted operator key. Do not leak
   # provider, hosting, vault, owner, or unrelated inherited credentials.
   env={k:os.environ[k] for k in ('PATH','LANG','LC_ALL','TMPDIR','TZ') if k in os.environ}
   for k,name in ENV.items():
    env.pop(name,None)
    if k in self.config:env[name]=str(self.config[k])
   try:
    self._acquire_lease();env['PROOF_WORK_RPC_LEASE_FD']=str(self.lease_fd)
    argv=['node']
    if self.config.get('network')=='testnet':
     argv+=['--dns-result-order=ipv4first','--network-family-autoselection-attempt-timeout=2000']
    argv.append(str(ROOT/'executor/rpc_bridge.mjs'))
    self.proc=subprocess.Popen(argv,cwd=ROOT,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,bufsize=1,pass_fds=(self.lease_fd,))
    ready=self._read(self.timeout)
    if ready.get('ready') is not True or not isinstance(ready.get('state'),dict):
     diagnostic=_local_preflight(ready,'startup','startup',_startup_hash(self.config),None,self.pending)
     if diagnostic is not None:raise PreflightRefused(diagnostic)
     raise UnknownOutcome('RPC startup uncertain; inspect journal before restarting')
    self.pending=bool(ready.get('pending'));return ready['state']
   except Exception:self.broken=True;self.close();raise
 def call(self,command,**args):
  if command not in READ|WRITE:raise ValueError('Unsupported restricted worker operation')
  if set(args)&{'command','idempotency_id'}:raise ValueError('Reserved RPC correlation field')
  with self.lock:
   if self.broken:raise UnknownOutcome('Gateway failed closed; inspect chain before restarting')
   if self.pending and command in WRITE:raise UnknownOutcome('Pending transaction needs reconciliation')
   request_id=uuid4().hex
   try:
    if not self.proc or self.proc.poll() is not None:raise UnknownOutcome('RPC bridge unavailable')
    request=json.dumps({'command':command,'idempotency_id':request_id,**args})
    self.proc.stdin.write(request+'\n');self.proc.stdin.flush()
    result=self._read(self.timeout)
    if result.get('id')!=request_id or type(result.get('ok')) is not bool:raise UnknownOutcome('Unmatched RPC response')
    if not result['ok'] and result.get('tx') is None and command in WRITE:
     diagnostic=_local_preflight(result,'write',request_id,hashlib.sha256(request.encode()).hexdigest(),command,self.pending)
     if diagnostic is not None:
      self.broken=True;raise PreflightRefused(diagnostic)
     self.pending=True;raise UnknownOutcome('Write outcome uncertain; reconcile before retry')
    if command=='reconcile' and result.get('result',{}).get('status') in ('none','final','failed'):self.pending=False
    return result
   except (OSError,UnknownOutcome) as exc:
    if isinstance(exc,UnknownOutcome) and self.pending:raise
    self.broken=True;raise UnknownOutcome('RPC response uncertain; reconcile on restart') from exc
 def snapshot(self):
  result=self.call('state')
  if result.get('ok') is not True or not isinstance(result.get('state'),dict):raise GatewayError('Chain state unavailable')
  return result['state']
 def reconcile(self):return self.call('reconcile')['result']
 def close(self):
  with self.lock:
   if self.proc and self.proc.poll() is None:
    self.proc.stdin.close()
    try:self.proc.wait(timeout=15)
    except subprocess.TimeoutExpired:raise GatewayError('Bridge did not close; inspect its lock')
   if self.lease_fd is not None:os.close(self.lease_fd);self.lease_fd=None
