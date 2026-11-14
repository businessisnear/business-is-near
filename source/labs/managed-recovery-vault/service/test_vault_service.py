"""All rights reserved. New synthetic fixture secrets only; no servers or RPC."""
import base64,concurrent.futures,hashlib,io,json,os,secrets,tempfile,unittest
from unittest.mock import patch
from pathlib import Path
from email.message import Message
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
from vault_service import ManagedRecovery,RecoveryStore,AuthenticationError,digest,canonical,strict_json
from wallet_auth import serialize_nep413,ALPHABET
from serve_vault import handler_for,validate_post,cookie,static_assets
GENESIS='1'*32;CODE='1'*31+'2';COMPANY='company.testnet';OWNER='owner.testnet';ORIGIN='http://127.0.0.1:18901';SCOPE='a'*64;ACTUAL='work_synthetic'
def b58(raw):
    n=int.from_bytes(raw,'big');s=''
    while n:n,r=divmod(n,58);s=ALPHABET[r]+s
    return '1'*(len(raw)-len(raw.lstrip(b'\0')))+s
class Authority:
    network='sandbox';chain_id='test-chain';genesis_hash=GENESIS;companies={COMPANY:CODE}
    def __init__(self):self.revoked=False;self.owner=OWNER;self.snapshots=0;self.queries=0;self.task={'scope_hash':SCOPE,'status':'archived','encrypted_scope':'synthetic-only','encrypted_evidence':'synthetic-only','evidence_hash':'b'*64}
    def snapshot(self,company,account,key):
        self.snapshots+=1
        return {'chain_id':self.chain_id,'genesis_hash':self.genesis_hash,'block_hash':GENESIS,'block_height':10,'company_id':company,'code_hash':self.companies.get(company),'owner':self.owner,'account_id':account,'public_key':key,'permission':None if self.revoked else 'FullAccess'}
    def _rpc(self,method,params):
        self.queries+=1
        if method!='query' or params['account_id']!=COMPANY or params['block_id']!=GENESIS or params['method_name'] not in ('company_task','company_state'):raise AssertionError('Unexpected RPC authority')
        value=self.task if params['method_name']=='company_task' else {'owner':self.owner,'idea_hash':'c'*64,'goal_hash':'d'*64}
        return {'block_hash':GENESIS,'block_height':10,'result':list(canonical(value).encode())}
def login(service):
    private=Ed25519PrivateKey.generate();public='ed25519:'+b58(private.public_key().public_bytes(serialization.Encoding.Raw,serialization.PublicFormat.Raw));browser=secrets.token_urlsafe(32)
    challenge=service.auth.begin(COMPANY,OWNER,browser);payload=serialize_nep413(challenge['message'],base64.b64decode(challenge['nonce']),challenge['recipient'],challenge['callback_url']);signed={'accountId':OWNER,'publicKey':public,'signature':base64.b64encode(private.sign(hashlib.sha256(payload).digest())).decode(),'state':challenge['state']}
    result=service.auth.exchange(signed,browser);return result['token'],result['csrf'],signed,browser
class VaultTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name).resolve()/'new-private-vault';self.a=Authority();self.s=ManagedRecovery(self.root,ORIGIN,self.a);self.token,self.csrf,self.signed,self.browser=login(self.s);self.body={'company_id':COMPANY,'kind':'task','record_id':digest('recovery-id-v1\0task\0'+ACTUAL),'commitment':SCOPE};self.secret=canonical({'version':1,'task_id':ACTUAL,'scope_hash':SCOPE,'record_key':secrets.token_urlsafe(32)})
    def tearDown(self):self.temp.cleanup()
    def op(self,action,body=None):return self.s.operation(action,body if body is not None else self.body,self.token,self.csrf)
    def save(self):return self.op('save',{**self.body,'recovery':self.secret})
    def test_real_signature_actual_disk_aead_restart_restore(self):
        ack=self.save();self.assertEqual(ack['binding']['owner'],OWNER);self.assertEqual(ack['binding']['genesis_hash'],GENESIS);self.assertFalse(ack['wallet_native_storage']);self.assertNotIn(self.secret,next(self.s.store.records.glob('*.json')).read_text());self.s=ManagedRecovery(self.root,ORIGIN,self.a);self.assertEqual(self.op('open')['recovery'],self.secret);self.assertEqual(len(self.op('list',{'company_id':COMPANY})['bindings']),1)
    def test_exact_duplicate_idempotent_conflict_immutable(self):
        a=self.save();b=self.save();self.assertEqual(a,b)
        with self.assertRaises(AuthenticationError):self.op('save',{**self.body,'recovery':'different'})
        self.assertEqual(self.op('open')['recovery'],self.secret)
    def test_replayed_challenge_denied_after_restart(self):
        self.s=ManagedRecovery(self.root,ORIGIN,self.a)
        with self.assertRaises(AuthenticationError):self.s.auth.exchange(self.signed,self.browser)
    def test_revocation_and_owner_change_deny_before_store(self):
        self.save();self.a.revoked=True
        with self.assertRaises(AuthenticationError):self.op('open')
        self.a.revoked=False;self.a.owner='new-owner.testnet'
        with self.assertRaises(AuthenticationError):self.op('list',{'company_id':COMPANY})
    def test_missing_initialized_key_never_regenerates(self):
        self.save();self.s.store.key_path.unlink()
        with self.assertRaises(AuthenticationError):ManagedRecovery(self.root,ORIGIN,self.a)
        self.assertFalse(self.s.store.key_path.exists())
    def test_protected_files_directory_and_key_permission(self):
        self.save();self.assertEqual(os.stat(self.root).st_mode&0o777,0o700);self.assertEqual(os.stat(self.s.store.key_path).st_mode&0o777,0o600);self.s.store.key_path.chmod(0o644)
        with self.assertRaises(AuthenticationError):ManagedRecovery(self.root,ORIGIN,self.a)
    def test_ciphertext_mutation_rejected(self):
        self.save();path=next(self.s.store.records.glob('*.json'));row=strict_json(path.read_bytes());raw=bytearray(base64.b64decode(row['ciphertext']));raw[0]^=1;row['ciphertext']=base64.b64encode(raw).decode();path.write_text(canonical(row));path.chmod(0o600)
        with self.assertRaises(AuthenticationError):self.op('open')
    def test_fsync_failure_visible_original_requires_reconfirmation(self):
        old=self.s.store._sync_dir;self.s.store._sync_dir=lambda path:(_ for _ in ()).throw(OSError('synthetic fsync failure'))
        with self.assertRaises(OSError):self.save()
        self.assertEqual(len(list(self.s.store.records.glob('*.json'))),1)
        with self.assertRaises(OSError):self.save()
        self.s.store._sync_dir=old;self.assertTrue(self.save()['saved'])
    def test_unicode_and_oversize_before_auth_store(self):
        before=self.a.snapshots
        for recovery in ['\ud800','x'*16385]:
            with self.assertRaises(AuthenticationError):self.op('save',{**self.body,'recovery':recovery})
        self.assertEqual(before,self.a.snapshots);self.assertEqual(list(self.s.store.records.iterdir()),[])
        self.secret='\ufeffsynthetic 😀';self.save();self.assertEqual(self.op('open')['recovery'],self.secret)
    def test_concurrent_conflicting_saves_one_original(self):
        def save(value):
            try:return self.op('save',{**self.body,'recovery':value})['saved']
            except AuthenticationError:return False
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(save,['first','second']))
        self.assertEqual(results.count(True),1);self.assertEqual(len(list(self.s.store.records.glob('*.json'))),1)
    def test_context_before_save_exact_scope_id_and_final(self):
        result=self.op('context',{**self.body,'actual_id':ACTUAL});self.assertEqual(result['context']['task']['id'],ACTUAL);self.assertEqual(self.a.queries,1)
        with self.assertRaises(AuthenticationError):self.op('context',{**self.body,'actual_id':'foreign'})
        self.a.task['scope_hash']='b'*64
        with self.assertRaises(AuthenticationError):self.op('context',{**self.body,'actual_id':ACTUAL})
    def test_bad_fields_foreign_scope_no_authority(self):
        for b in [{**self.body,'owner':'forged.testnet'},{**self.body,'record_id':'../../key'},{**self.body,'company_id':'foreign.testnet'}]:
            with self.assertRaises((AuthenticationError,KeyError)):self.op('open',b)
    def test_http_without_bind_exact_origin_csrf_redacted_errors(self):
        Handler=handler_for(self.s,18901,{})
        def request(route,body,extra=None):
            raw=canonical(body).encode();headers=Message()
            for k,v in {'Host':'127.0.0.1:18901','Origin':ORIGIN,'Content-Type':'application/json','Content-Length':str(len(raw)),'Cookie':'proofwork_owner_session='+self.token+'; proofwork_owner_csrf='+self.csrf,'X-Proof-CSRF':self.csrf,**(extra or {})}.items():headers[k]=v
            h=object.__new__(Handler);h.path=route;h.headers=headers;h.rfile=io.BytesIO(raw);capture=[];h.send=lambda *a,**k:capture.append((a,k));h.do_POST();return capture[0][0]
        status,value=request('/__private/recovery/save',{**self.body,'recovery':self.secret});self.assertEqual(status,200);self.assertTrue(value['saved'])
        for patch in [{'Origin':'https://foreign.invalid'},{'Host':'foreign.invalid'},{'X-Proof-CSRF':'bad'}]:
            status,value=request('/__private/recovery/open',self.body,patch);self.assertEqual(status,403);self.assertEqual(value,{'error':'Managed recovery request denied'});self.assertNotIn(self.secret,canonical(value))
    def test_cookie_flags_and_static_allowlist_no_directory(self):
        self.assertIn('HttpOnly',cookie('proofwork_owner_session','synthetic',True,True));self.assertIn('Secure',cookie('proofwork_owner_session','synthetic',True,True));self.assertIn('SameSite=Strict',cookie('proofwork_owner_session','synthetic',True,True))
        ui=Path(self.temp.name).resolve()/'ui';ui.mkdir();(ui/'index.html').write_text('synthetic');(ui/'callback.html').write_text('synthetic')
        self.assertEqual(len(static_assets(ui,{'/__vault/':'index.html','/wallet-auth-callback.html':'callback.html'})),2)
        with self.assertRaises(AuthenticationError):static_assets(ui,{'/__vault/':'../index.html','/wallet-auth-callback.html':'callback.html'})
    def test_duplicate_json_and_headers_rejected(self):
        with self.assertRaises(AuthenticationError):strict_json('{"company_id":"a","company_id":"b"}')
        h=Message();h['Origin']=ORIGIN;h['Origin']=ORIGIN;h['Content-Type']='application/json';h['Content-Length']='1'
        with self.assertRaises(AuthenticationError):validate_post(h,ORIGIN)
    def test_existing_visible_key_after_initial_fsync_failure_is_reconfirmed(self):
        root=Path(self.temp.name).resolve()/'new-key-failure';key=root/'wrapping-key.v1';original=os.fsync
        def fail_key(fd):
            if key.exists() and os.fstat(fd).st_ino==key.stat().st_ino:raise OSError('synthetic key fsync failure')
            return original(fd)
        with patch('vault_service.os.fsync',side_effect=fail_key):
            with self.assertRaises(OSError):RecoveryStore(root)
            self.assertTrue(key.exists())
            with self.assertRaises(OSError):RecoveryStore(root)
        store=RecoveryStore(root);self.assertTrue(store.marker.exists())
    def test_existing_initialized_key_and_marker_fsync_failure_block_restart(self):
        self.save();original=os.fsync
        for path in (self.s.store.key_path,self.s.store.marker):
            def fail_existing(fd,path=path):
                if os.fstat(fd).st_ino==path.stat().st_ino:raise OSError('synthetic persistent lifecycle fsync failure')
                return original(fd)
            with patch('vault_service.os.fsync',side_effect=fail_existing):
                with self.assertRaises(OSError):RecoveryStore(self.s.store.root)
        self.s=ManagedRecovery(self.root,ORIGIN,self.a);self.assertEqual(self.op('open')['recovery'],self.secret)
if __name__=='__main__':unittest.main(verbosity=2)
