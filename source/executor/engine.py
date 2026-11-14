"""Chain-driven, replaceable QA company worker with no owner/customer key.

One bounded transition per tick; read-only idle polling never calls a model.
Customer requests and financial state are reconstructed from the contract.
The private journal caches encrypted work, not authoritative balances or keys.
"""
import copy
import hashlib
import json
import os
import re
from pathlib import Path
import stat
import tempfile
import threading
from app.near_ai_client import NearAIClient,DEFAULT
from app.company_intelligence import CompanyIntelligence
from app.onchain_ai import OnchainAI
from executor.crypto import public_manifest,open_record_key,private_cache_keys,committed_plaintext,json_object
from executor.qa import ScopedQA
from executor.inference import isolated_transport
from executor.archive import TraceArchive


class FinalizedWriteFailure(ValueError):
    """A failed write with fees already verified by the restricted RPC gateway."""
    def __init__(self,command,args,tx):
        super().__init__('Finalized worker transaction failed')
        self.command=command;self.operation_args=copy.deepcopy(args);self.tx=copy.deepcopy(tx)


class ReadOnlyAIAuthority(OnchainAI):
    def configure(self,policy):
        # Adopt only an already owner-signed chain policy; never sign owner calls.
        expected=self.translate(policy);actual=self.status()
        if any(actual.get(k)!=v for k,v in expected.items()):raise ValueError('Owner AI policy mismatch')
        return None


def read_secret(path):
    try:fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    except FileNotFoundError:return ''
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_mode&0o077 or info.st_uid!=os.getuid() or info.st_size>4096:raise ValueError('Unsafe provider key file')
        with os.fdopen(fd,'r',closefd=False) as f:value=f.read().strip()
        if not 16<=len(value)<=4096 or any(not 33<=ord(c)<=126 for c in value):raise ValueError('Invalid provider key')
        return value
    finally:os.close(fd)


