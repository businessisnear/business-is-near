"""Private content-addressed media, provenance, reuse and explicit cost records.

Local operation associations are records, not NEAR execution authorization.
No provider call, upload, inference, publication or hidden cost estimate occurs.
"""
import argparse
from contextlib import contextmanager
from decimal import Decimal, localcontext
import fcntl
import json
import os
from pathlib import Path
import re
import stat
import tempfile

from executor.portability import (canonical, digest, directory, read_regular, reject_private_material,
                                  export_company, strict_json, MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_FILES)

FORMAT = 'proofwork-media-library-v1'
_HASH = re.compile(r'^[0-9a-f]{64}$')
_ID = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$')
_MIMES = {'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/wav',
          'audio/mp4', 'video/mp4', 'application/pdf'}


def _identifier(value):
    if not isinstance(value, str) or not _ID.fullmatch(value) or value in ('constructor', 'prototype', '__proto__'):
        raise ValueError('Invalid media/import/operation identifier')
    return value


def _hash(value):
    if not isinstance(value, str) or not _HASH.fullmatch(value):
        raise ValueError('Expected lowercase SHA-256')
    return value


def _mime(raw, mime):
    if mime not in _MIMES or not raw:
        raise ValueError('Unsupported media type')
    valid = {'image/png': raw.startswith(b'\x89PNG\r\n\x1a\n'),
             'image/jpeg': raw.startswith(b'\xff\xd8\xff'),
             'image/webp': raw[:4] == b'RIFF' and raw[8:12] == b'WEBP',
             'image/gif': raw.startswith((b'GIF87a', b'GIF89a')),
             'audio/mpeg': raw.startswith(b'ID3') or len(raw) > 1 and raw[0] == 255 and raw[1] & 224 == 224,
             'audio/wav': raw[:4] == b'RIFF' and raw[8:12] == b'WAVE',
             'audio/mp4': raw[4:8] == b'ftyp', 'video/mp4': raw[4:8] == b'ftyp',
             'application/pdf': raw.startswith(b'%PDF-')}
    if not valid[mime]:
        raise ValueError('Media bytes do not match the declared container type')


def _provenance(value):
    allowed = {'origin', 'source', 'provider', 'model', 'license', 'created_at'}
    if (not isinstance(value, dict) or not {'origin', 'source'} <= set(value) or not set(value) <= allowed or
            value['origin'] not in ('owner_upload', 'generated_local', 'generated_provider')):
        raise ValueError('Explicit bounded media provenance required')
    for key, item in value.items():
        if not isinstance(item, str) or not item.strip() or len(item) > 240 or any(ord(c) < 32 for c in item):
            raise ValueError('Invalid media provenance text')
    reject_private_material(canonical(value))
    return value


def _cost(value):
    if value == {'status': 'unknown'}:
        return value
    if (not isinstance(value, dict) or set(value) != {'status', 'currency', 'amount', 'evidence_sha256'} or
            value['status'] != 'known' or value['currency'] not in ('USD', 'NEAR') or
            not isinstance(value['amount'], str) or not re.fullmatch(r'(?:0|[1-9][0-9]{0,17})(?:\.[0-9]{1,24})?', value['amount'])):
        raise ValueError('Cost must be explicitly unknown or an exact reported amount with evidence hash')
    _hash(value['evidence_sha256'])
    return value


