"""Offline tests: synthetic testnet gateway and deterministic transport, no model/RPC."""
import contextlib
import copy
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest import mock

from app.near_ai_client import DEFAULT, NearAIClient
from app.onchain_ai import OnchainAI
from app.worker_crypto import WorkerVault
from executor.crypto import private_cache_keys, public_manifest
from executor.operations import BusinessExecutor
from executor.rpc_gateway import GatewayError, PreflightRefused, RPCGateway
from executor import testnet_mock as adapter


CODE = '5Tcpex9PcqvUTb2tTN2HokZ9XQA3X5UW8ZvQ5oU8uV8Z'
MESSAGES = [{'role': 'system', 'content': 'Return one JSON object.'},
            {'role': 'user', 'content': 'Draft only from the approved fact.'}]


class StubGateway:
    """Explicit synthetic chain authority; actual bounded client remains unmodified."""
    def __init__(self, config):
        self.config = dict(config)
        self.pending = False
        self.reserves = []
        self.completes = []
        self.records = {}
        self.started = 0
        self.closed = 0
        self.unknown_completion = False
        self.policy = {**OnchainAI.translate({**DEFAULT, 'enabled': True,
                        'scope_consent': True}), 'version': 1}
        self.state = {
            'network': 'NEAR testnet', 'contract_id': config['contract_id'],
            'operator': config['operator_id'],
            'session_id': 'testnet:' + config['contract_id'] + ':' + config['expected_code_hash'],
            'contract': {'owner': 'owner.testnet', 'operator': config['operator_id'], 'frozen': False},
            'company': {'frozen': False},
            'execution_profile': {'profile': 'business-operations-v1', 'worker_key_id': config['worker_key_id']},
        }
        self.task = {'id': 'approved_task', 'kind': 'general', 'operation': 'content_draft',
                     'status': 'awaiting_evidence', 'approved_by': 'owner.testnet',
                     'worker_key_id': config['worker_key_id']}

    def snapshot(self):
        return copy.deepcopy(self.state)

    def start(self):
        self.started += 1
        return self.snapshot()

    def close(self):
        self.closed += 1

    @staticmethod
    def transaction(method, ident):
        return {'method': method, 'job_id': 'approved_task', 'hash': method + '-' + ident,
                'signer': 'operator.testnet', 'receiver': 'company.testnet',
                'gas_burnt': '1', 'tokens_burnt': '1', 'receipts': ['synthetic-receipt']}

    def call(self, command, **args):
        if command == 'state':
            return {'ok': True, 'state': self.snapshot()}
        if command == 'ai_policy':
            return {'ok': True, 'policy': copy.deepcopy(self.policy)}
        if command == 'company_list':
            return {'ok': True, 'tasks': {'items': [copy.deepcopy(self.task)] if self.task else [], 'next_index': None}}
        if command == 'ai_reserve_call':
            self.reserves.append(copy.deepcopy(args))
            if args['id'] in self.records:
                return {'ok': True, 'duplicate': True}
            self.records[args['id']] = {**args, 'status': 'reserved', 'output_hash': ''}
            return {'ok': True, 'tx': self.transaction(command, args['id'])}
        if command == 'ai_call':
            return {'ok': True, 'call': copy.deepcopy(self.records[args['id']])}
        if command == 'ai_complete_call':
            self.completes.append(copy.deepcopy(args))
            self.records[args['id']].update(status='completed', output_hash=args['output_hash'])
            if self.unknown_completion:
                raise TimeoutError('Synthetic completion response loss after chain commitment')
            return {'ok': True, 'tx': self.transaction(command, args['id'])}
        raise AssertionError('Unexpected synthetic gateway operation: ' + command)


class TestnetMockTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.seed = tempfile.TemporaryDirectory(prefix='testnet-mock-synthetic-vault-')
        cls.seed_root = Path(cls.seed.name).resolve()
        cls.seed_vault = WorkerVault(cls.seed_root / 'vault')
        cls.worker_id = public_manifest(cls.seed_vault)['worker_key_id']

    @classmethod
    def tearDownClass(cls):
        cls.seed.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='testnet-mock-offline-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.worker = self.root / 'worker'
        self.worker.mkdir(mode=0o700)
        shutil.copytree(self.seed_root / 'vault', self.worker / 'vault')
        self.operator = self.worker / 'operator.json'
        self.write(self.operator, {'account_id': 'operator.testnet',
                                   'secret_key': 'synthetic-not-a-real-wallet-key'})
        self.gateway = {'network': 'testnet', 'rpc_url': adapter.RPC, 'chain_id': 'testnet',
                        'contract_id': 'company.testnet', 'operator_id': 'operator.testnet',
                        'operator_key_file': str(self.operator),
                        'journal': str(self.worker / 'rpc-journal.json'),
                        'expected_code_hash': CODE, 'worker_key_id': self.worker_id}
        self.worker_config = self.root / 'worker-config.json'
        self.write(self.worker_config, {'data_dir': str(self.worker), 'gateway': self.gateway})
        self.spec = {'schema': 1, 'profile': adapter.PROFILE, 'worker_config': str(self.worker_config),
                     'pins': {key: self.gateway[key] for key in
                              ('contract_id', 'expected_code_hash', 'worker_key_id')},
                     'model': adapter.MODEL, 'model_digest': adapter.EXPECTED_DIGEST,
                     'acknowledgement': adapter.ACKNOWLEDGEMENT}
        self.config = self.root / 'mock-profile.json'
        self.write(self.config, self.spec)
        self.calls = []
        # Any accidental actual RPC, Cloud, Ollama, subprocess or wallet bridge fails the test.
        for name in ('socket.create_connection', 'http.client.HTTPConnection',
                     'http.client.HTTPSConnection', 'subprocess.Popen'):
            patch = mock.patch(name, side_effect=AssertionError('Network/subprocess forbidden offline'))
            patch.start()
            self.addCleanup(patch.stop)

    @staticmethod
    def write(path, value):
        path.write_text(json.dumps(value))
        path.chmod(0o600)

    def rewrite(self):
        self.write(self.config, self.spec)
        self.write(self.worker_config, {'data_dir': str(self.worker), 'gateway': self.gateway})

    def reply(self, payload, unused_key):
        self.calls.append(copy.deepcopy(payload))
        return {'choices': [{'message': {'content': '{"draft":"Approved fact only."}'}}],
                'usage': {'prompt_tokens': 12, 'completion_tokens': 8, 'total_tokens': 20}}

    def engine(self, gateway=None, transport=None):
        profile = adapter.load_profile(str(self.config))
        gateway = gateway or StubGateway(self.gateway)
        with mock.patch.object(adapter, 'transport', transport or self.reply):
            engine = adapter.create_executor(profile, gateway)
        return profile, gateway, engine

    def configure(self, engine, **changes):
        policy = {**DEFAULT, 'enabled': True, 'scope_consent': True, **changes}
        engine.gateway.policy.update(OnchainAI.translate(policy))
        engine.client.configure(policy)

    def test_validation_and_dry_run_read_only_config_not_keys(self):
        before = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        opened = []
        original = os.open
        def track(path, *args, **kwargs):
            opened.append(Path(path))
            return original(path, *args, **kwargs)
        with mock.patch.object(adapter.os, 'open', side_effect=track), \
                mock.patch.object(adapter, '_ExistingVault', side_effect=AssertionError('No key loading')), \
                mock.patch.object(adapter, 'DiagnosticRPCGateway', side_effect=AssertionError('No gateway construction')):
            for args in (['validate', '--config', str(self.config)],
                         ['run', '--dry-run', '--config', str(self.config)]):
                with contextlib.redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(adapter.main(args), 0)
                report = json.loads(output.getvalue())
                self.assertFalse(report['credential_files_read'])
                self.assertFalse(report['activated'])
                self.assertEqual(report['network_requests'], 0)
        self.assertEqual(set(opened), {self.config, self.worker_config})
        after = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before, after)

    def test_explicit_profile_and_pins_are_required(self):
        cases = [
            ('schema', True), ('profile', 'business-operations-v1'),
            ('model', 'arbitrary-model'), ('model_digest', '0' * 64),
            ('acknowledgement', 'yes'),
        ]
        original = copy.deepcopy(self.spec)
        for field, value in cases:
            with self.subTest(field=field):
                self.spec = copy.deepcopy(original)
                self.spec[field] = value
                self.rewrite()
                with self.assertRaises(ValueError):
                    adapter.load_profile(str(self.config))
        for field, value in [('contract_id', 'different.testnet'),
                             ('expected_code_hash', '2' * 43), ('worker_key_id', 'a' * 64)]:
            with self.subTest(pin=field):
                self.spec = copy.deepcopy(original)
                self.spec['pins'][field] = value
                self.rewrite()
                with self.assertRaises(ValueError):
                    adapter.load_profile(str(self.config))

    def test_only_fixed_near_listed_testnet_and_exact_gateway_fields(self):
        original = copy.deepcopy(self.gateway)
        for field, value in [('network', 'mainnet'), ('network', 'sandbox'),
                             ('chain_id', 'mainnet'), ('rpc_url', 'https://rpc.testnet.near.org'),
                             ('rpc_url', 'http://127.0.0.1:3030'), ('operator_id', 'company.testnet')]:
            with self.subTest(field=field, value=value):
                self.gateway = {**original, field: value}
                self.rewrite()
                with self.assertRaises(ValueError):
                    adapter.load_profile(str(self.config))
        self.gateway = {**original, 'arbitrary_provider_url': 'https://invalid.example'}
        self.rewrite()
        with self.assertRaises(ValueError):
            adapter.load_profile(str(self.config))

    def test_fastnear_is_fixed_and_retired_endpoint_cannot_activate_or_write(self):
        self.assertEqual(adapter.RPC, 'https://test.rpc.fastnear.com')
        profile = adapter.load_profile(str(self.config))
        self.assertEqual(profile.public_summary()['rpc_url'], 'https://test.rpc.fastnear.com')
        self.gateway['rpc_url'] = 'https://rpc.testnet.near.org'
        self.rewrite()
        before = {str(p.relative_to(self.root)): p.read_bytes()
                  for p in self.root.rglob('*') if p.is_file()}
        with mock.patch.object(adapter, 'DiagnosticRPCGateway', side_effect=AssertionError('No gateway construction')), \
                mock.patch.object(adapter, '_ExistingVault', side_effect=AssertionError('No key loading')):
            with self.assertRaisesRegex(ValueError, 'fixed NEAR-listed FastNear'):
                adapter.main(['run', '--dry-run', '--config', str(self.config)])
        after = {str(p.relative_to(self.root)): p.read_bytes()
                 for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(before, after)
        self.assertFalse((self.worker / adapter.IDENTITY_FILE).exists())

    def test_existing_runtime_bound_to_another_rpc_cannot_be_migrated_silently(self):
        profile, gateway, _ = self.engine()
        marker = self.worker / adapter.IDENTITY_FILE
        identity = json.loads(marker.read_text())
        identity['rpc_url'] = 'https://rpc.testnet.near.org'
        self.write(marker, identity)
        before = {str(p.relative_to(self.worker)): p.read_bytes()
                  for p in self.worker.rglob('*') if p.is_file()}
        with mock.patch.object(adapter, 'BusinessExecutor', side_effect=AssertionError('No engine reconstruction')):
            with self.assertRaisesRegex(ValueError, 'Existing mock runtime identity differs'):
                adapter.create_executor(profile, gateway)
        after = {str(p.relative_to(self.worker)): p.read_bytes()
                 for p in self.worker.rglob('*') if p.is_file()}
        self.assertEqual(before, after)
        self.assertEqual(self.calls, [])
        self.assertEqual(gateway.reserves, [])

    def test_private_permissions_symlinks_hardlinks_and_source_paths(self):
        for path in (self.config, self.worker_config, self.operator, self.worker / 'vault' / 'launch.pem'):
            with self.subTest(path=path.name):
                path.chmod(0o644)
                with self.assertRaises(ValueError):
                    adapter.load_profile(str(self.config))
                path.chmod(0o600)
        self.worker.chmod(0o755)
        with self.assertRaises(ValueError):
            adapter.load_profile(str(self.config))
        self.worker.chmod(0o700)
        alias = self.root / 'profile-link.json'
        alias.symlink_to(self.config)
        with self.assertRaises(ValueError):
            adapter.load_profile(str(alias))
        os.link(self.operator, self.root / 'operator-hardlink.json')
        with self.assertRaises(ValueError):
            adapter.load_profile(str(self.config))
        with self.assertRaises(ValueError):
            adapter._absolute(str(adapter.SOURCE_ROOT / 'OWNER-TOOLS.md'))

    def test_private_permissions_do_not_allow_repository_docs_sibling(self):
        # Only an inert fake config is temporarily created under the public
        # docs sibling; no credential, vault or runtime state is placed there.
        docs = adapter.SOURCE_ROOT.parent / 'docs'
        if not docs.is_dir() or adapter.SOURCE_ROOT.parent not in adapter.PRIVATE_PATH_EXCLUSIONS:
            self.skipTest('Publication-layout regression; standalone closure has no sibling public tree')
        with tempfile.TemporaryDirectory(prefix='offline-private-path-regression-', dir=docs) as raw:
            directory = Path(raw).resolve()
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
            fake = directory / 'fake-config.json'
            self.write(fake, {'fake': True})
            self.assertEqual(fake.stat().st_mode & 0o777, 0o600)
            with self.assertRaisesRegex(ValueError, 'outside served source or publication repository'):
                adapter._file(str(fake))
        # Normal private configurations outside both repository roots remain valid.
        self.assertEqual(adapter.load_profile(str(self.config)).pins['contract_id'], 'company.testnet')

    def test_standalone_editable_closure_still_excludes_its_source_root(self):
        with mock.patch.object(adapter, 'SOURCE_ROOT', self.root):
            roots = adapter._publication_roots()
        with mock.patch.object(adapter, 'PRIVATE_PATH_EXCLUSIONS', roots):
            with self.assertRaisesRegex(ValueError, 'outside served source or publication repository'):
                adapter._file(str(self.worker_config))

    def test_duplicate_json_and_extra_profile_fields_refused(self):
        self.config.write_text('{"schema":1,"schema":1}')
        with self.assertRaises(ValueError):
            adapter.load_profile(str(self.config))
        self.spec['provider_key'] = 'must-not-be-accepted'
        self.rewrite()
        with self.assertRaises(ValueError):
            adapter.load_profile(str(self.config))

    def test_actual_executor_construction_separates_identity_and_disables_cloud(self):
        profile, gateway, engine = self.engine()
        self.assertIsInstance(engine, BusinessExecutor)
        self.assertFalse(engine.sandbox)
        self.assertFalse(engine.autonomous)
        self.assertIsInstance(engine.client.inner, NearAIClient)
        self.assertEqual(engine.client.inner.path, self.worker / adapter.LEDGER_DIRECTORY / 'ledger.json')
        base_cache, base_identity = private_cache_keys(engine.vault, 'testnet', 'company.testnet')
        self.assertNotEqual(engine.client.inner.identity_key, base_identity)
        with self.assertRaises(ValueError):
            engine.intelligence.client.transport({}, 'unused')
        self.assertIsNone(engine.intelligence.client.key_provider())
        self.assertEqual(gateway.reserves, [])
        self.assertEqual(self.calls, [])
        status = engine.client.status()
        self.assertEqual(status['execution_model_digest'], adapter.EXPECTED_DIGEST)
        self.assertFalse(status['billing_estimate'])

    def test_runtime_gateway_and_actual_worker_key_must_match(self):
        profile = adapter.load_profile(str(self.config))
        bad = StubGateway({**self.gateway, 'expected_code_hash': '2' * 43})
        with self.assertRaises(ValueError):
            adapter.create_executor(profile, bad)
        self.gateway['worker_key_id'] = self.spec['pins']['worker_key_id'] = 'a' * 64
        self.rewrite()
        profile = adapter.load_profile(str(self.config))
        with self.assertRaises(ValueError):
            adapter.create_executor(profile, StubGateway(self.gateway))
        self.assertFalse((self.worker / adapter.IDENTITY_FILE).exists())

    def test_dispatch_expiry_after_reservation_blocks_actual_model_and_preserves_unknown(self):
        gateway=StubGateway(self.gateway);gate=mock.Mock(side_effect=ValueError('Service lease expired after reservation'))
        with mock.patch.object(adapter,'transport',self.reply):
            engine=adapter.create_executor(adapter.load_profile(str(self.config)),gateway,before_model=gate)
        self.configure(engine)
        result=engine.client.complete('approved_draft',MESSAGES,'approved_task')
        self.assertEqual(result['reason'],'outcome_unknown');gate.assert_called_once()
        self.assertEqual(self.calls,[]);self.assertEqual(len(gateway.reserves),1);self.assertEqual(gateway.completes,[])
        before=(self.worker/adapter.LEDGER_DIRECTORY/'ledger.json').read_bytes()
        self.assertEqual(engine.client.complete('approved_draft',MESSAGES,'approved_task')['reason'],'outcome_unknown')
        gate.assert_called_once();self.assertEqual((self.worker/adapter.LEDGER_DIRECTORY/'ledger.json').read_bytes(),before)

    def test_success_is_committed_then_reused_after_restart_without_inference(self):
        profile, gateway, engine = self.engine()
        self.configure(engine)
        first = engine.client.complete('approved_draft', MESSAGES, 'approved_task')
        self.assertTrue(first['ok'])
        self.assertFalse(first['cached'])
        self.assertEqual(first['execution_backend'], 'local_ollama')
        self.assertEqual(first['model'], adapter.MODEL)
        self.assertEqual(first['cloud_provider_charge_nanos'], 0)
        self.assertFalse(first['verified_attestation'])
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(gateway.reserves), 1)
        self.assertEqual(len(gateway.completes), 1)
        _, _, restarted = self.engine(gateway)
        second = restarted.client.complete('approved_draft', MESSAGES, 'approved_task')
        self.assertTrue(second['ok'])
        self.assertTrue(second['cached'])
        self.assertEqual(second['text'], first['text'])
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(gateway.reserves), 1)
        self.assertEqual(len(gateway.completes), 1)
        # The cache remains dependent on its confirmed encrypted chain commitment.
        gateway.records[gateway.reserves[0]['id']]['output_hash'] = '0' * 64
        self.assertEqual(restarted.client.complete('approved_draft', MESSAGES, 'approved_task')['reason'],
                         'cache_unavailable')
        self.assertEqual(len(self.calls), 1)

    def test_unknown_transport_outcome_is_not_retried_after_restart(self):
        def unknown(payload, key):
            self.calls.append(payload)
            raise TimeoutError('Synthetic unknown model outcome')
        _, gateway, engine = self.engine(transport=unknown)
        self.configure(engine)
        self.assertEqual(engine.client.complete('unknown_draft', MESSAGES, 'approved_task')['reason'],
                         'outcome_unknown')
        _, _, restarted = self.engine(gateway)
        self.assertEqual(restarted.client.complete('unknown_draft', MESSAGES, 'approved_task')['reason'],
                         'outcome_unknown')
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(gateway.reserves), 1)
        self.assertEqual(gateway.completes, [])

    def test_staged_completion_recovers_original_cache_without_second_inference(self):
        _, gateway, engine = self.engine()
        gateway.unknown_completion = True
        self.configure(engine)
        result = engine.client.complete('staged_draft', MESSAGES, 'approved_task')
        self.assertEqual(result['reason'], 'outcome_unknown')
        original_id = gateway.reserves[0]['id']
        _, _, restarted = self.engine(gateway)
        recovery = restarted.client.reconcile_staged(original_id)
        self.assertTrue(recovery['ok'])
        self.assertTrue(recovery['recovered'])
        self.assertTrue(restarted.client.complete('staged_draft', MESSAGES, 'approved_task')['cached'])
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(gateway.reserves), 1)
        self.assertEqual(len(gateway.completes), 1)
        # Lost completion-response fee evidence is not manufactured as zero.
        self.assertTrue(restarted.client.status()['chain_tx_fees_unknown'])

    def test_owner_policy_and_task_authority_gate_model_calls(self):
        _, gateway, engine = self.engine()
        self.configure(engine)
        for change in ('freeze', 'revoke_consent', 'wrong_owner', 'wrong_worker'):
            with self.subTest(change=change):
                state, task, policy = copy.deepcopy(gateway.state), copy.deepcopy(gateway.task), copy.deepcopy(gateway.policy)
                if change == 'freeze':
                    gateway.state['contract']['frozen'] = True
                elif change == 'revoke_consent':
                    gateway.policy['scope_consent'] = False
                elif change == 'wrong_owner':
                    gateway.task['approved_by'] = 'other.testnet'
                else:
                    gateway.task['worker_key_id'] = '0' * 64
                self.assertFalse(engine.client.complete('denied_' + change, MESSAGES, 'approved_task')['ok'])
                self.assertEqual(self.calls, [])
                self.assertEqual(gateway.reserves, [])
                gateway.state, gateway.task, gateway.policy = state, task, policy

    def test_bounded_client_count_limit_still_applies(self):
        _, gateway, engine = self.engine()
        self.configure(engine, max_calls_per_job=1, max_calls_per_day=1)
        self.assertTrue(engine.client.complete('first', MESSAGES, 'approved_task')['ok'])
        result = engine.client.complete('second', MESSAGES, 'approved_task')
        self.assertEqual(result['reason'], 'budget_or_count_limit')
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(gateway.reserves), 1)

    def test_lost_ledger_or_mode_marker_does_not_reset_state(self):
        _, gateway, engine = self.engine()
        engine.client.inner.path.unlink()
        with self.assertRaises((ValueError, FileNotFoundError)):
            self.engine(gateway)
        self.assertEqual(self.calls, [])
        # A retained worker mode cannot be silently adopted after its marker is lost.
        (self.worker / adapter.IDENTITY_FILE).unlink()
        with self.assertRaises(ValueError):
            self.engine(gateway)

    def test_new_mode_cannot_adopt_old_worker_state(self):
        self.write(self.worker / 'work.json', {'version': 1, 'tasks': {}, 'transactions': []})
        with self.assertRaises(ValueError):
            self.engine()
        self.assertFalse((self.worker / adapter.IDENTITY_FILE).exists())

    def test_started_state_and_unknown_journal_cannot_activate_work(self):
        profile, gateway, _ = self.engine()
        adapter._check_started(profile, gateway, gateway.snapshot())
        for field, value in [('network', 'mainnet'), ('contract_id', 'other.testnet'),
                             ('operator', 'other.testnet'), ('session_id', 'wrong')]:
            state = gateway.snapshot()
            state[field] = value
            with self.assertRaises(ValueError):
                adapter._check_started(profile, gateway, state)
        gateway.pending = True
        with self.assertRaises(ValueError):
            adapter._check_started(profile, gateway, gateway.snapshot())
        self.assertEqual(self.calls, [])

    def test_actual_run_requires_explicit_confirmation_and_finite_steps(self):
        with mock.patch.object(adapter, 'load_profile', side_effect=AssertionError('No setup reads')):
            for suffix in ([], ['--confirm-testnet-local-mock', '--steps', '0'],
                           ['--confirm-testnet-local-mock', '--steps', '33'],
                           ['--confirm-testnet-local-mock', '--interval', '1']):
                with self.subTest(suffix=suffix), self.assertRaises(ValueError):
                    adapter.main(['run', '--config', str(self.config), *suffix])

    def test_confirmed_finite_driver_uses_real_idle_business_ticks_and_closes_gateway(self):
        gateway = StubGateway(self.gateway)
        gateway.task = None
        order = []
        original_start, original_check, original_create = gateway.start, adapter._check_started, adapter.create_executor
        def start():
            order.append('start')
            return original_start()
        def check(*args):
            order.append('check')
            return original_check(*args)
        def create(*args):
            order.append('construct')
            self.assertEqual(order, ['start', 'check', 'construct'])
            return original_create(*args)
        gateway.start = start
        with mock.patch.object(adapter, 'DiagnosticRPCGateway', return_value=gateway), \
                mock.patch.object(adapter, '_check_started', side_effect=check), \
                mock.patch.object(adapter, 'create_executor', side_effect=create), \
                mock.patch.object(adapter.time, 'sleep') as sleep, \
                contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(adapter.main(['run', '--config', str(self.config),
                                           '--confirm-testnet-local-mock', '--steps', '2']), 0)
        rows = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(row['status']['status'] == 'idle_or_waiting' for row in rows))
        self.assertEqual(gateway.started, 1)
        self.assertEqual(gateway.closed, 1)
        self.assertEqual(sleep.call_args_list, [mock.call(2)])
        self.assertEqual(self.calls, [])
        self.assertEqual(gateway.reserves, [])

    def test_pending_startup_refuses_before_private_engine_state_is_created(self):
        gateway = StubGateway(self.gateway)
        gateway.pending = True
        before = {str(p.relative_to(self.worker)): p.read_bytes()
                  for p in self.worker.rglob('*') if p.is_file()}
        with mock.patch.object(adapter, 'DiagnosticRPCGateway', return_value=gateway), \
                mock.patch.object(adapter, 'create_executor') as create:
            with self.assertRaises(ValueError):
                adapter.main(['run', '--config', str(self.config), '--confirm-testnet-local-mock'])
        create.assert_not_called()
        self.assertEqual(gateway.closed, 1)
        after = {str(p.relative_to(self.worker)): p.read_bytes()
                 for p in self.worker.rglob('*') if p.is_file()}
        self.assertEqual(before, after)

    def test_real_second_lease_refusal_does_not_touch_private_engine_state(self):
        first = RPCGateway(self.gateway)
        first._acquire_lease()
        self.addCleanup(first.close)
        second = RPCGateway(self.gateway)
        before = {str(p.relative_to(self.worker)): p.read_bytes()
                  for p in self.worker.rglob('*') if p.is_file()}
        with mock.patch.object(adapter, 'DiagnosticRPCGateway', return_value=second), \
                mock.patch.object(adapter, 'create_executor') as create:
            with self.assertRaises(GatewayError):
                adapter.main(['run', '--config', str(self.config), '--confirm-testnet-local-mock'])
        create.assert_not_called()
        after = {str(p.relative_to(self.worker)): p.read_bytes()
                 for p in self.worker.rglob('*') if p.is_file()}
        self.assertEqual(before, after)
        self.assertFalse((self.worker / adapter.IDENTITY_FILE).exists())

    def test_actual_gateway_testnet_argv_fixed_flags_and_sandbox_unchanged(self):
        bridge = str(adapter.SOURCE_ROOT / 'executor/rpc_bridge.mjs')
        for network in ('testnet', 'sandbox'):
            with self.subTest(network=network):
                config = {**self.gateway, 'network': network}
                if network == 'sandbox':
                    config.update(rpc_url='http://127.0.0.1:3030', chain_id='synthetic-sandbox')
                gateway = RPCGateway(config)
                process = mock.Mock()
                process.poll.return_value = 0
                with mock.patch('executor.rpc_gateway.subprocess.Popen', return_value=process) as popen, \
                        mock.patch.object(gateway, '_read', return_value={'ready': True, 'state': {}, 'pending': False}), \
                        mock.patch.dict(os.environ, {'NODE_OPTIONS': 'synthetic-must-not-inherit',
                                                     'NEAR_AI_API_KEY': 'synthetic-must-not-inherit'}):
                    try:
                        self.assertEqual(gateway.start(), {})
                    finally:
                        gateway.close()
                expected = ['node', bridge]
                if network == 'testnet':
                    expected = ['node', '--dns-result-order=ipv4first',
                                '--network-family-autoselection-attempt-timeout=2000', bridge]
                self.assertEqual(popen.call_count, 1)
                self.assertEqual(popen.call_args.args[0], expected)
                environment = popen.call_args.kwargs['env']
                self.assertNotIn('NODE_OPTIONS', environment)
                self.assertNotIn('NEAR_AI_API_KEY', environment)
                self.assertEqual(environment['PROOF_WORK_RPC_URL'], config['rpc_url'])

    def test_correlated_read_refusal_logs_only_safe_diagnostic_once(self):
        gateway = adapter.DiagnosticRPCGateway(self.gateway)
        gateway.proc = mock.Mock()
        gateway.proc.poll.return_value = None
        gateway.proc.stdin = io.StringIO()
        diagnostic = {'stage': 'rpc.view.company_list', 'error_type': 'Error', 'http_status': 429}
        response = {}
        def reply(unused_timeout):
            request = json.loads(gateway.proc.stdin.getvalue().splitlines()[-1])
            response.update(id=request['idempotency_id'], ok=False, tx=None,
                            error='SENSITIVE PROVIDER MESSAGE', no_dispatch=None,
                            diagnostic=diagnostic, payload='PRIVATE SCOPE MUST NOT LOG')
            return response
        with mock.patch.object(gateway, '_read', side_effect=reply) as read, \
                contextlib.redirect_stderr(io.StringIO()) as output:
            result = gateway.call('company_list', from_index=0, limit=20)
        self.assertIs(result, response)
        self.assertEqual(read.call_count, 1)
        self.assertFalse(gateway.pending)
        self.assertFalse(gateway.broken)
        self.assertEqual(json.loads(output.getvalue()), {
            'event': 'testnet_mock_gateway_refused', 'profile': adapter.PROFILE,
            'stage': 'rpc.view.company_list', 'error_kind': 'Error', 'http_status': 429})
        self.assertNotIn('SENSITIVE', output.getvalue())
        self.assertNotIn('PRIVATE', output.getvalue())

    def test_preflight_start_and_write_log_once_and_propagate_original_refusal(self):
        for method, args, stage in (('start', (), 'rpc.status'),
                                    ('call', ('company_tick',), 'rpc.account')):
            with self.subTest(method=method):
                gateway = adapter.DiagnosticRPCGateway(self.gateway)
                error = PreflightRefused({'stage': stage, 'error_type': 'TimeoutError', 'http_status': None})
                with mock.patch.object(RPCGateway, method, side_effect=error) as original, \
                        contextlib.redirect_stderr(io.StringIO()) as output:
                    with self.assertRaises(PreflightRefused) as caught:
                        getattr(gateway, method)(*args)
                self.assertIs(caught.exception, error)
                self.assertEqual(original.call_count, 1)
                self.assertEqual(len(output.getvalue().splitlines()), 1)
                self.assertEqual(json.loads(output.getvalue())['stage'], stage)
                self.assertFalse(gateway.pending)

    def test_invalid_diagnostic_cannot_log_arbitrary_fields_or_values(self):
        valid = {'stage': 'rpc.status', 'error_type': 'Error', 'http_status': None}
        invalid = [{**valid, 'prompt': 'PRIVATE_PROMPT'}, {**valid, 'stage': 'PRIVATE_STAGE'},
                   {**valid, 'error_type': 'PRIVATE_KEY'}, {**valid, 'http_status': 'PRIVATE_RESPONSE'}]
        with contextlib.redirect_stderr(io.StringIO()) as output:
            for diagnostic in invalid:
                adapter._gateway_diagnostic(diagnostic)
        rows = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(rows), len(invalid))
        self.assertTrue(all(row == {'event': 'testnet_mock_gateway_refused', 'profile': adapter.PROFILE,
                                   'stage': 'unavailable', 'error_kind': 'GatewayDiagnosticUnavailable',
                                   'http_status': None} for row in rows))
        self.assertNotIn('PRIVATE', output.getvalue())

    def test_swallowed_reservation_read_refusal_is_logged_and_unknown_is_retained(self):
        gateway = adapter.DiagnosticRPCGateway(self.gateway)
        synthetic = StubGateway(self.gateway)
        queue_reads = 0
        def dispatch(command, **args):
            nonlocal queue_reads
            if command == 'company_list':
                queue_reads += 1
                if queue_reads == 2:  # The second job check occurs after durable local reservation.
                    return {'ok': False, 'tx': None, 'diagnostic': {
                        'stage': 'rpc.view.company_list', 'error_type': 'Error', 'http_status': 429}}
            return synthetic.call(command, **args)
        with mock.patch.object(RPCGateway, 'call', side_effect=dispatch), \
                mock.patch.object(adapter, 'transport', self.reply), \
                contextlib.redirect_stderr(io.StringIO()) as output:
            engine = adapter.create_executor(adapter.load_profile(str(self.config)), gateway)
            policy = {**DEFAULT, 'enabled': True, 'scope_consent': True}
            synthetic.policy.update(OnchainAI.translate(policy))
            engine.client.configure(policy)
            first = engine.client.complete('refused_before_signed_reserve', MESSAGES, 'approved_task')
            self.assertEqual(first['reason'], 'outcome_unknown')
            retained = engine.client.inner.path.read_bytes()
            second = engine.client.complete('refused_before_signed_reserve', MESSAGES, 'approved_task')
            self.assertEqual(second['reason'], 'outcome_unknown')
            self.assertEqual(engine.client.inner.path.read_bytes(), retained)
        rows = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['stage'], 'rpc.view.company_list')
        self.assertEqual(rows[0]['http_status'], 429)
        self.assertEqual(queue_reads, 2)
        ledger = engine.client.inner._read()
        self.assertEqual(len(ledger['calls']), 1)
        entry = next(iter(ledger['calls'].values()))
        self.assertEqual(entry['status'], 'unknown')
        self.assertGreater(entry['charge'], 0)
        self.assertEqual(synthetic.reserves, [])
        self.assertEqual(synthetic.completes, [])
        self.assertEqual(self.calls, [])

    def test_original_sandbox_only_local_model_flag_is_not_relaxed(self):
        profile = adapter.load_profile(str(self.config))
        with self.assertRaisesRegex(ValueError, 'restricted to the sandbox'):
            BusinessExecutor(StubGateway(self.gateway), self.seed_vault, self.worker,
                             sandbox=False, local_model=True)


if __name__ == '__main__':
    unittest.main()
