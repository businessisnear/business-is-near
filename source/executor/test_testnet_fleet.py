"""Offline fleet boundaries. Synthetic state only; all network/process calls denied."""
import copy
import hashlib
import hmac
import json
from pathlib import Path
import shutil
import tempfile
import time
import types
import urllib.error
import unittest
from unittest import mock

from app.worker_crypto import WorkerVault
from app.near_ai_client import NearAIClient,DEFAULT
from executor.crypto import public_manifest
from executor.local_model import LocalModelClient
from executor import testnet_fleet as fleet
from executor.rpc_gateway import UnknownOutcome


class FleetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.seed=tempfile.TemporaryDirectory(prefix='fleet-offline-vault-')
        cls.vault=WorkerVault(Path(cls.seed.name)/'vault')
        cls.public=public_manifest(cls.vault)
    @classmethod
    def tearDownClass(cls):cls.seed.cleanup()
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='fleet-offline-');self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name).resolve();self.root.chmod(0o700)
        shutil.copytree(Path(self.seed.name)/'vault',self.root/'vault')
        for name in ('operator.json','heartbeat.json'):
            (self.root/name).write_text('synthetic-not-a-wallet-key');(self.root/name).chmod(0o600)
        self.spec={'schema':1,'profile':fleet.PROFILE,'factory_id':'factory.testnet','factory_code_hash':'1'*32,'template_sha256':'a'*64,'company_code_hash':'2'*32,'operator_id':'operator.testnet','worker_key_id':self.public['worker_key_id'],'worker_public_key':self.public['worker_public_key'],'service_expires_at':str(int(time.time())+3600),'operator_key_file':str(self.root/'operator.json'),'heartbeat_key_file':str(self.root/'heartbeat.json'),'root_dir':str(self.root)}
        self.config=self.root/'fleet.json';self.write(self.config,self.spec)
        self.model=mock.patch('executor.testnet_fleet.model_ready',side_effect=AssertionError('Actual model forbidden'))
        self.model.start();self.addCleanup(self.model.stop)
        for name in ('socket.create_connection','http.client.HTTPConnection','http.client.HTTPSConnection','subprocess.Popen','subprocess.run'):
            patch=mock.patch(name,side_effect=AssertionError('Network/process forbidden offline'));patch.start();self.addCleanup(patch.stop)
    @staticmethod
    def write(path,value):
        path.parent.mkdir(mode=0o700,parents=True,exist_ok=True);path.write_text(json.dumps(value));path.chmod(0o600)
    def instance(self,issuer=None):return fleet.Fleet(self.config,self.spec,registry=object(),issuer=issuer or (lambda *args:{'status':'final'}))
    def record(self,index=0):return {'id':'request'+str(index),'creator':'founder.testnet','child':'company'+str(index)+'.factory.testnet','request_hash':hashlib.sha256(str(index).encode()).hexdigest(),'template_sha256':self.spec['template_sha256']}
    def service_view(self,now=None):
        now=int(time.time()) if now is None else now
        expected={k:self.spec[k] for k in ('operator_id','worker_public_key','worker_key_id','service_expires_at')}
        expected.update(schema=fleet.SERVICE,execution_backend='local_gemma_mock',model=fleet.MODEL,model_digest=fleet.EXPECTED_DIGEST,cloud_billing_verified=False,tee_verified=False,max_companies=8,max_reservations_per_company=2,max_reservations_global=16,heartbeat_at=str(now-10),heartbeat_expires_at=str(min(now+590,int(self.spec['service_expires_at']))),observed_at=str(now),online=True)
        return expected
    @staticmethod
    def policy():return {'enabled':True,'scope_consent':True,'selected_model':'economy','allow_economy':True,'allow_expensive':False,'per_call_nanos':'1000000','daily_nanos':'2000000','lifetime_nanos':'2000000','max_input_tokens':4608,'max_output_tokens':512,'max_calls_per_job':1,'max_calls_per_day':2}
    def add_ledger(self,service,index,calls,runtime=True):
        r=self.record(index);row={'binding':r,'logical_calls':0,'phase':'enrolled','runtime_created':runtime};service.state['companies'][r['child']]=row
        directory=service.companies/hashlib.sha256(r['child'].encode()).hexdigest();directory.mkdir(mode=0o700)
        self.write(directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json',{'calls':calls})
        self.write(directory/'near-ai/ledger.json',{'calls':{}});self.write(directory/'rpc-journal.json',{'pending':None})
        return r,directory,row
    def test_offline_config_does_not_parse_wallet_files(self):
        self.assertEqual(fleet.load_fleet(str(self.config)),self.spec)
    def test_unknown_profile_or_extra_network_field_refused(self):
        for change in ({'network':'mainnet'},{'profile':'mainnet'},{'heartbeat_key_file':self.spec['operator_key_file']},{'worker_key_id':'0'*64}):
            bad={**self.spec,**change};self.write(self.config,bad)
            with self.assertRaises(ValueError):fleet.load_fleet(str(self.config))
    def test_private_path_modes_and_symlink_refused(self):
        (self.root/'operator.json').chmod(0o644)
        with self.assertRaises(ValueError):fleet.load_fleet(str(self.config))
        (self.root/'operator.json').chmod(0o600);alias=self.root/'alias';alias.symlink_to(self.root/'operator.json');self.write(self.config,{**self.spec,'operator_key_file':str(alias)})
        with self.assertRaises(ValueError):fleet.load_fleet(str(self.config))
    def test_service_model_identity_caps_and_expiry_pinned(self):
        expected={k:self.spec[k] for k in ('operator_id','worker_public_key','worker_key_id','service_expires_at')};expected.update(schema=fleet.SERVICE,execution_backend='local_gemma_mock',model=fleet.MODEL,model_digest=fleet.EXPECTED_DIGEST,cloud_billing_verified=False,tee_verified=False,max_companies=8,max_reservations_per_company=2,max_reservations_global=16)
        self.assertEqual(fleet.validate_service(expected,self.spec,int(time.time())),expected)
        for change in ({'model':'other'},{'cloud_billing_verified':True},{'max_companies':9},{'worker_key_id':'0'*64}):
            with self.assertRaises(ValueError):fleet.validate_service({**expected,**change},self.spec,int(time.time()))
        with self.assertRaises(ValueError):fleet.validate_service(expected,self.spec,int(self.spec['service_expires_at']))
    def test_owner_policy_cannot_expand_service_reservations(self):
        policy={'selected_model':'economy','allow_economy':True,'allow_expensive':False,'per_call_nanos':'1000000','daily_nanos':'2000000','lifetime_nanos':'2000000','max_input_tokens':4608,'max_output_tokens':512,'max_calls_per_job':1,'max_calls_per_day':2}
        fleet.validate_policy(policy)
        for change in ({'allow_expensive':True},{'max_calls_per_day':3},{'lifetime_nanos':'2000001'}):
            with self.assertRaises(ValueError):fleet.validate_policy({**policy,**change})
    def test_operator_liquid_floor_includes_storage_and_gas_purchase_floor(self):
        protocol={'runtime_config':{'storage_amount_per_byte':'10000000000000000000','min_gas_purchase_price':'1000000000'}};header={'gas_price':'100000000'}
        account={'amount':'1000000000000000000000000','locked':'0','storage_usage':1000}
        self.assertEqual(fleet.validate_operator_liquidity(account,protocol,header),990000000000000000000000)
        for change in ({'amount':'600000000000000000000000'},{'amount':1.0},{'storage_usage':True},{'locked':'1000000000000000000000000'}):
            with self.assertRaises(ValueError):fleet.validate_operator_liquidity({**account,**change},protocol,header)
    def test_unknown_charge_quarantines_one_company_and_remains_in_global_cap(self):
        service=self.instance();record,directory,row=self.add_ledger(service,0,{'unknown':{'status':'unknown','charge':658400}})
        before=(directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json').read_bytes()
        self.add_ledger(service,1,{'known':{'status':'complete','charge':500}})
        self.assertEqual(service.counts(record['child']),(1,2))
        self.assertEqual(row['quarantine']['reason'],'unresolved_model_outcome');self.assertIsNone(service.state['halted'])
        self.assertNotIn('quarantine',service.state['companies'][self.record(1)['child']])
        self.assertEqual((directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json').read_bytes(),before)
    def test_current_inflight_unknown_does_not_quarantine_active_tick(self):
        service=self.instance();record,_,row=self.add_ledger(service,0,{'unknown':{'status':'unknown','charge':658400}})
        service.in_tick=record['child'];self.assertEqual(service.counts(record['child'],allow_inflight=True),(1,1));self.assertNotIn('quarantine',row)
    def test_missing_initialized_ledger_is_not_recreated(self):
        service=self.instance();_,directory,row=self.add_ledger(service,0,{})
        missing=directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json';missing.unlink()
        with self.assertRaises(ValueError):service.counts()
        self.assertFalse(missing.exists())
    def test_call_count_decrease_and_per_company_overflow_refused(self):
        service=self.instance();_,directory,row=self.add_ledger(service,0,{'one':{'status':'complete'}});row['logical_calls']=2
        with self.assertRaises(ValueError):service.counts()
        row['logical_calls']=0;self.write(directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json',{ 'calls':{str(i):{'status':'complete'} for i in range(3)}})
        with self.assertRaises(ValueError):service.counts()
    def test_eight_companies_and_sixteen_reservations_exact(self):
        service=self.instance()
        for i in range(8):self.add_ledger(service,i,{'a':{'status':'complete'},'b':{'status':'complete'}})
        self.assertEqual(service.counts()[1],16)
        with self.assertRaises(ValueError):service.prepare(self.record(9))
    def test_new_logical_call_blocked_before_inner_reservation(self):
        underlying=types.SimpleNamespace(identity_key='synthetic-identity',_read=lambda:{'calls':{}})
        complete=mock.Mock(return_value={'ok':True,'cached':True});local=types.SimpleNamespace(inner=underlying,complete=complete)
        client=fleet.FleetLimitedClient(local,lambda:(2,16))
        self.assertEqual(client.complete('new',[],'job')['reason'],'fleet_logical_reservation_limit');complete.assert_not_called()
    def test_current_liquid_preflight_blocks_each_write_and_new_reservation(self):
        before=mock.Mock(side_effect=ValueError('Synthetic current liquid floor'))
        inner=types.SimpleNamespace(config={},pending=False,call=mock.Mock())
        gateway=fleet.FleetGateway(inner,'owner.testnet','a'*64,before)
        with self.assertRaises(ValueError):gateway.call('company_tick',id='approved')
        inner.call.assert_not_called()
        client_inner=types.SimpleNamespace(identity_key='synthetic-identity',_read=lambda:{'calls':{}})
        complete=mock.Mock();client=fleet.FleetLimitedClient(types.SimpleNamespace(inner=client_inner,complete=complete),lambda:(0,0),before)
        with self.assertRaises(ValueError):client.complete('new',[],'job')
        complete.assert_not_called();self.assertEqual(before.call_count,2)
    def test_cached_original_identity_remains_available_at_limit(self):
        identity='synthetic-identity';ident=hmac.new(hashlib.sha256(identity.encode()).digest(),b'economy\0original',hashlib.sha256).hexdigest()
        underlying=types.SimpleNamespace(identity_key=identity,_read=lambda:{'calls':{ident:{'status':'complete'}}})
        complete=mock.Mock(return_value={'ok':True,'cached':True});client=fleet.FleetLimitedClient(types.SimpleNamespace(inner=underlying,complete=complete),lambda:(2,16))
        self.assertTrue(client.complete('original',[],'job')['cached']);complete.assert_called_once()
    def test_actual_bounded_client_model_alias_cache_replays_at_both_caps(self):
        calls=[];password='synthetic-private-cache-password'
        def transport(payload,key):
            calls.append(copy.deepcopy(payload));return {'choices':[{'message':{'content':'A synthetic bounded answer.'}}],'usage':{'prompt_tokens':12,'completion_tokens':8,'total_tokens':20}}
        inner=NearAIClient(self.root/'actual-cache/ledger.json',lambda value:self.vault.encrypt(value,password)['envelope'],lambda value:self.vault.decrypt(value,password),transport=transport,key_provider=lambda:'synthetic-no-provider-key',identity_key='synthetic-fleet-cache-identity')
        inner.configure({**DEFAULT,'enabled':True,'scope_consent':True})
        budget=lambda:(len(inner._read()['calls']),14+len(inner._read()['calls']))
        client=fleet.FleetLimitedClient(LocalModelClient(inner),budget)
        messages=[{'role':'user','content':'Synthetic approved text only.'}]
        self.assertTrue(client.complete('original',messages,'approved_task')['ok'])
        self.assertTrue(client.complete('second',messages,'approved_task')['ok'])
        self.assertEqual(budget(),(2,16));before=(self.root/'actual-cache/ledger.json').read_bytes()
        replay=client.complete('original',messages,'approved_task');self.assertTrue(replay['ok']);self.assertTrue(replay['cached'])
        self.assertEqual(len(calls),2);self.assertEqual((self.root/'actual-cache/ledger.json').read_bytes(),before)
        self.assertEqual(client.complete('third',messages,'approved_task')['reason'],'fleet_logical_reservation_limit');self.assertEqual(len(calls),2)
    def test_registry_rejects_wrong_genesis_before_other_reads(self):
        registry=fleet.PublicRegistry(self.spec)
        registry.request=mock.Mock(return_value={'chain_id':'testnet','genesis_hash':'wrong','sync_info':{'syncing':False}})
        with self.assertRaises(ValueError):registry.discover()
        registry.request.assert_called_once_with('status',[])
    def test_registry_view_and_account_require_requested_final_block(self):
        registry=fleet.PublicRegistry(self.spec);header={'hash':'1'*32,'height':10}
        response={'block_hash':header['hash'],'block_height':10,'result':list(b'{"ok":true}')}
        registry.request=mock.Mock(return_value=response)
        self.assertEqual(registry.view('factory.testnet','worker_service',{},header['hash'],10),{'ok':True})
        registry.account('factory.testnet',header)
        for change in ({'block_hash':'2'*32},{'block_height':9}):
            registry.request.return_value={**response,**change}
            with self.assertRaises(ValueError):registry.view('factory.testnet','worker_service',{},header['hash'],10)
            with self.assertRaises(ValueError):registry.account('factory.testnet',header)
    def test_two_company_legitimate_profile_change_is_durably_isolated(self):
        service=self.instance();records=[self.record(0),self.record(1)];registry=fleet.PublicRegistry(self.spec);service.registry=registry
        registry.discover=mock.Mock(return_value={'block':{'height':10,'hash':'1'*32},'records':records})
        registry.account=mock.Mock(return_value={'code_hash':self.spec['company_code_hash']})
        def view(child,method,*args):
            if method=='state':return {'owner':'founder.testnet','operator':self.spec['operator_id'],'frozen':False}
            if method=='execution_profile':return {'profile':'website-qa-v1' if child==records[0]['child'] else 'business-operations-v1','target_origin':'http://127.0.0.1:8788/' if child==records[0]['child'] else '','worker_key_id':self.spec['worker_key_id'],'worker_public_key':self.spec['worker_public_key']}
            if method=='ai_policy':return self.policy()
            raise AssertionError(method)
        registry.view=mock.Mock(side_effect=view)
        dispatched=[]
        def one(record,header):
            if registry.company_ready(record,header):dispatched.append(record['child']);return {'company_id':record['child'],'status':'healthy'}
        with mock.patch.object(service,'_tick_company',side_effect=one):
            first=service.tick();second=service.tick()
        self.assertEqual([r['status'] for r in first],['quarantined','healthy']);self.assertEqual(second,first)
        self.assertEqual(dispatched,[records[1]['child']]*2);self.assertIsNone(fleet.read_json(service.path)['halted'])
        resumed=fleet.Fleet(self.config,self.spec,registry=registry,issuer=lambda *_:{'status':'final'})
        self.assertEqual(resumed.state['companies'][records[0]['child']]['quarantine']['reason'],'ValueError')
    def test_two_company_unsupported_queue_preserves_original_journals(self):
        service=self.instance();bad,directory,row=self.add_ledger(service,0,{})
        good=self.record(1);records=[bad,good];service.registry=types.SimpleNamespace(discover=lambda:{'block':{'height':10},'records':records})
        before={p.name:p.read_bytes() for p in (directory/'rpc-journal.json',directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json')}
        dispatched=[]
        def one(record,header):
            task={'operation':'strategy_plan' if record==bad else 'content_draft','kind':'general','approved_by':record['creator'],'worker_key_id':self.spec['worker_key_id']}
            inner=types.SimpleNamespace(config={},pending=False,call=lambda *a,**kw:{'ok':True,'tasks':{'items':[task]}})
            fleet.FleetGateway(inner,record['creator'],self.spec['worker_key_id']).call('company_list')
            dispatched.append(record['child']);return {'company_id':record['child'],'status':'healthy'}
        with mock.patch.object(service,'_tick_company',side_effect=one):
            self.assertEqual([x['status'] for x in service.tick()],['quarantined','healthy'])
            service.tick()
        self.assertEqual(dispatched,[good['child']]*2);self.assertIsNone(service.state['halted'])
        for p in (directory/'rpc-journal.json',directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json'):self.assertEqual(p.read_bytes(),before[p.name])
        self.assertIn('quarantine',row)
    def test_dispatch_checks_frozen_offline_heartbeat_and_expiry_after_prior_discovery(self):
        registry=fleet.PublicRegistry(self.spec);clock=[int(time.time())];header={'hash':'1'*32,'height':10,'timestamp_nanosec':str(clock[0]*1_000_000_000)}
        registry.request=mock.Mock(side_effect=lambda method,params:{'chain_id':'testnet','genesis_hash':fleet.GENESIS,'sync_info':{'syncing':False}} if method=='status' else {'header':header})
        registry.account=mock.Mock(return_value={'code_hash':self.spec['factory_code_hash']});registry.operator_ready=mock.Mock()
        service=self.service_view(clock[0]);state={'frozen':False}
        registry.view=mock.Mock(side_effect=lambda account,method,*args:state if method=='state' else service)
        with mock.patch('executor.testnet_fleet.time.time',side_effect=lambda:clock[0]):
            registry.dispatch_ready()
            for change in ({'online':False},{'heartbeat_expires_at':str(clock[0])},{'observed_at':str(clock[0]-1)}):
                original=service.copy();service.update(change)
                with self.assertRaises(fleet.ServiceUnavailable):registry.dispatch_ready()
                service.clear();service.update(original)
            state['frozen']=True
            with self.assertRaises(fleet.ServiceUnavailable):registry.dispatch_ready()
            state['frozen']=False
            clock[0]=int(self.spec['service_expires_at'])
            with self.assertRaises(fleet.ServiceUnavailable):registry.dispatch_ready()
    def test_mid_preflight_expiry_blocks_new_write_and_leaves_reconciliation_available(self):
        registry=fleet.PublicRegistry(self.spec);clock=[int(self.spec['service_expires_at'])-1];header={'hash':'1'*32,'height':10,'timestamp_nanosec':str(clock[0]*1_000_000_000)}
        registry.request=mock.Mock(side_effect=lambda method,params:{'chain_id':'testnet','genesis_hash':fleet.GENESIS,'sync_info':{'syncing':False}} if method=='status' else {'header':header})
        registry.account=mock.Mock(return_value={'code_hash':self.spec['factory_code_hash']});registry.view=mock.Mock(side_effect=lambda account,method,*args:{'frozen':False} if method=='state' else self.service_view(clock[0]))
        registry.operator_ready=lambda *_:clock.__setitem__(0,clock[0]+2)
        inner=types.SimpleNamespace(config={},pending=True,call=mock.Mock(),reconcile=mock.Mock(return_value={'status':'unknown','hash':'original'}))
        gateway=fleet.FleetGateway(inner,'owner.testnet','a'*64,registry.dispatch_ready)
        with mock.patch('executor.testnet_fleet.time.time',side_effect=lambda:clock[0]):
            with self.assertRaises(fleet.ServiceUnavailable):gateway.call('company_tick',id='approved')
            self.assertEqual(gateway.reconcile(),{'status':'unknown','hash':'original'})
        inner.call.assert_not_called();inner.reconcile.assert_called_once()
    def test_caught_model_gate_failure_still_marks_shared_stop(self):
        self.model.stop()
        healthy=mock.patch('executor.testnet_fleet.model_ready',return_value=None);healthy.start();self.addCleanup(healthy.stop)
        service=self.instance();service.registry=types.SimpleNamespace(dispatch_ready=mock.Mock(side_effect=ValueError('native service offline')))
        underlying=types.SimpleNamespace(identity_key='synthetic-identity',_read=lambda:{'calls':{}});complete=mock.Mock()
        client=fleet.FleetLimitedClient(types.SimpleNamespace(inner=underlying,complete=complete),lambda:(0,0),service.dispatch_ready)
        with self.assertRaises(fleet.ServiceUnavailable):client.complete('new',[],'approved')
        complete.assert_not_called();self.assertTrue(service.stop.is_set());self.assertEqual(service.fatal,'ServiceUnavailable');service.registry.dispatch_ready.assert_called_once()
    def test_finite_runtime_deadline_blocks_dispatch_even_with_unexpired_service_lease(self):
        service=self.instance();service.registry=types.SimpleNamespace(dispatch_ready=mock.Mock());service.deadline=time.monotonic()-1
        with self.assertRaises(fleet.ServiceUnavailable):service.dispatch_ready()
        service.registry.dispatch_ready.assert_not_called();self.assertTrue(service.stop.is_set())
    def test_read_only_registry_transient_retries_are_bounded_and_record_status(self):
        registry=fleet.PublicRegistry(self.spec);calls=[]
        def opened(request,timeout):
            payload=json.loads(request.data);calls.append(payload)
            if len(calls)<3:raise urllib.error.HTTPError(fleet.adapter.RPC,429,'Synthetic quota',{},None)
            response=mock.MagicMock();response.__enter__.return_value=response;response.status=200;response.read.return_value=json.dumps({'jsonrpc':'2.0','id':payload['id'],'result':{'ready':True}}).encode();return response
        with mock.patch('executor.testnet_fleet.urllib.request.urlopen',side_effect=opened),mock.patch('executor.testnet_fleet.time.sleep') as sleep:
            self.assertEqual(registry.request('status',[]),{'ready':True});self.assertEqual(len(calls),3);self.assertIn(mock.call(2),sleep.call_args_list);self.assertIn(mock.call(4),sleep.call_args_list)
        with mock.patch('executor.testnet_fleet.urllib.request.urlopen',side_effect=urllib.error.HTTPError(fleet.adapter.RPC,503,'Synthetic unavailable',{},None)) as opened,mock.patch('executor.testnet_fleet.time.sleep'):
            with self.assertRaises(fleet.RegistryReadUnavailable) as error:registry.request('query',{})
            self.assertEqual(opened.call_count,3);self.assertEqual(error.exception.diagnostic,{'method':'query','http_status':503,'error_kind':'HTTPError','attempts':3,'read_only':True})
        with self.assertRaises(ValueError):registry.request('send_tx',{})
    def test_read_transport_exhaustion_does_not_quarantine_a_company(self):
        service=self.instance();record=self.record();service.registry=types.SimpleNamespace(discover=lambda:{'block':{'height':10},'records':[record]})
        with mock.patch.object(service,'_tick_company',side_effect=fleet.RegistryReadUnavailable('query',429,'HTTPError',3)):
            with self.assertRaises(fleet.RegistryReadUnavailable):service.tick()
        self.assertNotIn(record['child'],service.state['companies'])
    def recovery_fixture(self):
        service=self.instance();record,directory,row=self.add_ledger(service,0,{})
        service.state['halted']={'error_kind':'HTTPError','at':'synthetic-original-halt'};row['quarantine']={'reason':'HTTPError','at':'synthetic-original-quarantine'};service.save()
        found={'block':{'hash':'1'*32,'height':10},'records':[record],'service':{**self.service_view(),'online':False}}
        service.registry=types.SimpleNamespace(discover=mock.Mock(return_value=found),company_ready=mock.Mock(return_value=True))
        relative=str((directory/'rpc-journal.json').relative_to(service.root));audit={'status':'audited','factory':self.spec['factory_id'],'operator':self.spec['operator_id'],'companies':[{'company':record['child'],'worker_writes':0,'enrollment_count':1,'phase':'initialized_final','accounting_required':True,'worker_key_present':True}],'journal_files':{relative:hashlib.sha256((directory/'rpc-journal.json').read_bytes()).hexdigest()},'key_reads':0,'network_requests':0,'signatures':0,'broadcasts':0}
        result=types.SimpleNamespace(returncode=0,stdout=json.dumps(audit).encode())
        return service,record,directory,row,audit,result
    def test_explicit_stale_heartbeat_resume_preserves_original_state_journals_and_quarantine_history(self):
        service,record,directory,row,audit,result=self.recovery_fixture();original=service.path.read_bytes();files=[directory/'rpc-journal.json',directory/'near-ai/ledger.json',directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json'];before={str(p):p.read_bytes() for p in files}
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):
            prepared=service.prepare_resume();self.assertEqual(prepared['status'],'resume_audited_not_activated');self.assertFalse(prepared['service_online_observed']);self.assertEqual(service.path.read_bytes(),original)
            approved=service.approve_resume(prepared['audit_sha256'])
        self.assertEqual(approved['status'],'explicit_transport_resume_recorded_not_activated');self.assertEqual(approved['retained_logical_reservations'],0)
        self.assertEqual((service.root/'resume-audits'/('original-'+hashlib.sha256(original).hexdigest()+'.json')).read_bytes(),original)
        self.assertIsNone(service.state['halted']);self.assertEqual(service.state['halted_history'],[json.loads(original)['halted']])
        resumed=service.state['companies'][record['child']];self.assertIsNone(resumed['quarantine']);self.assertEqual(resumed['quarantine_history'],[json.loads(original)['companies'][record['child']]['quarantine']])
        for file in files:self.assertEqual(file.read_bytes(),before[str(file)])
        service.registry.discover.assert_called_with(online=False)
    def test_recovery_refuses_unknown_model_without_mutating_original_state(self):
        service,record,directory,row,audit,result=self.recovery_fixture();original=service.path.read_bytes()
        self.write(directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json',{'calls':{'original':{'status':'unknown','charge':100}}})
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):
            with self.assertRaises(ValueError):service.prepare_resume()
        self.assertEqual(service.path.read_bytes(),original);self.assertFalse((service.root/'resume-audits').exists())
    def test_recovery_refuses_legacy_worker_write_without_mutating_original_state(self):
        service,record,directory,row,audit,result=self.recovery_fixture();original=service.path.read_bytes();audit['companies'][0]['worker_writes']=1;result.stdout=json.dumps(audit).encode()
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):
            with self.assertRaises(ValueError):service.prepare_resume()
        self.assertEqual(service.path.read_bytes(),original);self.assertFalse((service.root/'resume-audits').exists())
    def test_structured_transport_recovery_retains_completed_model_charge_and_refuses_changed_journal(self):
        service,record,directory,row,audit,result=self.recovery_fixture();service.state['halted']={'error_kind':'RegistryReadUnavailable','read_failure':{'method':'query','http_status':429,'read_only':True}};service.save()
        self.write(directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json',{'calls':{'original':{'status':'complete','charge':100}}});audit['companies'][0]['worker_writes']=2;result.stdout=json.dumps(audit).encode()
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):
            prepared=service.prepare_resume();before=service.path.read_bytes();self.write(directory/'rpc-journal.json',{'pending':{'hash':'changed'}})
            with self.assertRaises(ValueError):service.approve_resume(prepared['audit_sha256'])
        self.assertEqual(service.path.read_bytes(),before);self.assertEqual(fleet.read_json(directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json')['calls']['original']['charge'],100)
    def test_recovery_refuses_missing_original_state_without_creating_anything(self):
        with self.assertRaises(ValueError):fleet.Fleet(self.config,self.spec,allow_halted=True)
        self.assertFalse((self.root/'fleet-state.json').exists());self.assertFalse((self.root/'companies').exists())
    def test_resume_approval_expiring_during_fresh_audit_never_unhalts(self):
        service,record,directory,row,audit,result=self.recovery_fixture();original=service.path.read_bytes()
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):prepared=service.prepare_resume()
        approved=fleet.read_json(Path(prepared['audit_file']));clock=[approved['audited_at']]
        def slow_audit():clock[0]=approved['expires_at'];return approved
        with mock.patch.object(service,'recovery_audit',side_effect=slow_audit),mock.patch('executor.testnet_fleet.time.time',side_effect=lambda:clock[0]):
            with self.assertRaises(ValueError):service.approve_resume(prepared['audit_sha256'])
        self.assertEqual(service.path.read_bytes(),original);self.assertEqual(list((service.root/'resume-audits').glob('original-*')),[])
    def test_transport_resume_retains_pristine_pre_enrollment_company_without_blocking_healthy_company(self):
        service,record,directory,row,audit,result=self.recovery_fixture();waiting=self.record(1)
        pending_row={'binding':waiting,'phase':'preparing','logical_calls':0,'quarantine':{'reason':'CompanyPreflightRefused','at':'synthetic-private-preparation'}};service.state['companies'][waiting['child']]=pending_row;service.save()
        pending_dir=service.companies/hashlib.sha256(waiting['child'].encode()).hexdigest();pending_dir.mkdir(mode=0o700);journal=pending_dir/'enrollment-journal.json';self.write(journal,{'pending':None,'history':[]});before=journal.read_bytes()
        audit['companies'].append({'company':waiting['child'],'worker_writes':0,'enrollment_count':0,'phase':'prepared_no_dispatch','accounting_required':False});audit['journal_files'][str(journal.relative_to(service.root))]=hashlib.sha256(before).hexdigest();result.stdout=json.dumps(audit).encode()
        service.registry.discover.return_value['records'].append(waiting)
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):
            prepared=service.prepare_resume();service.approve_resume(prepared['audit_sha256'])
        self.assertIsNone(service.state['halted']);self.assertIsNone(service.state['companies'][record['child']]['quarantine']);self.assertEqual(service.state['companies'][waiting['child']],pending_row);self.assertEqual(journal.read_bytes(),before)
        self.assertTrue(all(call.args[0]['child']!=waiting['child'] for call in service.registry.company_ready.call_args_list))
    def test_transport_resume_does_not_require_an_owner_frozen_or_incompatible_company_to_be_ready(self):
        service,record,directory,row,audit,result=self.recovery_fixture();service.registry.company_ready.return_value=False;original_quarantine=copy.deepcopy(row['quarantine'])
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):
            prepared=service.prepare_resume();self.assertEqual(fleet.read_json(Path(prepared['audit_file']))['restore_companies'],[]);service.approve_resume(prepared['audit_sha256'])
        self.assertIsNone(service.state['halted']);self.assertEqual(service.state['companies'][record['child']]['quarantine'],original_quarantine)
    def test_transport_audit_keeps_owner_profile_policy_incompatibility_company_local(self):
        service,record,directory,row,audit,result=self.recovery_fixture();original=service.path.read_bytes();service.registry.company_ready.side_effect=ValueError('Owner chose a different compatible platform profile')
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):prepared=service.prepare_resume()
        self.assertEqual(fleet.read_json(Path(prepared['audit_file']))['restore_companies'],[]);self.assertEqual(service.path.read_bytes(),original)
    def test_operator_stop_resume_retains_completed_charge_and_all_original_journal_bytes(self):
        service,record,directory,row,audit,result=self.recovery_fixture();service.state['halted']={'error_kind':'KeyboardInterrupt','at':'explicit-owned-stop'};row['logical_calls']=1;service.save();ledger=directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json';self.write(ledger,{'calls':{'original':{'status':'complete','charge':100}}});audit['companies'][0]['worker_writes']=3;result.stdout=json.dumps(audit).encode();before={p:p.read_bytes() for p in (directory/'rpc-journal.json',ledger,directory/'near-ai/ledger.json')}
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):
            prepared=service.prepare_resume();self.assertEqual(fleet.read_json(Path(prepared['audit_file']))['resume_reason'],'OPERATOR_STOP');resumed=service.approve_resume(prepared['audit_sha256'])
        self.assertEqual(resumed['retained_logical_reservations'],1);self.assertEqual(service.state['resume_history'][-1]['reason'],'OPERATOR_STOP');self.assertEqual(service.state['companies'][record['child']]['logical_calls'],1)
        for file,raw in before.items():self.assertEqual(file.read_bytes(),raw)
        self.assertEqual(fleet.read_json(ledger)['calls']['original']['charge'],100);self.assertFalse(service.stop.is_set())
    def test_operator_stop_unknown_model_is_never_unhalted(self):
        service,record,directory,row,audit,result=self.recovery_fixture();service.state['halted']={'error_kind':'KeyboardInterrupt','at':'explicit-owned-stop'};service.save();original=service.path.read_bytes();self.write(directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json',{'calls':{'original':{'status':'unknown','charge':100}}})
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):
            with self.assertRaises(ValueError):service.prepare_resume()
        self.assertEqual(service.path.read_bytes(),original)
    def test_operator_stop_unknown_signed_journal_is_never_unhalted(self):
        service,record,directory,row,audit,result=self.recovery_fixture();service.state['halted']={'error_kind':'KeyboardInterrupt','at':'explicit-owned-stop'};service.save();original=service.path.read_bytes();result.returncode=2;result.stdout=b'{"status":"refused"}'
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result):
            with self.assertRaises(ValueError):service.prepare_resume()
        self.assertEqual(service.path.read_bytes(),original)
    def test_only_correlated_bridge_transport_refusal_preserves_no_dispatch_for_recovery(self):
        service=self.instance();record,directory,row=self.add_ledger(service,0,{})
        error=fleet.PreflightRefused({'stage':'rpc.status','error_type':'Error','http_status':429});inner=types.SimpleNamespace(config={},pending=False,call=mock.Mock(side_effect=error))
        gateway=fleet.FleetGateway(inner,record['creator'],self.spec['worker_key_id'],on_read_failure=lambda error:service.fail_bridge_read(record,error))
        with self.assertRaises(fleet.RegistryReadUnavailable) as raised:gateway.call('company_tick',id='approved')
        proof=raised.exception.diagnostic['no_dispatch'];self.assertFalse(proof['journal_pending']);self.assertFalse(proof['signing_started']);self.assertFalse(proof['intent_saved']);self.assertFalse(proof['submission_started']);self.assertEqual(row['read_preflight'],raised.exception.diagnostic);self.assertIs(service.read_pause_error,raised.exception);self.assertIsNone(service.fatal);self.assertFalse(service.stop.is_set())
        self.assertIsNone(fleet.bridge_read_failure(ValueError('untrusted HTTPError')));self.assertIsNone(fleet.bridge_read_failure(fleet.PreflightRefused({'stage':'local.identity','error_type':'Error','http_status':429})))
    def test_correlated_read_error_frames_and_snapshot_enter_cooldown_without_losing_history(self):
        service=self.instance();record,directory,row=self.add_ledger(service,0,{})
        before=(directory/'rpc-journal.json').read_bytes()
        for command,status,kind in [('state',429,'Error'),('company_list',503,'ProviderError'),('ai_policy',None,'TypeError')]:
            frame={'id':'a'*32,'ok':False,'error':'Restricted RPC operation refused','tx':None,'no_dispatch':None,'diagnostic':{'stage':'rpc.view.'+command,'error_type':kind,'http_status':status}}
            inner=types.SimpleNamespace(config={},pending=False,call=mock.Mock(return_value=frame),snapshot=mock.Mock(side_effect=AssertionError('Read wrapper must classify its own state response')))
            gateway=fleet.FleetGateway(inner,record['creator'],self.spec['worker_key_id'],on_read_failure=lambda error:service.fail_bridge_read(record,error))
            with self.assertRaises(fleet.RegistryReadUnavailable):
                if command=='state':gateway.snapshot()
                else:gateway.call(command)
            self.assertIsNone(service.fatal);self.assertFalse(service.stop.is_set());self.assertNotIn('quarantine',row)
            self.assertEqual((directory/'rpc-journal.json').read_bytes(),before)
        self.assertIsNotNone(fleet.bridge_read_failure(fleet.PreflightRefused({'stage':'rpc.status','error_type':'TypeError','http_status':None})))
    def test_read_frame_recovery_refuses_pending_reconcile_local_decode_and_uncorrelated_data(self):
        frame={'id':'b'*32,'ok':False,'error':'Restricted RPC operation refused','tx':None,'no_dispatch':None,'diagnostic':{'stage':'rpc.view.state','error_type':'TypeError','http_status':None}}
        self.assertIsNone(fleet.bridge_read_result(frame,'state',True));self.assertIsNone(fleet.bridge_read_result(frame,'reconcile',False))
        for patch in [{'id':'wrong'},{'tx':{'hash':'original'}},{'extra':'untrusted'},{'diagnostic':{'stage':'local.decode','error_type':'SyntaxError','http_status':429}},{'diagnostic':{'stage':'rpc.view.state','error_type':'SyntaxError','http_status':None}}]:
            self.assertIsNone(fleet.bridge_read_result({**frame,**patch},'state',False))
        inner=types.SimpleNamespace(config={},pending=True,call=mock.Mock(side_effect=UnknownOutcome('Original write remains unknown')))
        callback=mock.Mock();gateway=fleet.FleetGateway(inner,'founder.testnet',self.spec['worker_key_id'],on_read_failure=callback)
        with self.assertRaises(UnknownOutcome):gateway.call('state')
        callback.assert_not_called()
    def test_reserved_model_gate_rechecks_native_state_despite_known_heartbeat_read_pause(self):
        self.model.stop()
        healthy=mock.patch('executor.testnet_fleet.model_ready',return_value=None);healthy.start();self.addCleanup(healthy.stop)
        service=self.instance();record,directory,row=self.add_ledger(service,0,{'original':{'status':'unknown','charge':100}})
        ledger=directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json';before=ledger.read_bytes()
        service.deadline=time.monotonic()+100;service.registry=types.SimpleNamespace(dispatch_ready=mock.Mock(return_value={'online':True}))
        pause=fleet.RegistryReadUnavailable('query',429,'HTTPError',1);service.read_pause_error=pause
        self.assertEqual(service.model_dispatch_ready(),{'online':True});self.assertIs(service.read_pause_error,pause);self.assertEqual(ledger.read_bytes(),before)
        service.registry.dispatch_ready.assert_called_once()
        with self.assertRaises(fleet.ServiceUnavailable):service.dispatch_ready()
        self.assertEqual(service.registry.dispatch_ready.call_count,1)
        service.fatal='UnknownIssuer';service.stop.set()
        with self.assertRaises(fleet.ServiceUnavailable):service.model_dispatch_ready()
        self.assertEqual(service.registry.dispatch_ready.call_count,1)
    def test_reserved_model_gate_cannot_cross_the_original_runtime_deadline_during_native_reads(self):
        self.model.stop()
        healthy=mock.patch('executor.testnet_fleet.model_ready',return_value=None);healthy.start();self.addCleanup(healthy.stop)
        service=self.instance();service.deadline=time.monotonic()+100
        def native_read():service.deadline=time.monotonic()-1;return {'online':True}
        service.registry=types.SimpleNamespace(dispatch_ready=mock.Mock(side_effect=native_read))
        with self.assertRaises(fleet.ServiceUnavailable):service.model_dispatch_ready()
        self.assertTrue(service.stop.is_set());self.assertEqual(service.registry.dispatch_ready.call_count,1)
    def test_enrollment_highwater_is_false_on_creation_true_before_issuer_and_never_cleared(self):
        observed=[];service=self.instance();record=self.record()
        def issuer(*args):
            row=fleet.read_json(service.path)['companies'][record['child']];observed.append(row['enrollment_started']);raise fleet.CompanyPreflightRefused('Synthetic before-sign refusal')
        service.issuer=issuer
        with self.assertRaises(fleet.CompanyPreflightRefused):service.prepare(record)
        self.assertEqual(observed,[True]);self.assertIs(service.state['companies'][record['child']]['enrollment_started'],True)
        untouched=self.record(1);service.quarantine(untouched,'ValueError');self.assertIs(service.state['companies'][untouched['child']]['enrollment_started'],False)
    def test_only_current_no_dispatch_attempt_closes_and_earlier_unknown_effect_stays_unclosed(self):
        service=self.instance();record=self.record();outcomes=[fleet.RegistryReadUnavailable('query',429,'HTTPError',1),{'status':'unknown'},fleet.CompanyPreflightRefused('Latest attempt refused before signing')]
        def issue(*args):
            value=outcomes.pop(0)
            if isinstance(value,Exception):raise value
            return value
        service.issuer=issue
        with self.assertRaises(fleet.RegistryReadUnavailable):service.prepare(record)
        row=service.state['companies'][record['child']];self.assertEqual((row['enrollment_attempts'],row['enrollment_no_dispatch']),(1,1));self.assertFalse(row['enrollment_effect_recorded'])
        with self.assertRaises(fleet.SharedIssuerUncertain):service.prepare(record)
        self.assertEqual((row['enrollment_attempts'],row['enrollment_no_dispatch']),(2,1))
        with self.assertRaises(fleet.CompanyPreflightRefused):service.prepare(record)
        self.assertEqual((row['enrollment_attempts'],row['enrollment_no_dispatch']),(3,2));self.assertEqual(row['last_enrollment_no_dispatch']['attempt'],3)
    def test_original_final_enrollment_is_recorded_before_later_configuration_failure(self):
        service=self.instance();record=self.record()
        with mock.patch('executor.testnet_fleet.adapter.load_profile',side_effect=ValueError('Synthetic later configuration refusal')):
            with self.assertRaisesRegex(ValueError,'Synthetic later configuration'):service.prepare(record)
        row=service.state['companies'][record['child']];self.assertTrue(row['enrollment_effect_recorded']);self.assertEqual(row['enrollment_attempts'],1);self.assertEqual(row['enrollment_no_dispatch'],0)
    def stale_issuer_lock(self,service,audit,result):
        directory=service.root/'issuer-heartbeat.lock';directory.mkdir(mode=0o700)
        owner={'schema':'near-fleet-issuer-lock-v1','pid':123456,'action':'heartbeat','company':None,'operator_id':self.spec['operator_id'],'factory_id':self.spec['factory_id'],'created_at':1}
        file=directory/'owner.json';self.write(file,owner);d=directory.stat();s=file.stat()
        item={'name':directory.name,'owner':owner,'owner_sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'dev':d.st_dev,'ino':d.st_ino,'owner_dev':s.st_dev,'owner_ino':s.st_ino}
        audit['issuer_locks']=[item];result.stdout=json.dumps(audit).encode();return directory,file
    def test_exact_dead_issuer_lock_removed_only_by_approved_resume_and_metadata_preserved(self):
        service,record,directory,row,audit,result=self.recovery_fixture();lock,owner=self.stale_issuer_lock(service,audit,result);original=service.path.read_bytes();journal=(directory/'rpc-journal.json').read_bytes()
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result),mock.patch('executor.testnet_fleet.os.kill',side_effect=ProcessLookupError):
            prepared=service.prepare_resume();self.assertTrue(owner.exists());self.assertEqual(service.path.read_bytes(),original)
            service.approve_resume(prepared['audit_sha256'])
        self.assertFalse(lock.exists());self.assertEqual((directory/'rpc-journal.json').read_bytes(),journal)
        self.assertTrue((service.root/'resume-audits'/('issuer-locks-'+prepared['audit_sha256']+'.json')).exists())
    def test_live_or_changed_issuer_lock_never_unhalts_or_deletes_originals(self):
        service,record,directory,row,audit,result=self.recovery_fixture();lock,owner=self.stale_issuer_lock(service,audit,result);original=service.path.read_bytes()
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result),mock.patch('executor.testnet_fleet.os.kill',return_value=None):
            with self.assertRaises(ValueError):service.prepare_resume()
        self.assertEqual(service.path.read_bytes(),original);self.assertTrue(owner.exists())
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=result),mock.patch('executor.testnet_fleet.os.kill',side_effect=ProcessLookupError):
            prepared=service.prepare_resume();self.write(owner,{**audit['issuer_locks'][0]['owner'],'pid':654321})
            with self.assertRaises(ValueError):service.approve_resume(prepared['audit_sha256'])
        self.assertEqual(service.path.read_bytes(),original);self.assertTrue(owner.exists())
    def test_heartbeat_read_transport_cause_is_retained_in_bounded_pause(self):
        service=self.instance();error=fleet.RegistryReadUnavailable('query',429,'TransportError',1);service.deadline=time.monotonic()+600
        with mock.patch.object(service,'heartbeat',side_effect=error),mock.patch.object(service.stop,'wait',side_effect=[False,True]):service._heartbeat_loop()
        self.assertEqual(service.state['last_read_pause']['read_failure'],error.diagnostic);self.assertIs(service.read_pause_error,error);self.assertIsNone(service.fatal);self.assertFalse(service.stop.is_set())
    def test_heartbeat_unknown_signed_outcome_still_halts_with_original_cause(self):
        service=self.instance();error=fleet.SharedIssuerUncertain('Original heartbeat signed outcome unknown')
        with mock.patch.object(service,'heartbeat',side_effect=error),mock.patch.object(service.stop,'wait',return_value=False):service._heartbeat_loop()
        self.assertIs(service.fatal_error,error);self.assertTrue(service.stop.is_set());self.assertIsNone(service.read_pause_error)
    def test_known_read_cooldown_is_30_60_120_then_fresh_recovery_without_write_or_model_retry(self):
        self.model.stop()
        healthy=mock.patch('executor.testnet_fleet.model_ready',return_value=None);healthy.start();self.addCleanup(healthy.stop)
        service=self.instance();clock=[0.0];waits=[];calls=[];found={'block':{'hash':'1'*32,'height':10},'service':{'online':True},'records':[]}
        service.registry=types.SimpleNamespace(discover=mock.Mock(return_value=found))
        def tick(found=None):
            calls.append(found)
            if len(calls)<=3:raise fleet.RegistryReadUnavailable('query',429,'HTTPError',3)
            service.stop.set();return []
        def wait(seconds):waits.append(seconds);clock[0]+=seconds;return service.stop.is_set()
        thread=types.SimpleNamespace(start=lambda:None,join=lambda **kwargs:None,is_alive=lambda:False)
        with mock.patch.object(service,'heartbeat',return_value={'status':'final'}) as heartbeat,mock.patch.object(service,'tick',side_effect=tick),mock.patch.object(service.stop,'wait',side_effect=wait),mock.patch('executor.testnet_fleet.time.monotonic',side_effect=lambda:clock[0]),mock.patch('executor.testnet_fleet.threading.Thread',return_value=thread):service.run(500,10)
        self.assertEqual(waits[:3],[30,60,120]);self.assertEqual(len(calls),4);self.assertEqual(service.state['read_pause_count'],3);self.assertIsNone(service.state['halted']);self.assertEqual(heartbeat.call_count,1);service.registry.discover.assert_called_with(online=False)
        self.assertEqual(service.state['last_read_pause']['writes_retried'],0);self.assertEqual(service.state['last_read_pause']['models_retried'],0)
    def test_known_read_cooldown_never_extends_original_finite_deadline(self):
        self.model.stop()
        healthy=mock.patch('executor.testnet_fleet.model_ready',return_value=None);healthy.start();self.addCleanup(healthy.stop)
        service=self.instance();clock=[0.0];waits=[];service.registry=types.SimpleNamespace(discover=mock.Mock())
        def wait(seconds):waits.append(seconds);clock[0]+=seconds;return False
        thread=types.SimpleNamespace(start=lambda:None,join=lambda **kwargs:None,is_alive=lambda:False)
        with mock.patch.object(service,'heartbeat',return_value={'status':'final'}),mock.patch.object(service,'tick',side_effect=fleet.RegistryReadUnavailable('query',429,'HTTPError',3)) as tick,mock.patch.object(service.stop,'wait',side_effect=wait),mock.patch('executor.testnet_fleet.time.monotonic',side_effect=lambda:clock[0]),mock.patch('executor.testnet_fleet.threading.Thread',return_value=thread):service.run(10,10)
        self.assertEqual(waits,[10]);self.assertEqual(service.deadline,10);self.assertEqual(tick.call_count,1);service.registry.discover.assert_not_called();self.assertIsNone(service.state['halted'])
    def test_read_cooldown_retains_unknown_company_charge_and_never_dispatches_it_again(self):
        self.model.stop()
        healthy=mock.patch('executor.testnet_fleet.model_ready',return_value=None);healthy.start();self.addCleanup(healthy.stop)
        service=self.instance();record,directory,row=self.add_ledger(service,0,{'original':{'status':'unknown','charge':100}});before=(directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json').read_bytes();clock=[0.0];found={'block':{'hash':'1'*32,'height':10},'service':{'online':True},'records':[record]};service.registry=types.SimpleNamespace(discover=mock.Mock(return_value=found));original_tick=service.tick;calls=[0]
        def tick(found=None):
            calls[0]+=1
            if calls[0]==1:raise fleet.RegistryReadUnavailable('query',429,'HTTPError',3)
            result=original_tick(found);self.assertEqual(result[0]['status'],'quarantined');service.stop.set();return result
        def wait(seconds):clock[0]+=seconds;return service.stop.is_set()
        thread=types.SimpleNamespace(start=lambda:None,join=lambda **kwargs:None,is_alive=lambda:False)
        with mock.patch.object(service,'heartbeat',return_value={'status':'final'}),mock.patch.object(service,'tick',side_effect=tick),mock.patch.object(service,'_tick_company') as dispatch,mock.patch.object(service.stop,'wait',side_effect=wait),mock.patch('executor.testnet_fleet.time.monotonic',side_effect=lambda:clock[0]),mock.patch('executor.testnet_fleet.threading.Thread',return_value=thread):service.run(500,10)
        dispatch.assert_not_called();self.assertEqual(service.counts(record['child']),(1,1));self.assertEqual((directory/fleet.adapter.LEDGER_DIRECTORY/'ledger.json').read_bytes(),before);self.assertEqual(row['quarantine']['reason'],'unresolved_model_outcome')
    def test_parent_accepts_only_exact_issuer_transport_no_dispatch_protocol(self):
        service=self.instance();proof={'status':'read_unavailable','action':'heartbeat','company':None,'read_failure':{'method':'status','http_status':429,'error_kind':'TransportError','attempts':1,'read_only':True},'no_dispatch':{'schema':1,'source':'trusted_local_issuer','journal_pending':False,'signing_started':False,'intent_saved':False,'submission_started':False}}
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=types.SimpleNamespace(returncode=2,stdout=json.dumps(proof).encode())):
            with self.assertRaises(fleet.RegistryReadUnavailable) as error:service._issuer('heartbeat')
        self.assertEqual(error.exception.diagnostic['no_dispatch'],proof['no_dispatch'])
        bad=copy.deepcopy(proof);bad['no_dispatch']['signing_started']=True
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=types.SimpleNamespace(returncode=2,stdout=json.dumps(bad).encode())):
            with self.assertRaises(ValueError) as error:service._issuer('heartbeat')
        self.assertNotIsInstance(error.exception,fleet.RegistryReadUnavailable)
    def test_unknown_enrollment_does_not_configure_worker(self):
        service=self.instance(issuer=lambda *_:{'status':'unknown'})
        with self.assertRaises(ValueError):service.prepare(self.record())
        directory=service.companies/hashlib.sha256(self.record()['child'].encode()).hexdigest()
        self.assertFalse((directory/'mock-profile.json').exists())
    def test_only_exact_trusted_issuer_no_dispatch_disposition_is_company_local(self):
        service=self.instance();child=self.record()['child'];proof={'status':'company_refused','company':child,'no_dispatch':{'schema':1,'scope':'company_enrollment','shared_pending_checked':True,'signing_started':False,'intent_saved':False,'submission_started':False}}
        def response(value):return types.SimpleNamespace(returncode=2,stdout=json.dumps(value).encode())
        with mock.patch('executor.testnet_fleet.subprocess.run',return_value=response(proof)):
            with self.assertRaises(fleet.CompanyPreflightRefused):service._issuer('grant',child)
        for value in ({**proof,'company':'other.factory.testnet'},{**proof,'no_dispatch':{**proof['no_dispatch'],'submission_started':True}},{'status':'refused'},{**proof,'extra':'untrusted'}):
            with mock.patch('executor.testnet_fleet.subprocess.run',return_value=response(value)):
                with self.assertRaises(fleet.SharedIssuerUncertain):service._issuer('grant',child)
    def test_company_preflight_race_isolated_but_shared_issuer_unknown_escapes_tick(self):
        service=self.instance();records=[self.record(0),self.record(1)];service.registry=types.SimpleNamespace(discover=lambda:{'block':{'height':10},'records':records})
        def race(record,header):
            if record==records[0]:raise fleet.CompanyPreflightRefused('Known company refusal')
            return {'company_id':record['child'],'status':'healthy'}
        with mock.patch.object(service,'_tick_company',side_effect=race):self.assertEqual([r['status'] for r in service.tick()],['quarantined','healthy'])
        with mock.patch.object(service,'_tick_company',side_effect=fleet.SharedIssuerUncertain('Original shared grant pending')):
            with self.assertRaises(fleet.SharedIssuerUncertain):service.tick()
    def test_existing_factory_identity_cannot_be_reassigned(self):
        service=self.instance();record=self.record();service.state['companies'][record['child']]={'binding':record,'logical_calls':0,'phase':'preparing'}
        with self.assertRaises(ValueError):service.prepare({**record,'creator':'different.testnet'})
    def test_model_unavailable_never_publishes_heartbeat_and_persists_halt(self):
        issued=mock.Mock();service=self.instance(issued)
        with self.assertRaises(AssertionError):service.run(1,10)
        issued.assert_not_called();self.assertEqual(fleet.read_json(service.path)['halted']['error_kind'],'AssertionError')
    def test_fleet_lease_denies_second_producer(self):
        with fleet.fleet_lease(self.root):
            with self.assertRaises(BlockingIOError):
                with fleet.fleet_lease(self.root):pass


