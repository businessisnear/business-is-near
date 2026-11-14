"""Complete declared NEAR company state and private business-data exit capsules.

The collector's RPC is trusted: this is not a light-client state proof. Restore
never imports raw storage into a chain or restores old signing/provider authority.
The owner can reconnect the same persistent contracts after approving a new worker.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shutil
import stat
import tempfile
import zipfile

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.worker_crypto import encrypt, decrypt
from executor.portability import reject_private_material
from executor.wallet_auth import verify_signature

LEGACY_FORMAT = 'near-native-company-exit-v1'
FORMAT = 'near-native-company-exit-v2'
LEGACY_BUNDLE = 'near-native-company-exit-bundle-v1'
BUNDLE = 'near-native-company-exit-bundle-v2'
LEGACY_FAMILIES = ['app', 'appointments', 'company', 'factory', 'feed', 'knowledge', 'mail',
            'outbox', 'promotion', 'public_page', 'social', 'subscriptions']
FAMILIES = sorted(LEGACY_FAMILIES + ['service'])

def families_for_format(value):
    if value == FORMAT: return FAMILIES
    if value == LEGACY_FORMAT: return LEGACY_FAMILIES
    raise ValueError('Unknown company exit version')
SHARED = {'knowledge', 'mail', 'factory'}
HASH = re.compile(r'^[0-9a-f]{64}$')
ACCOUNT = re.compile(r'^(?=.{2,64}$)[a-z0-9]+(?:[._-][a-z0-9]+)*$')
B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
MAX_STORAGE = 8 * 1024 * 1024
MAX_PUBLIC = 64 * 1024 * 1024
MAX_SNAPSHOT = 96 * 1024 * 1024
MAX_PRIVATE = 16 * 1024 * 1024
MAX_FILE = 4 * 1024 * 1024
MAX_BUNDLE = 160 * 1024 * 1024
CHUNK = 65536
PRIVATE_KINDS = {'document', 'media', 'record_recoveries'}
PRIVATE_CIPHER = 'AES-256-GCM; per-chunk snapshot/file/position AAD; random data key wrapped by PBKDF2-SHA256-600000 owner envelope'


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True,
                      allow_nan=False).encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def strict(raw):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError('Duplicate exit JSON field')
            value[key] = item
        return value
    def finite(raw):
        value = float(raw)
        if not math.isfinite(value):
            raise ValueError('Nonfinite exit JSON')
        return value
    return json.loads(raw, object_pairs_hook=unique, parse_float=finite,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite exit JSON')))


def exact(value, names):
    if type(value) is not dict or set(value) != set(names):
        raise ValueError('Exact company-exit fields required')


def hash_value(value):
    if type(value) is not str or not HASH.fullmatch(value):
        raise ValueError('Lowercase SHA-256 required')
    return value


def account(value):
    if type(value) is not str or not ACCOUNT.fullmatch(value):
        raise ValueError('Exact NEAR identity required')
    return value


def b64(value):
    if type(value) is not str or len(value) % 4:
        raise ValueError('Canonical base64 required')
    try:
        raw = base64.b64decode(value, validate=True)
    except Exception as exc:
        raise ValueError('Canonical base64 required') from exc
    if base64.b64encode(raw).decode() != value:
        raise ValueError('Canonical base64 required')
    return raw


def _base58(value):
    if type(value) is not str or not 1 <= len(value) <= 100:
        raise ValueError('Bounded base58 hash required')
    number = 0
    for c in value:
        if c not in B58:
            raise ValueError('Invalid base58')
        number = number * 58 + B58.index(c)
    raw = b'\0' * (len(value) - len(value.lstrip('1'))) + (number.to_bytes((number.bit_length()+7)//8, 'big') if number else b'')
    if len(raw) != 32:
        raise ValueError('32-byte hash required')
    return raw


def reference(value):
    exact(value, {'hash', 'height'})
    _base58(value['hash'])
    if type(value['height']) is not int or value['height'] < 0:
        raise ValueError('Integer block height required')


def validate_charter(charter):
    exact(charter, {'format', 'company_id', 'owner_id', 'network', 'chain_id', 'genesis_hash',
                    'genesis_height', 'block', 'families', 'selection_complete_ack'})
    if charter['format'] not in (FORMAT, LEGACY_FORMAT) or charter['selection_complete_ack'] != 'ALL_KNOWN_COMPANY_CONTRACTS_DECLARED':
        raise ValueError('Explicit full-selection charter required')
    account(charter['company_id']); account(charter['owner_id']); reference(charter['block'])
    _base58(charter['genesis_hash'])
    if (charter['network'] not in ('sandbox', 'testnet', 'mainnet') or
            type(charter['chain_id']) is not str or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', charter['chain_id']) or
            type(charter['genesis_height']) is not int or charter['genesis_height'] < 0):
        raise ValueError('Pinned network/genesis required')
    rows = charter['families']
    if type(rows) is not list or [r.get('family') for r in rows if type(r) is dict] != families_for_format(charter['format']):
        raise ValueError('All known families must be declared once in sorted order')
    selected = []
    for row in rows:
        exact(row, {'family', 'status', 'contracts'})
        if row['status'] not in ('included', 'not_associated') or type(row['contracts']) is not list:
            raise ValueError('Exact family declaration required')
        if (row['status'] == 'included' and not 1 <= len(row['contracts']) <= 8 or
                row['status'] == 'not_associated' and row['contracts']):
            raise ValueError('A partial family cannot be called complete')
        names = []
        for item in row['contracts']:
            exact(item, {'account_id', 'relationship', 'code_hash', 'wasm_sha256'})
            account(item['account_id']); hash_value(item['wasm_sha256']); _base58(item['code_hash'])
            if _base58(item['code_hash']).hex() != item['wasm_sha256']:
                raise ValueError('WASM/code-hash commitment mismatch')
            if (item['relationship'] not in ('owned', 'shared_public') or
                    item['relationship'] == 'shared_public' and row['family'] not in SHARED or
                    row['family'] == 'knowledge' and item['relationship'] != 'shared_public'):
                raise ValueError('Unreviewed shared-public authority claim')
            names.append(item['account_id']); selected.append((row['family'], item))
        if names != sorted(set(names)):
            raise ValueError('Family contracts must be sorted and unique')
    names = [item['account_id'] for _, item in selected]
    if len(names) != len(set(names)) or len(names) > 32:
        raise ValueError('Duplicate/oversized portfolio')
    company = [item for family, item in selected if family == 'company']
    if len(company) != 1 or company[0]['account_id'] != charter['company_id'] or company[0]['relationship'] != 'owned':
        raise ValueError('Exactly the declared owner company is required')
    if len(canonical(charter)) > 16384:
        raise ValueError('Exit charter exceeds bound')
    return selected


def challenge(charter):
    validate_charter(charter)
    value = digest(canonical(charter))
    return {'account_id': charter['owner_id'], 'state': value,
            'nonce': base64.b64encode(bytes.fromhex(value)).decode(),
            'recipient': ('proofwork-company-exit-v2:' if charter['format'] == FORMAT else 'proofwork-company-exit-v1:') + charter['company_id'], 'callback_url': None,
            'message': 'Authorize NEAR-native company exit snapshot ' + value + '. Read-only export only; no transactions or delegation.'}


def validate_snapshot(snapshot):
    exact(snapshot, {'format', 'charter', 'signed', 'owner_access_key', 'contracts', 'coverage'})
    if snapshot['format'] not in (FORMAT, LEGACY_FORMAT) or snapshot['format'] != snapshot.get('charter', {}).get('format'):
        raise ValueError('Unknown exit snapshot version')
    charter = snapshot['charter']; selected = validate_charter(charter)
    key = verify_signature(challenge(charter), snapshot['signed'])
    proof = snapshot['owner_access_key']; exact(proof, {'public_key', 'permission', 'block'})
    if proof != {'public_key': key, 'permission': 'FullAccess', 'block': charter['block']}:
        raise ValueError('Snapshot owner key does not match signed charter')
    contracts = snapshot['contracts']
    if type(contracts) is not list or len(contracts) != len(selected):
        raise ValueError('A selected contract is missing')
    total = 0
    for row, (family, pin) in zip(contracts, selected):
        exact(row, {'family', 'account_id', 'relationship', 'code_hash', 'wasm_sha256', 'block', 'state', 'storage'})
        if row['family'] != family or any(row[k] != v for k, v in pin.items()) or row['block'] != charter['block']:
            raise ValueError('Contract/code/block changed from signed charter')
        if type(row['state']) is not dict:
            raise ValueError('Bounded contract state view required')
        owner_field = 'owner_id' if family == 'app' else 'merchant' if family in ('subscriptions', 'service') else 'owner'
        if row['relationship'] == 'owned' and row['state'].get(owner_field) != charter['owner_id']:
            raise ValueError('Company contract ownership mismatch')
        if family in ('feed', 'promotion') and row['state'].get('company_id') != charter['company_id']:
            raise ValueError('Native contract belongs to another company')
        store = row['storage']; exact(store, {'prefix_base64', 'complete', 'entries', 'bytes', 'sha256'})
        if store['prefix_base64'] != '' or store['complete'] is not True or type(store['entries']) is not list or len(store['entries']) > 65536:
            raise ValueError('Only complete empty-prefix storage snapshots are accepted')
        raw_keys = []; size = 0
        for entry in store['entries']:
            exact(entry, {'key', 'value'}); k, value = b64(entry['key']), b64(entry['value'])
            if not k:
                raise ValueError('Empty storage key')
            raw_keys.append(k); size += len(k) + len(value)
            reject_private_material(value)
        if raw_keys != sorted(set(raw_keys)) or type(store['bytes']) is not int or size != store['bytes'] or size > MAX_STORAGE:
            raise ValueError('Duplicate, unordered, truncated or oversized storage entries')
        if digest(canonical(store['entries'])) != store['sha256']:
            raise ValueError('Storage entry commitment mismatch')
        reject_private_material(canonical(row['state'])); total += size
    coverage = {'known_families_declared': families_for_format(charter['format']), 'selected_contracts': len(selected), 'storage_bytes': total,
                'complete_current_storage_for_declared_contracts': True, 'state_proof_verified': False,
                'rpc_trust_required': True, 'global_contract_discovery': False, 'deleted_history_included': False,
                'transactions': 0, 'model_requests': 0, 'credentials_requested': False}
    if snapshot['coverage'] != coverage or total > MAX_PUBLIC or len(canonical(snapshot)) > MAX_SNAPSHOT:
        raise ValueError('Snapshot completion/trust/size declaration is inconsistent')
    return {'snapshot_sha256': digest(canonical(snapshot)), 'company_id': charter['company_id'],
            'owner_id': charter['owner_id'], 'contracts': len(selected), 'storage_bytes': total,
            'complete_declared_current_state': True, 'rpc_trust_required': True, 'exit_format': snapshot['format'],
            'declared_families': families_for_format(charter['format']), 'historical_family_scope': snapshot['format'] == LEGACY_FORMAT,
            'current_family_declarations_complete': snapshot['format'] == FORMAT}


def _directory(path, *, create=False):
    p = Path(path).absolute()
    if p.resolve() != p:
        raise ValueError('Canonical private directory required')
    if create:
        p.mkdir(mode=0o700, parents=False)
    s = p.lstat()
    if not stat.S_ISDIR(s.st_mode) or s.st_uid != os.getuid() or s.st_mode & 0o077:
        raise ValueError('Private owner-controlled directory required')
    return p


def _relative(value, *, recovery=False):
    if type(value) is not str or '\\' in value or '\0' in value:
        raise ValueError('Normalized relative business path required')
    p = PurePosixPath(value)
    if p.is_absolute() or str(p) != value or not 1 <= len(p.parts) <= 12 or len(value) > 240:
        raise ValueError('Normalized relative business path required')
    for part in p.parts:
        lower = part.lower()
        if (part in ('.', '..') or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_. -]{0,99}', part) or
                part.endswith((' ', '.')) or lower in ('vault', 'credentials', 'secrets', 'operator.json', 'config.json', 'rpc.json', 'ledger.json', 'work.json') or
                lower.endswith(('.pem', '.key', '.vault', '.p12', '.pfx')) or
                re.search(r'(^|[_-])(wallet|operator|credentials?|secrets?|vault)([_.-]|$)', lower) or
                not recovery and 'recover' in lower):
            raise ValueError('Signing/provider/runtime credentials cannot enter an exit capsule')
    return value


def _read(root, relative, limit):
    parts = PurePosixPath(relative).parts
    fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | getattr(os, 'O_NOFOLLOW', 0), dir_fd=fd)
            os.close(fd); fd = child
        h = os.open(parts[-1], os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0), dir_fd=fd)
        try:
            before = os.fstat(h)
            if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_mode & 0o022 or before.st_nlink != 1 or before.st_size > limit):
                raise ValueError('Only bounded owner-controlled regular inputs are allowed')
            with os.fdopen(h, 'rb', closefd=False) as stream:
                raw = stream.read(limit + 1)
            after = os.fstat(h)
            if len(raw) > limit or any(getattr(before, k) != getattr(after, k) for k in ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')):
                raise ValueError('Exit input changed while reading')
            return raw
        finally:
            os.close(h)
    finally:
        os.close(fd)


def _recoveries(raw, company_id, contracts):
    value = strict(raw)
    exact(value, {'format', 'company_id', 'records'})
    if value['format'] != 'proofwork-owner-record-capsules-v1' or value['company_id'] != company_id or type(value['records']) is not list or not 1 <= len(value['records']) <= 128:
        raise ValueError('Explicit same-company owner record capsules required')
    ids = set()
    for record in value['records']:
        exact(record, {'contract_id', 'record_id', 'scope_hash', 'record_key'})
        account(record['contract_id']); hash_value(record['scope_hash'])
        if (record['contract_id'] not in contracts or type(record['record_id']) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', record['record_id']) or
                type(record['record_key']) is not str or not 12 <= len(record['record_key']) <= 256 or
                (record['contract_id'], record['record_id']) in ids):
            raise ValueError('Exact distinct record encryption keys required')
        ids.add((record['contract_id'], record['record_id']))
    return value


def _private_input(raw, kind, company_id, contracts):
    if kind == 'record_recoveries':
        _recoveries(raw, company_id, contracts)
    else:
        reject_private_material(raw)


def _aad(snapshot_sha, file_id, part, parts):
    return canonical(['near-company-exit-chunk-v1', snapshot_sha, file_id, part, parts])


def _sealed(key, raw, aad):
    nonce = secrets.token_bytes(12)
    return nonce + AESGCM(key).encrypt(nonce, raw, aad)


def _open(key, raw, aad):
    if len(raw) < 28:
        raise ValueError('Truncated private exit capsule')
    try:
        return AESGCM(key).decrypt(raw[:12], raw[12:], aad)
    except Exception as exc:
        raise ValueError('Private exit capsule authentication failed') from exc


def _write_new(path, raw):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())


def _sync(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def export_company_exit(snapshot, destination, *, password=None, private_root=None, selections=None):
    """Export exactly declared state and selected business files, never a directory sweep."""
    review = validate_snapshot(snapshot)
    if snapshot['format'] != FORMAT: raise ValueError('New exports require a v2 thirteen-family charter; v1 archives remain inspect/restore only')
    destination = Path(destination).absolute(); parent = _directory(destination.parent)
    if destination.exists() or destination.is_symlink():
        raise ValueError('Exit bundle destination must be new')
    selections = [] if selections is None else selections
    if type(selections) is not list or len(selections) > 64:
        raise ValueError('At most 64 explicitly selected private business files')
    if bool(selections) != bool(private_root is not None) or bool(selections) != bool(password is not None):
        raise ValueError('Private files require an explicit private root and owner password')
    payloads = {'snapshot.json': canonical(snapshot)}; inventory = []; seen = set(); total = 0
    key = secrets.token_bytes(32) if selections else None
    source = _directory(private_root) if selections else None
    for selection in selections:
        exact(selection, {'path', 'kind'})
        if selection['kind'] not in PRIVATE_KINDS:
            raise ValueError('Only documents, media and explicit owner record capsules may enter')
        name = _relative(selection['path'], recovery=selection['kind'] == 'record_recoveries')
        if name.casefold() in seen or any(name.casefold().startswith(x + '/') or x.startswith(name.casefold() + '/') for x in seen):
            raise ValueError('Private business paths collide')
        seen.add(name.casefold()); raw = _read(source, name, MAX_FILE)
        _private_input(raw, selection['kind'], review['company_id'], {row['account_id'] for row in snapshot['contracts']}); total += len(raw)
        if total > MAX_PRIVATE:
            raise ValueError('Private exit content exceeds 16MiB')
        file_id = secrets.token_hex(16); count = max(1, (len(raw) + CHUNK - 1) // CHUNK); parts = []
        for i in range(count):
            encrypted = _sealed(key, raw[i * CHUNK:(i + 1) * CHUNK], _aad(review['snapshot_sha256'], file_id, i, count))
            member = 'private/' + file_id + '/' + ('%04d.bin' % i); payloads[member] = encrypted
            parts.append({'member': member, 'bytes': len(encrypted), 'sha256': digest(encrypted)})
        inventory.append({'id': file_id, 'path': name, 'kind': selection['kind'], 'bytes': len(raw), 'sha256': digest(raw), 'parts': parts})
        if _read(source, name, MAX_FILE) != raw:
            raise ValueError('Selected private data changed during export')
    private = None
    if selections:
        key_envelope = encrypt(base64.b64encode(key).decode(), password)['envelope']
        encrypted_index = _sealed(key, canonical(inventory), canonical(['near-company-exit-index-v1', review['snapshot_sha256']]))
        payloads['private/index.bin'] = encrypted_index
        private = {'key_envelope': key_envelope, 'index_sha256': digest(encrypted_index), 'index_bytes': len(encrypted_index), 'files': len(inventory), 'plaintext_bytes': total,
                   'cipher': PRIVATE_CIPHER}
    manifest = {'format': BUNDLE, 'snapshot_sha256': review['snapshot_sha256'], 'company_id': review['company_id'],
                'owner_id': review['owner_id'], 'private': private, 'raw_signing_credentials_included': False,
                'old_worker_authority_restored': False, 'chain_storage_imported': False,
                'required_services': ['same pinned NEAR network', 'owner-approved new worker/operator profile for further execution']}
    payloads['manifest.json'] = canonical(manifest)
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        with os.fdopen(fd, 'wb') as stream:
            with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
                for name, raw in sorted(payloads.items()):
                    info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED; info.external_attr = 0o100600 << 16
                    archive.writestr(info, raw)
            stream.flush(); os.fsync(stream.fileno())
        if destination.stat().st_size > MAX_BUNDLE:
            raise ValueError('Exit bundle exceeds bound')
        _sync(parent)
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    return {**review, 'bundle': str(destination), 'bundle_sha256': digest(destination.read_bytes()),
            'private_business_files': len(inventory), 'private_plaintext_bytes': total,
            'credentials_included': False, 'owner_record_keys_encrypted': any(x['kind'] == 'record_recoveries' for x in inventory),
            'transactions': 0, 'model_requests': 0}


def inspect_company_exit(bundle, *, password=None, expected_sha256=None):
    bundle = Path(bundle).absolute(); root = _directory(bundle.parent)
    raw = _read(root, bundle.name, MAX_BUNDLE)
    if expected_sha256 is not None and digest(raw) != hash_value(expected_sha256):
        raise ValueError('Exit bundle differs from trusted export receipt')
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            infos = archive.infolist(); names = [i.filename for i in infos]
            if (archive.comment or not 2 <= len(infos) <= 1024 or len(names) != len(set(names)) or
                    any(i.is_dir() or i.flag_bits & 1 or i.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) or i.external_attr >> 16 != 0o100600 for i in infos) or
                    sum(i.file_size for i in infos) > MAX_SNAPSHOT + MAX_PRIVATE + 2 * 1024 * 1024 or
                    'manifest.json' not in names or 'snapshot.json' not in names):
                raise ValueError('Unexpected ZIP entry types, count, size, mode or metadata')
            payloads = {}
            for info in infos:
                if info.filename == 'manifest.json': limit = 65536
                elif info.filename == 'snapshot.json': limit = MAX_SNAPSHOT
                elif info.filename == 'private/index.bin': limit = 262144
                elif re.fullmatch(r'private/[0-9a-f]{32}/[0-9]{4}\.bin', info.filename): limit = CHUNK + 28
                else: raise ValueError('Unrecognized or traversing exit member')
                if info.file_size > limit:
                    raise ValueError('ZIP member exceeds its declared bound')
                value = archive.read(info)
                if len(value) != info.file_size:
                    raise ValueError('Truncated exit member')
                payloads[info.filename] = value
    except zipfile.BadZipFile as exc:
        raise ValueError('Invalid exit bundle') from exc
    manifest = strict(payloads['manifest.json']); exact(manifest, {'format', 'snapshot_sha256', 'company_id', 'owner_id', 'private', 'raw_signing_credentials_included', 'old_worker_authority_restored', 'chain_storage_imported', 'required_services'})
    snapshot = strict(payloads['snapshot.json']); review = validate_snapshot(snapshot)
    if (manifest['format'] != (BUNDLE if snapshot['format'] == FORMAT else LEGACY_BUNDLE) or manifest['snapshot_sha256'] != review['snapshot_sha256'] or
            manifest['company_id'] != review['company_id'] or manifest['owner_id'] != review['owner_id'] or
            any(manifest[k] is not False for k in ('raw_signing_credentials_included', 'old_worker_authority_restored', 'chain_storage_imported')) or
            manifest['required_services'] != ['same pinned NEAR network', 'owner-approved new worker/operator profile for further execution']):
        raise ValueError('Exit manifest changed its identity or authority boundary')
    private = manifest['private']; files = []; expected = {'manifest.json', 'snapshot.json'}
    if private is not None:
        exact(private, {'key_envelope', 'index_sha256', 'index_bytes', 'files', 'plaintext_bytes', 'cipher'})
        if password is None or private['cipher'] != PRIVATE_CIPHER or type(private['files']) is not int or not 1 <= private['files'] <= 64 or type(private['plaintext_bytes']) is not int or not 0 <= private['plaintext_bytes'] <= MAX_PRIVATE:
            raise ValueError('Owner password and bounded private capsule inventory required')
        index = payloads.get('private/index.bin', b'')
        if len(index) != private['index_bytes'] or digest(index) != private['index_sha256']:
            raise ValueError('Private inventory changed')
        try: key = b64(decrypt(private['key_envelope'], password))
        except Exception as exc: raise ValueError('Owner password cannot open exit capsules') from exc
        if len(key) != 32:
            raise ValueError('Invalid wrapped exit data key')
        inventory = strict(_open(key, index, canonical(['near-company-exit-index-v1', review['snapshot_sha256']])))
        if type(inventory) is not list or len(inventory) != private['files']:
            raise ValueError('Incomplete private inventory')
        expected.add('private/index.bin'); seen = set(); total = 0; ids = set()
        for item in inventory:
            exact(item, {'id', 'path', 'kind', 'bytes', 'sha256', 'parts'})
            if (item['kind'] not in PRIVATE_KINDS or type(item['id']) is not str or not re.fullmatch(r'[0-9a-f]{32}', item['id']) or item['id'] in ids or type(item['bytes']) is not int or not 0 <= item['bytes'] <= MAX_FILE):
                raise ValueError('Invalid private exit file')
            ids.add(item['id']); name = _relative(item['path'], recovery=item['kind'] == 'record_recoveries')
            if name.casefold() in seen or any(name.casefold().startswith(x + '/') or x.startswith(name.casefold() + '/') for x in seen):
                raise ValueError('Private restore paths collide')
            seen.add(name.casefold()); parts = item['parts']; count = max(1, (item['bytes'] + CHUNK - 1) // CHUNK)
            if type(parts) is not list or len(parts) != count:
                raise ValueError('Missing private chunk')
            chunks = []
            for i, part in enumerate(parts):
                exact(part, {'member', 'bytes', 'sha256'}); member = 'private/' + item['id'] + '/' + ('%04d.bin' % i)
                if part['member'] != member or member not in payloads:
                    raise ValueError('Private chunk order/path changed')
                encrypted = payloads[member]
                if len(encrypted) != part['bytes'] or digest(encrypted) != part['sha256']:
                    raise ValueError('Private chunk commitment mismatch')
                chunks.append(_open(key, encrypted, _aad(review['snapshot_sha256'], item['id'], i, count))); expected.add(member)
            content = b''.join(chunks)
            if len(content) != item['bytes'] or digest(content) != item['sha256']:
                raise ValueError('Private file missing or changed')
            _private_input(content, item['kind'], review['company_id'], {row['account_id'] for row in snapshot['contracts']}); total += len(content)
            files.append({'path': name, 'kind': item['kind'], 'raw': content, 'sha256': item['sha256']})
        if total != private['plaintext_bytes']:
            raise ValueError('Private exit byte total mismatch')
    elif password is not None:
        raise ValueError('Public-only exit does not take a password')
    if set(payloads) != expected:
        raise ValueError('Exit has unlisted or missing members')
    return {'manifest': manifest, 'snapshot': snapshot, 'review': review,
            'private_files': files, 'bundle_sha256': digest(raw)}


def restore_company_exit(bundle, destination, *, expected_sha256, password=None):
    """Validate all bytes/receipt first; activate a fresh workspace only after publication."""
    hash_value(expected_sha256)
    checked = inspect_company_exit(bundle, password=password, expected_sha256=expected_sha256)
    target = Path(destination).absolute(); parent = _directory(target.parent)
    if target.exists() or target.is_symlink():
        raise ValueError('A company exit never overwrites an existing workspace')
    stage = Path(tempfile.mkdtemp(prefix='.exit-restore-', dir=parent)); stage.chmod(0o700)
    claimed = False
    try:
        public = stage / 'public-state'; public.mkdir(mode=0o700)
        for row in checked['snapshot']['contracts']:
            _write_new(public / (row['account_id'] + '.json'), canonical(row))
        business = stage / 'business'; business.mkdir(mode=0o700)
        for item in checked['private_files']:
            p = business / item['path']; p.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            _write_new(p, item['raw'])
        _write_new(stage / 'exit-manifest.json', canonical(checked['manifest']))
        _write_new(stage / 'exit-snapshot.json', canonical(checked['snapshot']))
        reconnect = {'format': 'near-native-company-reconnect-v1', **checked['review'],
                     'network': checked['snapshot']['charter']['network'], 'chain_id': checked['snapshot']['charter']['chain_id'],
                     'genesis_hash': checked['snapshot']['charter']['genesis_hash'],
                     'source_bundle_sha256': checked['bundle_sha256'], 'active': False,
                     'same_existing_contracts': True, 'chain_storage_imported': False,
                     'old_signing_authority_restored': False, 'requires_new_worker_profile': True,
                     'requires_owner_reapproval': True, 'automatic_task_replay': False}
        _write_new(stage / 'reconnect.json', canonical(reconnect)); _sync(public); _sync(business); _sync(stage)
        # mkdir is an atomic no-overwrite claim. The reconnect marker is moved
        # LAST; interrupted publication is never an active/usable migration.
        target.mkdir(mode=0o700); claimed = True
        for name in ('public-state', 'business', 'exit-manifest.json', 'exit-snapshot.json', 'reconnect.json'):
            os.rename(stage / name, target / name)
        stage.rmdir(); _sync(target); _sync(parent)
    except BaseException:
        if stage.exists(): shutil.rmtree(stage)
        if claimed: shutil.rmtree(target)
        raise
    return {'workspace': str(target), **checked['review'], 'bundle_sha256': checked['bundle_sha256'],
            'private_business_files': len(checked['private_files']), 'active': False,
            'requires_owner_reapproval': True, 'old_signing_authority_restored': False, 'automatic_task_replay': False}


RECONNECT_METHODS = ['ai_complete_call', 'ai_reserve_call', 'company_archive', 'company_attest', 'company_tick']
RECONNECT_GRANTS = [RECONNECT_METHODS,
                    sorted(RECONNECT_METHODS + ['company_commit_plan', 'company_run_mandate']),
                    sorted(RECONNECT_METHODS + ['ai_complete_media_call', 'ai_reserve_media_call']),
                    sorted(RECONNECT_METHODS + ['company_commit_plan', 'company_run_mandate', 'ai_complete_media_call', 'ai_reserve_media_call'])]


def reconnect_challenge(charter):
    exact(charter, {'format', 'source_snapshot_sha256', 'source_bundle_sha256', 'company_id', 'owner_id', 'network', 'chain_id', 'genesis_hash', 'genesis_height', 'block', 'code_hash', 'wasm_sha256', 'previous_worker_key_id', 'previous_profile_version', 'worker_key_id', 'worker_public_key', 'profile_version', 'previous_operator_id', 'operator_id', 'operator_public_key', 'owner_admin_public_key', 'method_names', 'allowance', 'ack'})
    if charter['format'] != 'near-native-company-reapproval-v1' or charter['ack'] != 'RECONNECT_SAME_COMPANY_NEW_WORKER_NO_REPLAY':
        raise ValueError('Explicit owner same-company reapproval required')
    for name in ('source_snapshot_sha256', 'source_bundle_sha256', 'wasm_sha256', 'previous_worker_key_id', 'worker_key_id'):
        hash_value(charter[name])
    for name in ('company_id', 'owner_id', 'previous_operator_id', 'operator_id'): account(charter[name])
    for name in ('genesis_hash', 'code_hash'): _base58(charter[name])
    for name in ('operator_public_key', 'owner_admin_public_key'):
        if type(charter[name]) is not str or not charter[name].startswith('ed25519:'):
            raise ValueError('Public approval identities required')
        _base58(charter[name][8:])
    reference(charter['block'])
    if (charter['network'] not in ('sandbox', 'testnet', 'mainnet') or type(charter['chain_id']) is not str or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', charter['chain_id']) or
            type(charter['genesis_height']) is not int or charter['genesis_height'] < 0 or
            _base58(charter['code_hash']).hex() != charter['wasm_sha256'] or
            type(charter['previous_profile_version']) is not int or type(charter['profile_version']) is not int or not 1 <= charter['previous_profile_version'] < charter['profile_version'] <= 64 or
            charter['worker_key_id'] == charter['previous_worker_key_id'] or charter['operator_id'] == charter['previous_operator_id'] or charter['operator_id'] == charter['owner_id'] or charter['operator_public_key'] == charter['owner_admin_public_key'] or
            type(charter['worker_public_key']) is not str or not 400 <= len(charter['worker_public_key']) <= 2048 or not charter['worker_public_key'].startswith('-----BEGIN PUBLIC KEY-----\n') or digest(charter['worker_public_key'].encode()) != charter['worker_key_id'] or
            charter['method_names'] not in RECONNECT_GRANTS or type(charter['allowance']) is not str or not re.fullmatch(r'[1-9][0-9]{0,24}', charter['allowance']) or int(charter['allowance']) > 3 * 10**24):
        raise ValueError('Fresh bounded worker/operator authority required')
    value = digest(canonical(charter))
    return {'account_id': charter['owner_id'], 'state': value, 'nonce': base64.b64encode(bytes.fromhex(value)).decode(),
            'recipient': 'proofwork-company-reconnect-v1:' + charter['company_id'], 'callback_url': None,
            'message': 'Approve new runtime for the SAME NEAR company ' + value + '. New worker and scoped operator key only; never replay previous tasks or restore old signing credentials.'}


def activate_company_reconnect(workspace, proof, public_worker_manifest):
    """Record trusted live-RPC reapproval; existing RPCGateway still checks every write.

    This imports no key or config. The fresh worker is initialized separately and
    the owner grants/rotates scoped NEAR authority separately before verification.
    """
    root = _directory(workspace)
    snapshot = strict(_read(root, 'exit-snapshot.json', MAX_SNAPSHOT)); review = validate_snapshot(snapshot)
    if snapshot['format'] != FORMAT: raise ValueError('Fresh runtime activation requires a new v2 thirteen-family export; historical v1 scope is not upgraded automatically')
    restored = strict(_read(root, 'reconnect.json', 16384))
    exact(proof, {'format', 'charter', 'signed', 'verified_at', 'owner_permission', 'same_existing_contracts', 'previous_operator_authority_revoked', 'previous_active_tasks', 'automatic_task_replay', 'rpc_trust_required', 'transactions', 'model_requests'})
    charter = proof['charter']; c = reconnect_challenge(charter); key = verify_signature(c, proof['signed'])
    reference(proof['verified_at'])
    if (proof['format'] != 'near-native-company-reconnect-proof-v1' or key != charter['owner_admin_public_key'] or proof['owner_permission'] != 'FullAccess' or
            proof['same_existing_contracts'] is not True or proof['previous_operator_authority_revoked'] is not True or proof['previous_active_tasks'] != 0 or
            proof['automatic_task_replay'] is not False or proof['rpc_trust_required'] is not True or proof['transactions'] != 0 or proof['model_requests'] != 0 or
            proof['verified_at']['height'] < charter['block']['height'] or proof['verified_at']['height'] == charter['block']['height'] and proof['verified_at']['hash'] != charter['block']['hash'] or
            restored.get('active') is not False or restored.get('source_bundle_sha256') != charter['source_bundle_sha256'] or
            any(charter[k] != snapshot['charter'][k] for k in ('company_id', 'owner_id', 'network', 'chain_id', 'genesis_hash', 'genesis_height')) or
            charter['source_snapshot_sha256'] != review['snapshot_sha256']):
        raise ValueError('Fresh trusted-RPC proof must bind this inactive restored company')
    company = next(row for row in snapshot['contracts'] if row['family'] == 'company')
    stored = next((b64(e['value']) for e in company['storage']['entries'] if b64(e['key']) == b'company:execution-profile'), None)
    previous = strict(stored) if stored is not None else None
    if (previous is None or previous.get('profile') != 'business-operations-v1' or
            previous.get('worker_key_id') != charter['previous_worker_key_id'] or previous.get('version') != charter['previous_profile_version'] or
            charter['code_hash'] != company['code_hash'] or charter['previous_operator_id'] != company['state'].get('operator') or charter['operator_id'] == company['state'].get('operator')):
        raise ValueError('Previous worker/company lineage changed')
    exact(public_worker_manifest, {'worker_public_key', 'worker_key_id', 'profile'})
    if public_worker_manifest != {'worker_public_key': charter['worker_public_key'], 'worker_key_id': charter['worker_key_id'], 'profile': 'business-operations-v1'}:
        raise ValueError('Fresh local public worker manifest differs from signed approval')
    marker = {'format': 'near-native-company-ready-runtime-v1', **review, 'source_bundle_sha256': charter['source_bundle_sha256'],
              'same_existing_contracts': True, 'fresh_worker_reapproved': True, 'worker_key_id': charter['worker_key_id'],
              'execution_profile_version': charter['profile_version'], 'previous_operator_id': charter['previous_operator_id'], 'operator_id': charter['operator_id'],
              'operator_public_key': charter['operator_public_key'], 'method_names': charter['method_names'], 'automatic_task_replay': False,
              'old_signing_authority_restored': False, 'chain_storage_imported': False,
              'rpc_trust_required': True, 'live_authority_recheck_required_for_every_write': True, 'proof': proof}
    _write_new(root / 'reapproved-runtime.json', canonical(marker)); _sync(root)
    return {k: v for k, v in marker.items() if k != 'proof'}


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--root', required=True)
    parser.add_argument('command', choices=('export', 'inspect', 'restore', 'activate')); args = parser.parse_args()
    root = _directory(args.root); raw = __import__('sys').stdin.buffer.read(MAX_SNAPSHOT + 1024 * 1024 + 1)
    if len(raw) > MAX_SNAPSHOT + 1024 * 1024:
        raise ValueError('Exit request exceeds bound')
    request = strict(raw)
    if args.command == 'export':
        exact(request, {'snapshot', 'destination', 'password', 'selections'})
        result = export_company_exit(request['snapshot'], root / _relative(request['destination']), password=request['password'], private_root=root if request['selections'] else None, selections=request['selections'])
    elif args.command == 'restore':
        exact(request, {'bundle', 'destination', 'password', 'expected_sha256'})
        result = restore_company_exit(root / _relative(request['bundle']), root / _relative(request['destination']), password=request['password'], expected_sha256=request['expected_sha256'])
    elif args.command == 'activate':
        exact(request, {'workspace', 'proof', 'public_worker_manifest'})
        result = activate_company_reconnect(root / _relative(request['workspace']), request['proof'], request['public_worker_manifest'])
    else:
        exact(request, {'bundle', 'password'}); value = inspect_company_exit(root / _relative(request['bundle']), password=request['password'])
        result = {**value['review'], 'bundle_sha256': value['bundle_sha256'], 'private_business_files': len(value['private_files']), 'credentials_included': False}
    print(json.dumps(result, separators=(',', ':')))


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'ok': False, 'error': str(exc)}), file=__import__('sys').stderr)
        raise SystemExit(1)