class CompanyExecutor:
    def __init__(self,gateway,vault,private_dir,*,sandbox=False,checker_factory=ScopedQA,transport=None,key_provider=None):
        self.gateway=gateway;self.vault=vault;self.path=Path(private_dir);self.path.mkdir(mode=0o700,parents=True,exist_ok=True)
        st=self.path.lstat()
        if not self.path.is_absolute() or not stat.S_ISDIR(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid():raise ValueError('Executor directory must be private')
        self.journal=self.path/'work.json';self.data={'version':1,'tasks':{},'transactions':[]};self.sandbox=sandbox;self.checker_factory=checker_factory;self.lock=threading.Lock();self.last={'status':'starting'};self.client=None;self.intelligence=None
        if self.journal.exists():
            info=self.journal.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_mode&0o077 or info.st_uid!=os.getuid() or info.st_size>2_000_000:raise ValueError('Unsafe worker journal')
            self.data=json.loads(self.journal.read_text())
            if self.data.get('version')!=1 or not isinstance(self.data.get('tasks'),dict):raise ValueError('Invalid worker journal')
        config=getattr(gateway,'config',{});network=config.get('network','sandbox' if sandbox else 'testnet');contract=config.get('contract_id','company.test.near')
        self.archive=TraceArchive(self.path/'work.archive',{'network':network,'contract':contract,'worker_key_id':public_manifest(vault)['worker_key_id']});self.archive.validate(self.data)
        cache_key,identity_key=private_cache_keys(vault,network,contract)
        self.client=NearAIClient(self.path/'near-ai'/'ledger.json',lambda text:vault.encrypt(text,cache_key)['envelope'],lambda envelope:vault.decrypt(envelope,cache_key),transport=transport or isolated_transport,key_provider=key_provider or (lambda:read_secret(self.path/'near-ai-key')),authority=ReadOnlyAIAuthority(gateway),identity_key=identity_key)
        self.intelligence=CompanyIntelligence(self.client)
    def _save(self):
        self.archive.compact(self.data)
        raw=json.dumps(self.data,separators=(',',':'),sort_keys=True).encode()
        if len(raw)>2_000_000:raise ValueError('Worker cache capacity exhausted; export before continuing')
        if self.journal.exists() and self.journal.read_bytes()==raw:return
        fd,tmp=tempfile.mkstemp(dir=self.path,prefix='.work-')
        try:
            with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
            os.replace(tmp,self.journal)
            directory=os.open(self.path,os.O_RDONLY)
            try:os.fsync(directory)
            finally:os.close(directory)
        finally:
            if os.path.exists(tmp):os.unlink(tmp)
    def _read(self,command,**args):
        value=self.gateway.call(command,**args)
        if not isinstance(value,dict) or value.get('ok') is not True:raise ValueError('Authoritative chain view unavailable')
        return value
    def _write(self,command,**args):
        value=self.gateway.call(command,**args)
        if not isinstance(value,dict) or type(value.get('ok')) is not bool:raise ValueError('Authoritative write result unavailable')
        if value.get('pending') or getattr(self.gateway,'pending',False):raise ValueError('Transaction remains pending; reconcile before continuing')
        tx=value.get('tx')
        if value['ok'] is not True:
            # RPCGateway supplies failed-write tx metadata only after its Node
            # bridge verifies FINAL, identity, complete receipts and exact fees.
            # A transport/preflight/unknown error cannot enter this branch.
            self._record_finalized_failure(command,args,tx)
            raise FinalizedWriteFailure(command,args,tx)
        if isinstance(tx,dict):
            self.data['transactions'].append(copy.deepcopy(tx))
            self._save()
        return value
    def _record_finalized_failure(self,command,args,tx):
        fields={'method','job_id','hash','signer','receiver','gas_burnt','tokens_burnt','receipts'}
        config=getattr(self.gateway,'config',{})
        if any(not isinstance(config.get(name),str) or not config[name] for name in ('operator_id','contract_id')):raise ValueError('Unverified failed transaction account')
        if not isinstance(tx,dict) or set(tx)!=fields or tx['method']!=command or tx['job_id']!=args.get('id') or tx['signer']!=config.get('operator_id') or tx['receiver']!=config.get('contract_id'):raise ValueError('Unverified failed transaction identity')
        valid_hash=lambda value:isinstance(value,str) and re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}',value) is not None
        if not valid_hash(tx['hash']) or not isinstance(tx['receipts'],list) or len(tx['receipts'])>256 or any(not valid_hash(value) for value in tx['receipts']) or len(set(tx['receipts']))!=len(tx['receipts']):raise ValueError('Unverified failed transaction receipts')
        for name,bits in (('gas_burnt',64),('tokens_burnt',128)):
            value=tx[name]
            if not isinstance(value,str) or not re.fullmatch(r'0|[1-9][0-9]{0,38}',value) or int(value)>=2**bits:raise ValueError('Unknown failed transaction fee')
        record={**copy.deepcopy(tx),'status':'failed'}
        for previous in self.data['transactions']:
            if previous.get('hash')==record['hash']:
                if previous!=record:raise ValueError('Conflicting failed transaction trace')
                return
        self.data['transactions'].append(record);self._save()
    def _recover_write_failure(self,failure,tasks):
        # Recovery is a new read-only observation, never a resend of the failed
        # signed intent. Unknown outcomes never become FinalizedWriteFailure.
        if getattr(self.gateway,'pending',False):raise failure
        preterminal_commands={'approve_order','company_tick','company_attest','settle','pay','cancel','decline_order'}
        # A refund makes preterminal work obsolete, but does not explain why
        # archiving that refunded work failed. Unknown archive defects halt.
        if failure.command not in preterminal_commands:raise failure
        fresh=self.gateway.snapshot()
        freeze_checked={'approve_order','company_tick','company_attest','settle','pay'}
        if failure.command in freeze_checked and (fresh['contract'].get('frozen') is True or fresh['company'].get('frozen') is True):return self._result('frozen')
        task_ids={'approve_order','company_tick','company_attest'}
        task=next((row for row in tasks if row.get('kind')=='qa' and row.get('worker_key_id')==public_manifest(self.vault)['worker_key_id'] and (row.get('id') if failure.command in task_ids else row.get('job_id'))==failure.operation_args.get('id')),None)
        if task:
            job=self._read('job',id=task['job_id']).get('job')
            if isinstance(job,dict) and job.get('status') in ('refunding','refunded'):
                return self._result('work_changed',task_id=task['id'],reason='customer_refund',job_status=job['status'])
        # A policy edit alone does not explain an arbitrary failed transaction.
        # Leave unexpected known failures fatal for explicit operator inspection.
        raise failure
    def _sync_policy(self):
        p=self._read('ai_policy')['policy']
        if p.get('version',0)==0:return
        desired={k:p[k] for k in ('enabled','scope_consent','allow_expensive','max_input_tokens','max_output_tokens','max_calls_per_job','max_calls_per_day')}
        desired.update(model=p['selected_model'],per_call_nanos=int(p['per_call_nanos']),daily_nanos=int(p['daily_nanos']),run_nanos=int(p['lifetime_nanos']))
        # This can only validate and adopt the contract policy, never increase it.
        if self.client.status()['local_policy']!=desired:self.client.configure(desired)
    def _scope(self,task,profile):
        if task.get('worker_key_id')!=public_manifest(self.vault)['worker_key_id'] or profile.get('worker_key_id')!=task['worker_key_id']:raise ValueError('Worker key unavailable for this order')
        if task.get('execution_profile_version')!=profile.get('version') or profile.get('profile')!='website-qa-v1':raise ValueError('Execution profile mismatch')
        key=open_record_key(self.vault,task['worker_sealed_key'],task['worker_key_id'])
        scope=json_object(committed_plaintext(self.vault,task['encrypted_scope'],task['scope_hash'],key))
        expected={'profile':'website-qa-v1','target':profile['target_origin'],'authorized':True,'checks':['broken_links','image_alt']}
        if type(scope.get('authorized')) is not bool or scope!=expected:raise ValueError('Only the exact authorized QA scope is supported')
        checker=self.checker_factory(profile['target_origin'],sandbox=self.sandbox)
        return key,checker
    def _mission(self,snap,profile):
        key=open_record_key(self.vault,profile['mission_sealed_key'],profile['worker_key_id'])
        c=profile;idea=committed_plaintext(self.vault,c['encrypted_idea'],c['idea_hash'],key);goal=committed_plaintext(self.vault,c['encrypted_goal'],c['goal_hash'],key)
        if not idea.strip() or not goal.strip() or len(idea.encode())>2000 or len(goal.encode())>2000:raise ValueError('Invalid encrypted company mandate')
        return idea,goal
    def _result(self,status,**values):self.last={'status':status,**values};return dict(self.last)
    def tick(self):
        if not self.lock.acquire(blocking=False):return self._result('busy')
        tasks=[]
        try:
            if getattr(self.gateway,'pending',False):
                r=self.gateway.reconcile()
                if r.get('status') not in ('none','final','failed'):return self._result('needs_reconciliation')
            snap=self.gateway.snapshot()
            if snap['contract'].get('frozen') or snap['company'].get('frozen'):return self._result('frozen')
            tasks=[];cursor=0
            for _ in range(2):
                page=self._read('company_list',from_index=cursor,limit=20)['tasks'];tasks.extend(page['items']);cursor=page.get('next_index')
                if cursor is None:break
            else:
                if cursor is not None:raise ValueError('Queue exceeds bounded execution profile')
            # A crash after the on-chain archive but before local cache cleanup
            # must not accumulate encrypted task entries forever. Confirm one
            # absent cached task directly; never prune an active/unknown record.
            active={task['id'] for task in tasks}
            for cached in self.data['tasks']:
                if cached in active:continue
                old=self._read('company_task',id=cached)['task']
                if old and old.get('status')=='archived' and old.get('worker_key_id')==public_manifest(self.vault)['worker_key_id']:
                    job=self._read('job',id=old['job_id'])['job']
                    if job and job.get('status') in ('paid','refunded'):
                        self.data['tasks'].pop(cached);self._save();return self._result('cache_reconciled',task_id=cached)
                break
            if not tasks:return self._result('awaiting_demand')
            # Terminal accounting comes first; no model is invoked for recovery.
            for task in tasks:
                if task.get('kind')!='qa' or not task.get('worker_sealed_key'):continue
                if task.get('worker_key_id')!=public_manifest(self.vault)['worker_key_id']:continue
                job=self._read('job',id=task['job_id'])['job']
                if job['status'] in ('paid','refunded'):
                    self._write('company_archive',id=task['id']);self.data['tasks'].pop(task['id'],None);self._save();return self._result('archived',task_id=task['id'])
                if job['status'] in ('paying','refunding','cancelling'):return self._result('pending',task_id=task['id'])
                if task['status']=='attested':
                    if job['status']=='accepted':self._write('settle',id=task['job_id']);return self._result('settled',task_id=task['id'])
                    if job['status']=='settled':self._write('pay',id=task['job_id']);return self._result('paid',task_id=task['id'])
            for task in tasks:
                if task.get('kind')!='qa' or not task.get('worker_sealed_key'):continue
                if task.get('worker_key_id')!=public_manifest(self.vault)['worker_key_id']:continue
                job=self._read('job',id=task['job_id'])['job']
                if task['status'] not in ('pending_review','queued','blocked','hired'):continue
                profile=self._read('execution_profile',version=task['execution_profile_version'])['execution_profile']
                try:key,checker=self._scope(task,profile)
                except ValueError:
                    if job['status']=='escrowed':self._write('decline_order',id=task['job_id'],reason='unsupported_scope')
                    elif job['status']=='accepted':self._write('cancel',id=task['job_id'])
                    return self._result('declined',task_id=task['id'])
                entry=self.data['tasks'].setdefault(task['id'],{})
                if task['status']=='pending_review':
                    self._sync_policy()
                    if 'triage' not in entry:
                        idea,goal=self._mission(snap,profile);decision=self.intelligence.triage(idea,goal,task['job_id'])
                        entry['triage']=self.vault.encrypt(json.dumps(decision,separators=(',',':')),key);self._save()
                    decision=json_object(self.vault.decrypt(entry['triage']['envelope'],key))
                    if decision['decision']!='execute_supported_qa':self._write('decline_order',id=task['job_id'],reason='unsupported_scope');return self._result('declined',task_id=task['id'])
                    self._write('approve_order',id=task['id']);return self._result('approved',task_id=task['id'])
                if task['status'] in ('queued','blocked'):
                    ready=self._read('company_tick_readiness',id=task['id'])['readiness']
                    if not ready.get('ready') and task['status']=='blocked':continue
                    self._write('company_tick',id=task['id'],**({'retry_blocked':True} if task['status']=='blocked' else {}))
                    return self._result('hired' if ready.get('ready') else 'blocked',task_id=task['id'],reason=ready.get('reason'))
                if task['status']=='hired':
                    if 'evidence' not in entry:
                        try:
                            report=checker.run();verification=checker.verify(report)
                            if verification.get('verified') is not True:raise ValueError('Independent verification failed')
                        except Exception:
                            self._write('cancel',id=task['job_id']);return self._result('verification_failed',task_id=task['id'])
                        self._sync_policy();priority=self.intelligence.prioritize(report['findings'],task['job_id'])
                        by_id={f['id']:f for f in verification['findings']};report['findings']=[by_id[i] for i in priority['order']]
                        payload={'report':report,'verification':verification,'intelligence':{'priority':priority}}
                        if 'triage' in entry:payload['intelligence']['triage']=json_object(self.vault.decrypt(entry['triage']['envelope'],key))
                        try:entry['evidence']=self.vault.encrypt(json.dumps(payload,separators=(',',':')),key)
                        except ValueError:
                            self._write('cancel',id=task['job_id']);return self._result('report_too_large',task_id=task['id'])
                        self._save()
                    ev=entry['evidence'];self._write('company_attest',id=task['id'],evidence_hash=ev['hash'],encrypted_evidence=ev['envelope']);return self._result('attested',task_id=task['id'])
            return self._result('waiting_for_policy_or_keys')
        except FinalizedWriteFailure as failure:
            return self._recover_write_failure(failure,tasks)
        finally:self.lock.release()