class MediaLibrary:
    def __init__(self, root):
        self.root = directory(root, private=True, create=True)
        self.assets = directory(self.root / 'assets', private=True, create=True)
        self.catalog = self.root / 'catalog.json'
        with self._lock():
            if not os.path.lexists(self.catalog):
                if any(self.assets.iterdir()):
                    raise ValueError('Media assets exist without their catalog; preserve them for recovery')
                self._save({'format': FORMAT, 'version': 1, 'assets': {}, 'imports': {}, 'uses': {}})
            self._load()

    @contextmanager
    def _lock(self):
        fd = os.open(self.root / '.media.lock', os.O_RDWR | os.O_CREAT | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        try:
            info = os.fstat(fd)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_nlink != 1:
                raise ValueError('Unsafe media lock')
            fcntl.flock(fd, fcntl.LOCK_EX)
            yield
        finally:
            os.close(fd)

    def _load(self):
        raw, _ = read_regular(self.root, 'catalog.json', limit=4 * 1024 * 1024)
        if self.catalog.stat().st_mode & 0o077:
            raise ValueError('Media catalog must remain private')
        value = strict_json(raw)
        if (not isinstance(value, dict) or set(value) != {'format', 'version', 'assets', 'imports', 'uses'} or
                value['format'] != FORMAT or type(value['version']) is not int or value['version'] != 1):
            raise ValueError('Invalid media catalog')
        for key in ('assets', 'imports', 'uses'):
            if not isinstance(value[key], dict) or len(value[key]) > 4096:
                raise ValueError('Media catalog capacity exceeded')
        for asset_id, record in value['assets'].items():
            _hash(asset_id)
            if not isinstance(record, dict) or set(record) != {'mime_type', 'bytes'} or record['mime_type'] not in _MIMES or type(record['bytes']) is not int or not 1 <= record['bytes'] <= MAX_FILE_BYTES:
                raise ValueError('Invalid media asset record')
        if len(value['assets']) >= MAX_FILES or sum(record['bytes'] for record in value['assets'].values()) > MAX_TOTAL_BYTES - 4 * 1024 * 1024:
            raise ValueError('Media library exceeds portable storage capacity')
        for import_id, record in value['imports'].items():
            _identifier(import_id)
            if not isinstance(record, dict) or set(record) != {'asset_id', 'provenance', 'cost'} or record['asset_id'] not in value['assets']:
                raise ValueError('Invalid media import receipt')
            _provenance(record['provenance']); _cost(record['cost'])
        for key, record in value['uses'].items():
            if not isinstance(record, dict) or set(record) != {'operation_id', 'scope_hash', 'role', 'import_id', 'asset_id'}:
                raise ValueError('Invalid media association')
            _identifier(record['operation_id']); _identifier(record['role']); _hash(record['scope_hash'])
            if key != record['operation_id'] + ':' + record['role'] or record['import_id'] not in value['imports'] or value['imports'][record['import_id']]['asset_id'] != record['asset_id']:
                raise ValueError('Media association identity mismatch')
        return value

    def _save(self, value):
        raw = canonical(value)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError('Media catalog byte capacity exceeded')
        fd, name = tempfile.mkstemp(prefix='.media-', dir=self.root)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(raw); stream.flush(); os.fsync(stream.fileno())
            os.replace(name, self.catalog)
            directory_fd = os.open(self.root, os.O_RDONLY)
            try: os.fsync(directory_fd)
            finally: os.close(directory_fd)
        finally:
            if os.path.exists(name): os.unlink(name)

    def _blob(self, asset_id, expected=None):
        _hash(asset_id)
        raw, _ = read_regular(self.assets, asset_id + '.blob')
        if (self.assets / (asset_id + '.blob')).stat().st_mode & 0o077:
            raise ValueError('Media blob must remain private')
        if digest(raw) != asset_id or expected is not None and raw != expected:
            raise ValueError('Media blob integrity mismatch')
        return raw

    def import_file(self, source, *, import_id, mime_type, provenance, cost):
        _identifier(import_id); _provenance(provenance); _cost(cost)
        source = Path(source).absolute()
        raw, _ = read_regular(source.parent, source.name)
        reject_private_material(raw); _mime(raw, mime_type)
        asset_id = digest(raw)
        receipt = {'asset_id': asset_id, 'provenance': provenance, 'cost': cost}
        asset = {'mime_type': mime_type, 'bytes': len(raw)}
        with self._lock():
            data = self._load()
            old = data['imports'].get(import_id)
            if old is not None:
                if old != receipt or data['assets'][asset_id] != asset:
                    raise ValueError('Import ID already belongs to a different receipt')
                self._blob(asset_id, raw)
                return {'import_id': import_id, 'asset_id': asset_id, **asset, 'duplicate': True}
            if (len(data['imports']) >= 4096 or asset_id not in data['assets'] and
                    (len(data['assets']) >= MAX_FILES - 1 or sum(record['bytes'] for record in data['assets'].values()) + len(raw) > MAX_TOTAL_BYTES - 4 * 1024 * 1024)):
                raise ValueError('Media library capacity exhausted')
            if asset_id in data['assets'] and data['assets'][asset_id] != asset:
                raise ValueError('Media asset metadata conflict')
            target = self.assets / (asset_id + '.blob')
            if target.exists():
                self._blob(asset_id, raw)
            else:
                fd, temporary = tempfile.mkstemp(prefix='.asset-', dir=self.assets)
                try:
                    with os.fdopen(fd, 'wb') as stream:
                        stream.write(raw); stream.flush(); os.fsync(stream.fileno())
                    try: os.link(temporary, target)
                    except FileExistsError: pass
                finally:
                    os.unlink(temporary)
                self._blob(asset_id, raw)
                directory_fd = os.open(self.assets, os.O_RDONLY)
                try: os.fsync(directory_fd)
                finally: os.close(directory_fd)
            data['assets'][asset_id] = asset; data['imports'][import_id] = receipt
            self._save(data)
            return {'import_id': import_id, 'asset_id': asset_id, **asset, 'duplicate': False}

    def read_asset(self, asset_id):
        with self._lock():
            data = self._load()
            record = data['assets'].get(_hash(asset_id))
            if record is None:
                raise ValueError('Unknown media asset')
            raw = self._blob(asset_id)
            if len(raw) != record['bytes']:
                raise ValueError('Media asset byte count changed')
            _mime(raw, record['mime_type'])
            return raw, {'asset_id': asset_id, **record}

    def reuse(self, asset_id, operation_id, *, scope_hash, role, import_id):
        _hash(asset_id); _identifier(operation_id); _hash(scope_hash); _identifier(role); _identifier(import_id)
        with self._lock():
            data = self._load()
            if import_id not in data['imports'] or data['imports'][import_id]['asset_id'] != asset_id:
                raise ValueError('Exact existing import receipt required')
            self._blob(asset_id)
            key = operation_id + ':' + role
            record = {'operation_id': operation_id, 'scope_hash': scope_hash, 'role': role,
                      'import_id': import_id, 'asset_id': asset_id}
            if key in data['uses']:
                if data['uses'][key] != record:
                    raise ValueError('Operation media role is already bound differently')
                return {**record, 'duplicate': True, 'authorization': 'local association; verify NEAR owner approval separately'}
            if len(data['uses']) >= 4096:
                raise ValueError('Media association capacity exhausted')
            data['uses'][key] = record; self._save(data)
            return {**record, 'duplicate': False, 'authorization': 'local association; verify NEAR owner approval separately'}

    def inventory(self):
        with self._lock():
            data = self._load()
            for asset in data['assets']:
                self._blob(asset)
            totals, unknown = {}, 0
            with localcontext() as context:
                context.prec = 80
                for record in data['imports'].values():
                    cost = record['cost']
                    if cost['status'] == 'unknown': unknown += 1
                    else: totals[cost['currency']] = totals.get(cost['currency'], Decimal(0)) + Decimal(cost['amount'])
            return {**data, 'cost_summary': {'reported_known_amounts': {key: format(value, 'f') for key, value in totals.items()},
                                             'unknown_imports': unknown, 'invoice_verification': 'owner-supplied evidence hashes; not independently reconciled'}}

    def export_selections(self, prefix=''):
        from executor.portability import safe_relative
        prefix = safe_relative(prefix) + '/' if prefix else ''
        data = self.inventory()
        return [{'path': prefix + 'catalog.json', 'kind': 'media'},
                *[{'path': prefix + 'assets/' + asset + '.blob', 'kind': 'media'} for asset in sorted(data['assets'])]]

    @contextmanager
    def export_snapshot(self, prefix=''):
        """Retain the media write lock while a whole-company export reads it."""
        from executor.portability import safe_relative
        prefix = safe_relative(prefix) + '/' if prefix else ''
        with self._lock():
            data = self._load()
            for asset in data['assets']:
                self._blob(asset)
            yield [{'path': prefix + 'catalog.json', 'kind': 'media'},
                   *[{'path': prefix + 'assets/' + asset + '.blob', 'kind': 'media'} for asset in sorted(data['assets'])]]

    def export(self, destination, company_id):
        with self.export_snapshot() as selections:
            return export_company(self.root, destination, company_id, selections,
                                  metadata={'media_library_format': FORMAT})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', required=True)
    sub = parser.add_subparsers(dest='action', required=True)
    add = sub.add_parser('import'); add.add_argument('--file', required=True); add.add_argument('--import-id', required=True)
    add.add_argument('--mime-type', required=True); add.add_argument('--provenance-file', required=True); add.add_argument('--cost-file', required=True)
    reuse = sub.add_parser('reuse'); reuse.add_argument('--asset-id', required=True); reuse.add_argument('--operation-id', required=True)
    reuse.add_argument('--scope-hash', required=True); reuse.add_argument('--role', required=True); reuse.add_argument('--import-id', required=True)
    sub.add_parser('list')
    export = sub.add_parser('export'); export.add_argument('--output', required=True); export.add_argument('--company-id', required=True)
    args = parser.parse_args(); library = MediaLibrary(args.library)
    if args.action == 'import':
        result = library.import_file(args.file, import_id=args.import_id, mime_type=args.mime_type,
                                     provenance=json.loads(Path(args.provenance_file).read_text()), cost=json.loads(Path(args.cost_file).read_text()))
    elif args.action == 'reuse':
        result = library.reuse(args.asset_id, args.operation_id, scope_hash=args.scope_hash, role=args.role, import_id=args.import_id)
    elif args.action == 'export': result = library.export(args.output, args.company_id)
    else: result = library.inventory()
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
