"""Explicit, private company export/restore. No credentials or automatic execution.

Hashes establish bundle integrity, not a signature or proof of external ownership.
Only explicitly selected business files are copied; runtime/key directories are
never swept. Restore validates everything before creating a fresh destination.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tempfile
import zipfile

FORMAT = 'proofwork-company-export-v1'
MAX_FILES = 2048
MAX_FILE_BYTES = 32 * 1024 * 1024
MAX_TOTAL_BYTES = 256 * 1024 * 1024
KINDS = {'code', 'data', 'history', 'conversation', 'evidence', 'media'}
_HASH = re.compile(r'^[0-9a-f]{64}$')
_DENIED = {'.git', '.ssh', '.aws', '.near', '.config', 'node_modules', '__pycache__',
           'venv', 'vault', 'credentials', 'secrets', 'recovery', 'config.json', 'operator.json',
           'ledger.json', 'rpc.json', 'repositories.json', 'work.json'}
_SECRET_KEYS = {'secret_key', 'private_key', 'api_key', 'access_token', 'refresh_token', 'id_token',
                'password', 'passwd', 'client_secret', 'authorization', 'record_key', 'mnemonic',
                'seed_phrase', 'vault_password', 'operator_key', 'wallet_key', 'credentials'}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def strict_json(raw):
    def unique(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError('Duplicate JSON fields are not portable')
            value[key] = item
        return value
    return json.loads(raw, object_pairs_hook=unique)


def safe_relative(value):
    if not isinstance(value, str) or not 1 <= len(value) <= 240 or '\\' in value or '\x00' in value:
        raise ValueError('Invalid portable file path')
    path = PurePosixPath(value)
    if path.is_absolute() or path.as_posix() != value or len(path.parts) > 24:
        raise ValueError('Portable paths must be normalized relative paths')
    # Only these reviewed public source files may contain a wallet name. This
    # never permits a wallet directory or key; content screening still applies.
    public_wallet_sources = ('web-chain/src/wallet-sdk.js', 'web-chain/src/wallet.js',
                             'web-chain/src/native-growth-wallet.js',
                             'web-chain/wallet-auth-callback.html', 'web-chain/src/wallet-auth-callback.js',
                             'web-chain/dist/wallet-auth-callback.html',
                             'executor/wallet_auth.py')
    public_wallet_source = (value in public_wallet_sources or value in tuple('source/' + name for name in public_wallet_sources) or
                            re.fullmatch(r'(?:source/)?web-chain/dist/assets/native-growth-wallet-[A-Za-z0-9_-]{8}\.(?:js|css)', value) is not None)
    for part in path.parts:
        lower = part.lower()
        if (part in ('', '.', '..') or lower in _DENIED or
                part.startswith('.') and part not in ('.gitignore', '.dockerignore') or
                not re.fullmatch(r'[A-Za-z0-9_.-][A-Za-z0-9_. -]{0,99}', part) or part.endswith((' ', '.')) or
                lower.endswith(('.pem', '.key', '.vault', '.p12', '.pfx', '.jks')) or
                re.search(r'(^|[_-])(wallet|credentials?|secrets?|recovery|vault|operator)([_.-]|$)', lower) and not (public_wallet_source and part == path.name)):
            raise ValueError('Credential/runtime paths cannot enter a company export')
    return value


def reject_private_material(raw):
    if (re.search(rb'-----BEGIN (?:(?:RSA|EC|ENCRYPTED) )?PRIVATE KEY-----\r?\n[A-Za-z0-9+/=]{16,}', raw) or
            re.search(rb'ed25519:[1-9A-HJ-NP-Za-km-z]{80,}', raw) or
            re.search(rb'(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}', raw) or
            re.search(rb'''(?i)[\x22\x27]?(?:[A-Za-z0-9_]*_)?(?:api_key|secret_key|private_key|access_token|refresh_token|client_secret|password|seed_phrase|mnemonic|wallet_key|operator_key|record_key)[\x22\x27]?\s*[:=]\s*[\x22\x27][^\x22\x27\r\n]{12,}[\x22\x27]''', raw) or
            re.search(rb'(?im)^\s*(?:export\s+)?[A-Z][A-Z0-9_]*(?:API_KEY|SECRET|TOKEN|PASSWORD)\s*=\s*[\x22\x27]?[A-Za-z0-9_+=./-]{16,}', raw) or
            re.search(rb'(?i)\b(?:postgres(?:ql)?|mysql|mongodb|redis|amqps?)://[^/\s:@]+:[^@\s]+@', raw)):
        raise ValueError('Private key, token or credential material cannot be exported')
    try:
        value = strict_json(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return
    def inspect(item, depth=0):
        if depth > 24:
            raise ValueError('Structured export data exceeds nesting bound')
        if isinstance(item, dict):
            for key, value in item.items():
                name = str(key).lower().replace('-', '_')
                sensitive = name in _SECRET_KEYS or name.endswith(('_api_key', '_access_token', '_refresh_token', '_client_secret', '_password'))
                if sensitive and value not in (None, '', {}, []):
                    raise ValueError('Structured credential/recovery material cannot be exported')
                inspect(value, depth + 1)
        elif isinstance(item, list):
            for value in item:
                inspect(value, depth + 1)
    inspect(value)


def directory(path, *, private=False, create=False):
    path = Path(path).absolute()
    if create:
        path.mkdir(mode=0o700, parents=False, exist_ok=True)
    info = path.lstat()
    if (not stat.S_ISDIR(info.st_mode) or info.st_uid != os.getuid() or
            info.st_mode & (0o077 if private else 0o022)):
        raise ValueError('Directory must be owner-controlled' + (' and private' if private else ''))
    return path


def read_regular(root, relative, *, limit=MAX_FILE_BYTES):
    """Open every path component relative to a retained directory descriptor."""
    relative = safe_relative(relative)
    fd = os.open(directory(root), os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0) | getattr(os, 'O_NOFOLLOW', 0))
    try:
        parts = PurePosixPath(relative).parts
        for part in parts[:-1]:
            child = os.open(part, os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0) | getattr(os, 'O_NOFOLLOW', 0), dir_fd=fd)
            os.close(fd); fd = child
        file_fd = os.open(parts[-1], os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0), dir_fd=fd)
        try:
            before = os.fstat(file_fd)
            if not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or before.st_nlink != 1 or before.st_size > limit or before.st_mode & 0o022:
                raise ValueError('Only bounded owner-owned regular files without hard links are portable')
            with os.fdopen(file_fd, 'rb', closefd=False) as stream:
                raw = stream.read(limit + 1)
            after = os.fstat(file_fd)
            fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
            if len(raw) > limit or any(getattr(before, field) != getattr(after, field) for field in fields):
                raise ValueError('Selected file changed while reading')
            return raw, bool(before.st_mode & 0o100)
        finally:
            os.close(file_fd)
    finally:
        os.close(fd)


def write_private(path, raw):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'wb') as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())


def _paths(records):
    if not isinstance(records, list) or not 1 <= len(records) <= MAX_FILES:
        raise ValueError('An explicit bounded file selection is required')
    names = []
    for record in records:
        if not isinstance(record, dict) or not {'path', 'kind'} <= set(record) or record['kind'] not in KINDS:
            raise ValueError('Every selected file needs a path and business-data kind')
        names.append(safe_relative(record['path']))
    folded = [name.casefold() for name in names]
    known = set(folded)
    if len(known) != len(folded) or any(parent in known for name in folded for parent in [str(p) for p in PurePosixPath(name).parents if str(p) != '.']):
        raise ValueError('Duplicate, case-colliding or file/directory-colliding paths')
    return names


def _metadata(company_id, metadata, required_services):
    if not isinstance(company_id, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,63}', company_id):
        raise ValueError('A bounded public company ID is required')
    if not isinstance(metadata, dict) or len(canonical(metadata)) > 16384:
        raise ValueError('Bounded company metadata required')
    if not isinstance(required_services, list) or len(required_services) > 32 or any(not isinstance(s, str) or not 1 <= len(s) <= 120 for s in required_services):
        raise ValueError('Explicit remaining service dependencies required')
    reject_private_material(canonical(metadata)); reject_private_material(canonical(required_services))


def export_company(source_root, destination, company_id, selections, *, metadata=None, required_services=None):
    source_root = directory(source_root)
    destination = Path(destination).absolute(); directory(destination.parent, private=True)
    metadata = {} if metadata is None else metadata
    required_services = [] if required_services is None else required_services
    _metadata(company_id, metadata, required_services)
    _paths(selections)
    if any(set(item) != {'path', 'kind'} for item in selections):
        raise ValueError('Unexpected file selection fields')
    records, payloads, total = [], {}, 0
    for item in sorted(selections, key=lambda entry: entry['path']):
        raw, executable = read_regular(source_root, item['path'])
        reject_private_material(raw); total += len(raw)
        if total > MAX_TOTAL_BYTES:
            raise ValueError('Company export exceeds total byte bound')
        records.append({**item, 'sha256': digest(raw), 'bytes': len(raw), 'executable': executable})
        payloads[item['path']] = raw
    manifest = {'format': FORMAT, 'version': 1, 'company_id': company_id, 'metadata': metadata,
                'required_services': required_services, 'files': records,
                'credentials_included': False, 'external_services_restored': False}
    raw_manifest = canonical(manifest)
    if len(raw_manifest) > 1024 * 1024:
        raise ValueError('Company manifest exceeds bound')
    # Snapshot identity is rechecked before publication. A concurrent edit fails
    # rather than silently exporting a mixture of newly changed inputs.
    for path, expected in payloads.items():
        if read_regular(source_root, path)[0] != expected:
            raise ValueError('Company source changed during export')
    fd = os.open(destination, os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    try:
        with os.fdopen(fd, 'w+b') as stream:
            with zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
                for name, raw in [('manifest.json', raw_manifest), *[('files/' + path, raw) for path, raw in sorted(payloads.items())]]:
                    info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = 0o100600 << 16
                    archive.writestr(info, raw)
            stream.flush(); os.fsync(stream.fileno())
    except BaseException:
        # This path was created exclusively by this call; failed archives are
        # not kept as apparently usable exports.
        destination.unlink(missing_ok=True)
        raise
    parent_fd = os.open(destination.parent, os.O_RDONLY)
    try: os.fsync(parent_fd)
    finally: os.close(parent_fd)
    return {'path': str(destination), 'sha256': digest(destination.read_bytes()), 'files': len(records),
            'content_bytes': total, 'credentials_included': False, 'required_services': required_services}


def inspect_bundle(bundle):
    bundle = Path(bundle).absolute()
    raw, _ = read_regular(bundle.parent, bundle.name, limit=MAX_TOTAL_BYTES + 8 * 1024 * 1024)
    import io
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            infos = archive.infolist()
            if archive.comment or not 2 <= len(infos) <= MAX_FILES + 1:
                raise ValueError('Unexpected bundle metadata/count')
            names = [info.filename for info in infos]
            if len(set(names)) != len(names) or names.count('manifest.json') != 1:
                raise ValueError('Duplicate or absent bundle manifest')
            for info in infos:
                mode = info.external_attr >> 16
                if (info.flag_bits & 1 or info.comment or info.extra or info.is_dir() or
                        stat.S_IFMT(mode) not in (0, stat.S_IFREG) or
                        info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) or
                        info.file_size > (1024 * 1024 if info.filename == 'manifest.json' else MAX_FILE_BYTES)):
                    raise ValueError('Unsupported archive member')
            if sum(info.file_size for info in infos) > MAX_TOTAL_BYTES + 1024 * 1024:
                raise ValueError('Expanded company bundle exceeds bound')
            manifest = strict_json(archive.read('manifest.json'))
            if (not isinstance(manifest, dict) or set(manifest) != {'format', 'version', 'company_id', 'metadata', 'required_services', 'files', 'credentials_included', 'external_services_restored'} or
                    manifest['format'] != FORMAT or type(manifest['version']) is not int or manifest['version'] != 1 or manifest['credentials_included'] is not False or manifest['external_services_restored'] is not False):
                raise ValueError('Unsupported company bundle')
            _metadata(manifest['company_id'], manifest['metadata'], manifest['required_services'])
            paths = _paths(manifest['files'])
            if set(names) != {'manifest.json', *('files/' + path for path in paths)}:
                raise ValueError('Unlisted or missing bundle payload')
            payloads = {}
            for record in manifest['files']:
                if (set(record) != {'path', 'kind', 'sha256', 'bytes', 'executable'} or not isinstance(record['sha256'], str) or
                        not _HASH.fullmatch(record['sha256']) or type(record['bytes']) is not int or not 0 <= record['bytes'] <= MAX_FILE_BYTES or
                        type(record['executable']) is not bool):
                    raise ValueError('Invalid portable file record')
                body = archive.read('files/' + record['path'])
                if len(body) != record['bytes'] or digest(body) != record['sha256']:
                    raise ValueError('Company payload integrity mismatch')
                reject_private_material(body); payloads[record['path']] = body
    except (zipfile.BadZipFile, KeyError, UnicodeDecodeError, TypeError) as exc:
        raise ValueError('Invalid company bundle') from exc
    return manifest, payloads, digest(raw)


def restore_company(bundle, destination):
    manifest, payloads, bundle_hash = inspect_bundle(bundle)
    destination = Path(destination).absolute(); directory(destination.parent, private=True)
    destination.mkdir(mode=0o700, exist_ok=False)
    marker = destination / '.proofwork-restore.json'
    # No external service, key import, install command or app execution occurs.
    # An I/O interruption leaves a private incomplete destination for inspection.
    write_private(marker, canonical({'status': 'incomplete', 'bundle_sha256': bundle_hash}))
    for record in manifest['files']:
        target = destination / record['path']
        for parent in reversed(target.parent.relative_to(destination).parents):
            if str(parent) != '.':
                (destination / parent).mkdir(mode=0o700, exist_ok=True)
        target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        write_private(target, payloads[record['path']])
        if record['executable']:
            target.chmod(0o700)
    for record in manifest['files']:
        if digest(read_regular(destination, record['path'])[0]) != record['sha256']:
            raise ValueError('Restored company file failed verification')
    parents = {destination, *(destination / Path(record['path']).parent for record in manifest['files'])}
    for parent in parents:
        directory_fd = os.open(parent, os.O_RDONLY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)
    result = {'status': 'complete', 'company_id': manifest['company_id'], 'bundle_sha256': bundle_hash,
              'files': len(manifest['files']), 'credentials_restored': False, 'external_services_restored': False,
              'required_services': manifest['required_services']}
    temporary = destination / '.proofwork-restore-complete.json'
    write_private(temporary, canonical(result)); os.replace(temporary, marker)
    directory_fd = os.open(destination, os.O_RDONLY)
    try: os.fsync(directory_fd)
    finally: os.close(directory_fd)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    export = sub.add_parser('export'); export.add_argument('--root', required=True); export.add_argument('--output', required=True)
    export.add_argument('--company-id', required=True); export.add_argument('--selection-file', required=True)
    export.add_argument('--metadata-file'); export.add_argument('--required-services-file')
    restore = sub.add_parser('restore'); restore.add_argument('--bundle', required=True); restore.add_argument('--destination', required=True)
    inspect = sub.add_parser('inspect'); inspect.add_argument('--bundle', required=True)
    args = parser.parse_args()
    if args.action == 'export':
        result = export_company(args.root, args.output, args.company_id, json.loads(Path(args.selection_file).read_text()),
                                metadata=json.loads(Path(args.metadata_file).read_text()) if args.metadata_file else None,
                                required_services=json.loads(Path(args.required_services_file).read_text()) if args.required_services_file else None)
    elif args.action == 'restore':
        result = restore_company(args.bundle, args.destination)
    else:
        result = inspect_bundle(args.bundle)[0]
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
