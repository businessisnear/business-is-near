"""Opt-in, finite public-testnet worker using the pinned local Gemma mock.

Validation is offline. This module does not provision accounts, grant keys,
configure owner policy, expose HTTP, or provide NEAR AI Cloud/TEE evidence.
The ordinary sandbox-only --local-model flag is deliberately unchanged.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import sys
import time
from types import MappingProxyType
from typing import Mapping

from app.near_ai_client import NearAIClient
from app.worker_crypto import WorkerVault
from executor.crypto import private_cache_keys, public_manifest
from executor.local_model import EXPECTED_DIGEST, MODEL, LocalModelClient, transport
from executor.operations import BusinessExecutor, OperationAIAuthority, digest
from executor.rpc_gateway import (ENV, READ, PREFLIGHT_STAGES, PREFLIGHT_TYPES,
                                  PreflightRefused, RPCGateway)

PROFILE = 'public-testnet-local-gemma-mock-v1'
RPC = 'https://test.rpc.fastnear.com'
ACKNOWLEDGEMENT = (
    'I authorize the pinned local Gemma mock on public NEAR testnet. '
    'This is not NEAR AI Cloud; Cloud billing and TEE execution are unverified.'
)
SOURCE_ROOT = Path(__file__).resolve().parents[1]


def _publication_roots() -> tuple[Path, ...]:
    # The published repository serves docs/ beside source/. Private permissions
    # do not make a file safe inside that public tree. A standalone editable
    # closure still excludes its entire source root without needing Git.
    roots = [SOURCE_ROOT]
    for parent in SOURCE_ROOT.parents:
        if (os.path.lexists(parent / '.git') or
                (parent / 'PUBLICATION-MANIFEST.json').is_file()):
            roots.append(parent)
            break
    return tuple(roots)


PRIVATE_PATH_EXCLUSIONS = _publication_roots()
LEDGER_DIRECTORY = 'testnet-local-gemma-mock'
IDENTITY_FILE = 'testnet-local-gemma-mock-profile.json'
_ACCOUNT = re.compile(r'(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet\Z')
_CODE = re.compile(r'[1-9A-HJ-NP-Za-km-z]{32,44}\Z')
_HASH = re.compile(r'[a-f0-9]{64}\Z')


def _absolute(raw: object) -> Path:
    if not isinstance(raw, str) or not Path(raw).is_absolute():
        raise ValueError('An absolute protected path is required')
    path = Path(raw)
    if path.resolve(strict=True) != path:
        raise ValueError('Canonical existing protected paths are required')
    if any(path == root or root in path.parents for root in PRIVATE_PATH_EXCLUSIONS):
        raise ValueError('Private configuration must be outside served source or publication repository')
    return path


def _directory(raw: object) -> Path:
    path = _absolute(raw)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077 or info.st_uid != os.getuid():
        raise ValueError('A private user-owned directory is required')
    return path


def _file(raw: object) -> Path:
    path = _absolute(raw)
    _directory(str(path.parent))
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or
            info.st_uid != os.getuid() or info.st_nlink != 1):
        raise ValueError('A private regular user-owned file is required')
    return path


def _json(path: Path) -> dict:
    _file(str(path))
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077 or
                info.st_uid != os.getuid() or info.st_nlink != 1 or info.st_size > 16384):
            raise ValueError('Invalid protected configuration')
        raw = os.read(fd, 16385)
    finally:
        os.close(fd)
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate configuration field')
            result[key] = value
        return result
    value = json.loads(raw, object_pairs_hook=unique)
    if not isinstance(value, dict):
        raise ValueError('A configuration object is required')
    return value


@dataclass(frozen=True)
class ValidatedProfile:
    data_dir: Path
    gateway: Mapping[str, str]
    pins: Mapping[str, str]

    def public_summary(self) -> dict:
        return {
            'profile': PROFILE, 'network': 'testnet', 'rpc_url': RPC,
            **dict(self.pins), 'model': MODEL, 'model_digest': EXPECTED_DIGEST,
            'execution_backend': 'local_ollama', 'cloud_billing_verified': False,
            'tee_verified': False, 'network_requests': 0,
            'credential_files_read': False, 'runtime_created': False,
            'activated': False,
        }


def load_profile(raw_path: str) -> ValidatedProfile:
    """Read protected configuration and stat private assets; no keys/network/writes."""
    spec = _json(_file(raw_path))
    if set(spec) != {'schema', 'profile', 'worker_config', 'pins', 'model',
                     'model_digest', 'acknowledgement'}:
        raise ValueError('Exact mock-profile fields are required')
    if type(spec['schema']) is not int or spec['schema'] != 1 or spec['profile'] != PROFILE:
        raise ValueError('Explicit public-testnet mock profile required')
    if (spec['model'] != MODEL or spec['model_digest'] != EXPECTED_DIGEST or
            spec['acknowledgement'] != ACKNOWLEDGEMENT):
        raise ValueError('Pinned local model and explicit mock acknowledgement required')
    pins = spec['pins']
    if (not isinstance(pins, dict) or
            set(pins) != {'contract_id', 'expected_code_hash', 'worker_key_id'} or
            not all(isinstance(value, str) for value in pins.values()) or
            not _ACCOUNT.fullmatch(pins['contract_id']) or
            not _CODE.fullmatch(pins['expected_code_hash']) or
            not _HASH.fullmatch(pins['worker_key_id'])):
        raise ValueError('Exact public contract, code and worker pins required')
    worker = _json(_file(spec['worker_config']))
    if set(worker) != {'data_dir', 'gateway'} or not isinstance(worker['gateway'], dict):
        raise ValueError('Exact worker configuration required')
    gateway = worker['gateway']
    if set(gateway) != set(ENV) or not all(isinstance(value, str) for value in gateway.values()):
        raise ValueError('Exact restricted gateway fields required')
    if (gateway['network'] != 'testnet' or gateway['chain_id'] != 'testnet' or
            gateway['rpc_url'] != RPC):
        raise ValueError('Only the fixed NEAR-listed FastNear testnet RPC is permitted')
    if any(gateway.get(key) != value for key, value in pins.items()):
        raise ValueError('Mock pins differ from protected gateway configuration')
    if (not _ACCOUNT.fullmatch(gateway['operator_id']) or
            gateway['operator_id'] == gateway['contract_id']):
        raise ValueError('A distinct named testnet operator is required')
    root = _directory(worker['data_dir'])
    key_path = _file(gateway['operator_key_file'])  # Do not open wallet credentials.
    journal = Path(gateway['journal'])
    if journal != root / 'rpc-journal.json' or key_path == journal:
        raise ValueError('A separate fixed worker journal is required')
    if journal.exists() or journal.is_symlink():
        _file(str(journal))
    vault = _directory(str(root / 'vault'))
    for name in ('master.key', 'launch.pem'):
        _file(str(vault / name))  # Presence/permissions only during validation.
    return ValidatedProfile(root, MappingProxyType(dict(gateway)), MappingProxyType(dict(pins)))


class _ExistingVault(WorkerVault):
    def _load_or_create(self, name, unused_factory):
        # A missing key is never silently regenerated during runtime activation.
        return self._read(name)


def _deny_cloud(*unused_args, **unused_kwargs):
    raise ValueError('Cloud fallback is not available in the testnet mock profile')


def _gateway_diagnostic(value: object) -> None:
    # Only the existing trusted bridge's bounded enum/HTTP fields are exposed.
    # Never print a provider error/message, command args, response or credential.
    valid = (isinstance(value, dict) and set(value) == {'stage', 'error_type', 'http_status'} and
             isinstance(value['stage'], str) and value['stage'] in PREFLIGHT_STAGES | {'uncertain'} and
             isinstance(value['error_type'], str) and value['error_type'] in PREFLIGHT_TYPES and
             (value['http_status'] is None or type(value['http_status']) is int and
              100 <= value['http_status'] <= 599))
    report = ({'stage': value['stage'], 'error_kind': value['error_type'], 'http_status': value['http_status']}
              if valid else {'stage': 'unavailable', 'error_kind': 'GatewayDiagnosticUnavailable', 'http_status': None})
    print(json.dumps({'event': 'testnet_mock_gateway_refused', 'profile': PROFILE, **report}, sort_keys=True),
          file=sys.stderr, flush=True)


class DiagnosticRPCGateway(RPCGateway):
    """Log bounded local diagnostics before inference catches a refusal.

    Results/exceptions and retained budgets/journals are otherwise unchanged.
    These diagnostics are observations, never permission to retry or reconcile.
    """
    def start(self):
        try:
            return super().start()
        except PreflightRefused as error:
            _gateway_diagnostic(error.diagnostic)
            raise

    def call(self, command, **args):
        try:
            result = super().call(command, **args)
        except PreflightRefused as error:
            _gateway_diagnostic(error.diagnostic)
            raise
        if command in READ and isinstance(result, dict) and result.get('ok') is False:
            _gateway_diagnostic(result.get('diagnostic'))
        return result


def _bind_runtime(profile: ValidatedProfile) -> None:
    marker = profile.data_dir / IDENTITY_FILE
    identity = {'schema': 1, 'profile': PROFILE, **dict(profile.pins),
                'operator_id': profile.gateway['operator_id'], 'network': 'testnet',
                'rpc_url': RPC, 'model': MODEL, 'model_digest': EXPECTED_DIGEST}
    if marker.exists() or marker.is_symlink():
        if _json(marker) != identity:
            raise ValueError('Existing mock runtime identity differs')
        return
    if any((profile.data_dir / name).exists() for name in
           ('work.json', 'near-ai', LEDGER_DIRECTORY)):
        raise ValueError('Existing worker state has no matching mock identity; inspect it')
    fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(json.dumps(identity, sort_keys=True, separators=(',', ':')))
        stream.flush()
        os.fsync(stream.fileno())
    fd = os.open(profile.data_dir, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def create_executor(profile: ValidatedProfile, gateway=None, *, executor_class=None, before_model=None) -> BusinessExecutor:
    """Construct local state; live callers must already hold a started gateway lease.

    Offline tests may supply their synthetic gateway without network activation.
    The actual CLI starts/checks the restricted gateway before calling this helper.
    """
    if not isinstance(profile, ValidatedProfile):
        raise ValueError('Load and validate the explicit mock profile first')
    if before_model is not None and not callable(before_model):
        raise ValueError('Model dispatch guard must be callable')
    if executor_class is None:
        executor_class = BusinessExecutor
    elif not isinstance(executor_class, type) or not issubclass(executor_class, BusinessExecutor):
        raise ValueError('A business executor implementation is required')
    gateway = gateway if gateway is not None else DiagnosticRPCGateway(dict(profile.gateway))
    if gateway.config != dict(profile.gateway):
        raise ValueError('Runtime gateway differs from reviewed mock configuration')
    vault = _ExistingVault(profile.data_dir / 'vault')
    if public_manifest(vault)['worker_key_id'] != profile.pins['worker_key_id']:
        raise ValueError('Existing worker encryption identity differs')
    _bind_runtime(profile)
    engine = executor_class(gateway, vault, profile.data_dir, sandbox=False,
                              local_model=False, autonomous=False,
                              transport=_deny_cloud, key_provider=lambda: None)
    cache, identity = private_cache_keys(vault, 'testnet', profile.pins['contract_id'])
    domain = '\0' + PROFILE + '\0' + MODEL + '\0' + EXPECTED_DIGEST
    cache, identity = digest(cache + domain), digest(identity + domain)
    selected_transport = transport
    def guarded_transport(payload, key):
        if before_model is not None:
            before_model()
        return selected_transport(payload, key)
    inner = NearAIClient(
        profile.data_dir / LEDGER_DIRECTORY / 'ledger.json',
        lambda value: vault.encrypt(value, cache)['envelope'],
        lambda value: vault.decrypt(value, cache),
        transport=guarded_transport, key_provider=lambda: 'local-only-no-api-key',
        authority=OperationAIAuthority(gateway), identity_key=identity)
    engine.client = LocalModelClient(inner)
    return engine


def _check_started(profile: ValidatedProfile, gateway, snapshot: dict) -> None:
    if (gateway.pending or snapshot.get('network') != 'NEAR testnet' or
            snapshot.get('contract_id') != profile.pins['contract_id'] or
            snapshot.get('operator') != profile.gateway['operator_id'] or
            snapshot.get('session_id') != 'testnet:' + profile.pins['contract_id'] + ':' + profile.pins['expected_code_hash'] or
            snapshot.get('execution_profile', {}).get('profile') != 'business-operations-v1' or
            snapshot.get('execution_profile', {}).get('worker_key_id') != profile.pins['worker_key_id']):
        raise ValueError('Confirmed testnet worker identity or reconciliation required')


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    validate = sub.add_parser('validate', help='Offline configuration validation; no activation')
    validate.add_argument('--config', required=True)
    run = sub.add_parser('run', help='Explicit finite activation; may sign testnet worker calls')
    run.add_argument('--config', required=True)
    run.add_argument('--dry-run', action='store_true')
    run.add_argument('--confirm-testnet-local-mock', action='store_true')
    run.add_argument('--steps', type=int, default=1)
    run.add_argument('--interval', type=int, default=2)
    args = parser.parse_args(argv)
    if args.action == 'run' and not args.dry_run:
        if not args.confirm_testnet_local_mock or not 1 <= args.steps <= 32 or not 2 <= args.interval <= 30:
            raise ValueError('Explicit finite testnet mock activation is required')
    profile = load_profile(args.config)
    if args.action == 'validate' or args.dry_run:
        print(json.dumps(profile.public_summary(), sort_keys=True))
        return 0
    gateway = DiagnosticRPCGateway(dict(profile.gateway))
    try:
        _check_started(profile, gateway, gateway.start())
        engine = create_executor(profile, gateway)
        for index in range(args.steps):
            status = engine.tick()
            print(json.dumps({'profile': PROFILE, 'execution_backend': 'local_ollama',
                              'cloud_billing_verified': False, 'tee_verified': False,
                              'status': status}), flush=True)
            if index + 1 < args.steps:
                time.sleep(args.interval)
        return 0
    finally:
        gateway.close()


if __name__ == '__main__':
    def stop(unused_signal, unused_frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, stop)
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(130)
    except Exception as error:
        print(json.dumps({'status': 'startup_or_run_refused', 'error_kind': type(error).__name__,
                          'action': 'Inspect protected configuration and original journals; no automatic retry.'}))
        raise SystemExit(2)