class ModelHealthTests(unittest.TestCase):
    """Actual health, runtime loop and effect gates; no network/model/keys."""
    class Response:
        def __init__(self,status=200,raw=None):
            self.status=status
            self.raw=raw if raw is not None else json.dumps({'models':[{'name':fleet.MODEL,'digest':fleet.EXPECTED_DIGEST}]}).encode()
        def read(self,bound):
            assert bound==1_048_577
            return self.raw
    class Connection:
        results=[];calls=[];closed=0
        def __init__(self,host,port,timeout):assert (host,port,timeout)==('127.0.0.1',11434,5)
        def request(self,method,path):self.calls.append((method,path))
        def getresponse(self):
            result=self.results.pop(0)
            if isinstance(result,BaseException):raise result
            return result
        def close(self):type(self).closed+=1
    class FiniteStop:
        def __init__(self):self.stopped=False;self.waits=0
        def is_set(self):return self.stopped
        def set(self):self.stopped=True
        def wait(self,seconds):
            self.waits+=1
            if self.waits>=4:self.stopped=True
            return self.stopped
    class InertThread:
        def __init__(self,*args,**kwargs):pass
        def start(self):pass
        def join(self,**kwargs):pass
        def is_alive(self):return False
    def setUp(self):
        self.Connection.results=[];self.Connection.calls=[];self.Connection.closed=0
        patch=mock.patch('executor.testnet_fleet.http.client.HTTPConnection',self.Connection);patch.start();self.addCleanup(patch.stop)
        self.sleep=mock.patch('executor.testnet_fleet.time.sleep');self.sleep_mock=self.sleep.start();self.addCleanup(self.sleep.stop)
        for name in ('socket.create_connection','subprocess.Popen','subprocess.run'):
            patch=mock.patch(name,side_effect=AssertionError('Actual network/process forbidden'));patch.start();self.addCleanup(patch.stop)
    def instance(self):
        service=object.__new__(fleet.Fleet)
        service.root=Path('/inert-no-files-touched');service.spec={'service_expires_at':str(int(time.time())+600),'worker_key_id':'synthetic-worker'}
        service.state={'companies':{},'halted':None};service.state_lock=__import__('threading').RLock();service.heartbeat_lock=__import__('threading').RLock()
        service.stop=self.FiniteStop();service.fatal=None;service.fatal_error=None;service.read_pause_error=None;service.deadline=None
        service.counts=mock.Mock(return_value=(0,0));service.save=mock.Mock()
        service.issuer=mock.Mock(side_effect=AssertionError('Actual issuer forbidden'))
        service.registry=types.SimpleNamespace(dispatch_ready=mock.Mock(return_value={'online':True}))
        return service
    def test_health_timeout_is_bounded_classified_read_only_and_never_inference(self):
        self.Connection.results=[TimeoutError() for _ in range(3)]
        with self.assertRaises(fleet.RegistryReadUnavailable) as caught:fleet.model_ready()
        self.assertEqual(fleet.read_failure(caught.exception),{'method':'local_model_tags','http_status':None,'error_kind':'TimeoutError','attempts':3,'read_only':True})
        self.assertEqual(self.Connection.calls,[('GET','/api/tags')]*3);self.assertEqual(self.Connection.closed,3)
        self.assertEqual(self.sleep_mock.call_args_list,[mock.call(2),mock.call(4)])
    def test_health_timeout_then_success_retries_only_fixed_tags(self):
        self.Connection.results=[TimeoutError(),self.Response()];fleet.model_ready()
        self.assertEqual(self.Connection.calls,[('GET','/api/tags')]*2);self.assertEqual(self.Connection.closed,2)
    def test_health_transient_http_exhaustion_is_bounded(self):
        self.Connection.results=[self.Response(503) for _ in range(3)]
        with self.assertRaises(fleet.RegistryReadUnavailable) as caught:fleet.model_ready()
        self.assertEqual(caught.exception.diagnostic['http_status'],503);self.assertEqual(len(self.Connection.calls),3)
    def test_health_semantic_identity_json_size_and_auth_fail_closed_without_retry(self):
        cases=[self.Response(raw=json.dumps({'models':[{'name':fleet.MODEL,'digest':'wrong'}]}).encode()),self.Response(raw=b'{'),self.Response(raw=b'x'*1_048_577),self.Response(401)]
        for response in cases:
            with self.subTest(status=response.status,size=len(response.raw)):
                self.Connection.results=[response];self.Connection.calls=[]
                with self.assertRaises(ValueError):fleet.model_ready()
                self.assertEqual(self.Connection.calls,[('GET','/api/tags')])
    def test_health_timeout_never_reaches_heartbeat_issuer(self):
        service=self.instance();self.Connection.results=[TimeoutError() for _ in range(3)]
        with self.assertRaises(fleet.RegistryReadUnavailable):service.heartbeat()
        service.issuer.assert_not_called();service.counts.assert_not_called()
    def run_actual_fleet(self,*,recovers,initially_healthy=False):
        service=self.instance();health_calls=[];effects={'ticks':0,'reservations':0}
        service.registry=types.SimpleNamespace(discover=mock.Mock(return_value={'service':{'online':True},'block':{'height':123},'records':[]}),dispatch_ready=mock.Mock(return_value={'online':True}))
        def health_probe():
            health_calls.append('GET /api/tags')
            if initially_healthy and len(health_calls)==1:return
            if not recovers or len(health_calls)<3:raise fleet.RegistryReadUnavailable('local_model_tags',None,'TimeoutError',3)
        def inert_tick(found):
            effects['ticks']+=1
            service.dispatch_ready()
            effects['reservations']+=1
            service.stop.set();return []
        service.tick=inert_tick
        if initially_healthy:service.issuer=mock.Mock(return_value={'status':'final'})
        with mock.patch.object(fleet.adapter,'_ExistingVault',return_value=object()),mock.patch.object(fleet,'public_manifest',return_value={'worker_key_id':'synthetic-worker'}),mock.patch.object(fleet.threading,'Thread',self.InertThread),mock.patch.object(fleet,'model_ready',side_effect=health_probe):fleet.Fleet.run(service,60,15)
        return service,effects,health_calls
    def test_actual_run_bad_health_old_online_heartbeat_never_clears_pause_or_reserves(self):
        service,effects,health=self.run_actual_fleet(recovers=False)
        self.assertEqual(effects,{'ticks':0,'reservations':0});self.assertGreaterEqual(len(health),2)
        self.assertIsNotNone(service.read_pause_error);service.registry.discover.assert_not_called();service.registry.dispatch_ready.assert_not_called();service.issuer.assert_not_called()
    def test_actual_run_recovers_once_only_after_health_succeeds(self):
        service,effects,health=self.run_actual_fleet(recovers=True)
        self.assertEqual(effects,{'ticks':1,'reservations':1});self.assertGreaterEqual(len(health),4)
        self.assertIsNone(service.read_pause_error);service.registry.discover.assert_called_once_with(online=False);service.registry.dispatch_ready.assert_called_once_with();service.issuer.assert_not_called()
    def test_recovery_preserves_a_new_concurrent_pause_during_health_check(self):
        service=self.instance();probes=[];ticks=mock.Mock(return_value=[])
        service.registry=types.SimpleNamespace(discover=mock.Mock(return_value={'service':{'online':True}}))
        def health():
            probes.append(True)
            pause=fleet.RegistryReadUnavailable('local_model_tags',None,'TimeoutError',3)
            if len(probes)==1:raise pause
            # Simulate a separate heartbeat publishing a fresh failure while
            # this recovery's own fixed health read is in flight.
            service.queue_read_pause(pause)
        with mock.patch.object(fleet.adapter,'_ExistingVault',return_value=object()),mock.patch.object(fleet,'public_manifest',return_value={'worker_key_id':'synthetic-worker'}),mock.patch.object(fleet.threading,'Thread',self.InertThread),mock.patch.object(fleet,'model_ready',side_effect=health),mock.patch.object(service,'tick',ticks):fleet.Fleet.run(service,60,15)
        ticks.assert_not_called();service.issuer.assert_not_called();self.assertIsNotNone(service.read_pause_error)
        self.assertGreaterEqual(service.registry.discover.call_count,1)
    def test_actual_run_checks_health_before_normal_discovery(self):
        service,effects,health=self.run_actual_fleet(recovers=False,initially_healthy=True)
        self.assertEqual(effects,{'ticks':0,'reservations':0});self.assertGreaterEqual(len(health),2)
        service.registry.discover.assert_not_called();service.registry.dispatch_ready.assert_not_called();service.issuer.assert_called_once_with('heartbeat')
    def test_direct_write_and_reserved_model_gates_refuse_bad_health_before_native(self):
        for name in ('dispatch_ready','model_dispatch_ready'):
            with self.subTest(gate=name):
                service=self.instance();self.Connection.results=[TimeoutError() for _ in range(3)]
                with self.assertRaises(fleet.ServiceUnavailable):getattr(service,name)()
                self.assertEqual(fleet.read_failure(service.read_pause_error)['method'],'local_model_tags')
                service.registry.dispatch_ready.assert_not_called();self.assertIsNone(service.fatal)
    def test_new_logical_reservation_never_starts_while_model_health_is_bad(self):
        service=self.instance();self.Connection.results=[TimeoutError() for _ in range(3)]
        underlying=types.SimpleNamespace(identity_key='synthetic-identity',_read=lambda:{'calls':{}});complete=mock.Mock()
        client=fleet.FleetLimitedClient(types.SimpleNamespace(inner=underlying,complete=complete),lambda:(0,0),service.dispatch_ready)
        with self.assertRaises(fleet.ServiceUnavailable):client.complete('new',[],'approved')
        complete.assert_not_called();service.registry.dispatch_ready.assert_not_called()
    def test_health_read_cannot_cross_original_finite_dispatch_deadline(self):
        service=self.instance();service.deadline=time.monotonic()+60
        def health():service.deadline=time.monotonic()-1
        with mock.patch.object(fleet,'model_ready',side_effect=health):
            with self.assertRaises(fleet.ServiceUnavailable):service.dispatch_ready()
        service.registry.dispatch_ready.assert_not_called();self.assertTrue(service.stop.is_set())
    def test_public_read_only_registry_audit_remains_independent_of_model(self):
        registry=fleet.PublicRegistry({});registry.request=mock.Mock(return_value={'chain_id':'wrong'})
        with mock.patch.object(fleet,'model_ready',side_effect=AssertionError('Audit must not touch model')) as health:
            with self.assertRaises(ValueError):registry.discover(online=False)
            health.assert_not_called()


if __name__=='__main__':unittest.main()
