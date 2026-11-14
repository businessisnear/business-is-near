"""Bounded local static-candidate monitoring; never repairs or calls a model.

Only an owner-pinned existing static-web repository policy is accepted. The
existing isolated Chrome runner observes committed bytes. Every attempt reserves
one of 64 immutable history slots before observation; a crash stays pending.
"""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import time

from executor import web_engineering as web
from executor.engineering import canonical, git

PROFILE = 'near-native-local-monitor-v1'
LIMIT = 64
ID = re.compile(r'[a-z][a-z0-9_-]{0,31}')
SHA = re.compile(r'[0-9a-f]{64}')
FINDINGS = {
    'brand_style': 'approved_brand_style_changed',
    'reference_png': 'approved_visual_reference_changed',
    'no_horizontal_overflow': 'layout_exceeds_viewport',
    'visible': 'approved_element_not_visible',
    'text': 'approved_text_expectation_failed',
    'box': 'approved_element_geometry_failed',
    'count': 'approved_element_count_failed',
    'click': 'approved_interaction_failed',
    'fill': 'approved_input_failed',
    'no_unapproved_requests': 'external_request_observed',
    'no_unhandled_page_errors_or_dialogs': 'browser_console_or_dialog_failure',
}


def digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def private_directory(value, create=False):
    root = Path(value)
    if not root.is_absolute() or root.resolve() != root:
        raise ValueError('Canonical absolute monitor directory required')
    if create:
        root.mkdir(mode=0o700, exist_ok=True)
    info = root.lstat()
    if not stat.S_ISDIR(info.st_mode) or root.is_symlink() or info.st_uid != os.getuid() or info.st_mode & 0o077:
        raise ValueError('Private owner monitor directory required')
    return root


def read_json(file):
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077 or info.st_size > 65536:
            raise ValueError('Protected bounded monitor file required')
        raw = os.read(fd, info.st_size + 1)
        if len(raw) != info.st_size:
            raise ValueError('Monitor file changed during read')
        return json.loads(raw)
    finally:
        os.close(fd)


def write_json(file, value, exclusive=False):
    raw = (canonical(value) + '\n').encode()
    if len(raw) > 65536:
        raise ValueError('Monitor record exceeds bound')
    private_directory(file.parent)
    if exclusive:
        fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        temporary = None
    else:
        fd, name = tempfile.mkstemp(prefix='.monitor-', dir=file.parent)
        temporary = Path(name)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        if temporary:
            os.replace(temporary, file)
        directory = os.open(file.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def findings(result):
    values = []
    for check in result['checks']:
        if check['passed']:
            continue
        kind = check.get('kind')
        viewport = check.get('viewport')
        if kind not in FINDINGS or not isinstance(viewport, dict) or set(viewport) != {'width', 'height'} or any(type(viewport[k]) is not int or not 320 <= viewport[k] <= 1440 for k in viewport):
            raise ValueError('Unsupported bounded browser finding')
        # No source, selectors, app text, exception bodies or filesystem paths.
        values.append({'code': FINDINGS[kind], 'kind': kind, 'viewport': viewport})
    if len(values) > 54:
        raise ValueError('Too many monitor findings')
    return values


def observe(*, registry, reference, journal_directory, monitor_id):
    if not isinstance(monitor_id, str) or not ID.fullmatch(monitor_id):
        raise ValueError('Bounded monitor ID required')
    if not isinstance(reference, dict) or set(reference) != {'repository_id', 'policy_hash'} or not ID.fullmatch(reference.get('repository_id', '')) or not SHA.fullmatch(reference.get('policy_hash', '')):
        raise ValueError('Exact owner repository reference required')
    registry = Path(registry)
    if not registry.is_absolute() or registry.resolve() != registry:
        raise ValueError('Canonical owner registry path required')
    private_directory(registry.parent)
    policy, repository = web.load_policy(registry, reference)
    root = private_directory(journal_directory, create=True)
    identity = digest(canonical({'monitor_id': monitor_id, 'registry': str(registry), 'reference': reference}))
    lease = os.open(root / 'lease', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(lease)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or info.st_uid != os.getuid() or info.st_mode & 0o077:
            raise ValueError('Unsafe monitor lease')
        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
        index_file = root / 'index.json'
        try:
            index = read_json(index_file)
        except FileNotFoundError:
            index = {'schema': 1, 'identity': identity, 'monitor_id': monitor_id, 'reports': [], 'pending': None}
        if set(index) != {'schema', 'identity', 'monitor_id', 'reports', 'pending'} or index['schema'] != 1 or index['identity'] != identity or index['monitor_id'] != monitor_id or index['pending'] is not None or not isinstance(index['reports'], list) or len(index['reports']) >= LIMIT:
            raise ValueError('Monitor scope changed, pending observation or lifetime cap')
        previous = None
        for number, commitment in enumerate(index['reports'], 1):
            report = read_json(root / ('observation-%02d.json' % number))
            unsigned = {k: v for k, v in report.items() if k != 'report_sha256'}
            if report.get('report_sha256') != commitment or digest(canonical(unsigned)) != commitment or report.get('previous_report_sha256') != previous or report.get('observation') != number:
                raise ValueError('Monitor history integrity changed')
            previous = commitment
        number = len(index['reports']) + 1
        revision = git(repository, 'rev-parse', 'HEAD').decode().strip()
        if git(repository, 'status', '--porcelain', '--untracked-files=all'):
            raise ValueError('Monitor requires a clean committed static candidate')
        started = datetime.datetime.now(datetime.timezone.utc).isoformat()
        write_json(root / ('intent-%02d.json' % number), {'schema': 1, 'identity': identity, 'monitor_id': monitor_id, 'observation': number, 'revision': revision, 'policy_hash': reference['policy_hash'], 'maximum_observations': 1, 'started_at': started}, exclusive=True)
        index = {**index, 'pending': number}
        write_json(index_file, index)
        result = None
        source_sha = None
        error_kind = None
        try:
            with tempfile.TemporaryDirectory(prefix='proofwork-monitor-source-') as raw:
                directory = Path(raw).resolve()
                files = web.snapshot(repository, revision, policy, directory)
                source_sha = digest(canonical({name: hashlib.sha256(value).hexdigest() for name, value in files.items()}))
                result = web.browser_tests(directory, policy, root / ('evidence-%02d' % number), 'observe')
                if git(repository, 'rev-parse', 'HEAD').decode().strip() != revision or git(repository, 'status', '--porcelain', '--untracked-files=all'):
                    raise ValueError('Committed candidate changed during observation')
                if result.get('schema') != 1 or type(result.get('tests')) is not int or not 1 <= result['tests'] <= 54 or type(result.get('passed')) is not bool or not isinstance(result.get('checks'), list) or len(result['checks']) != result['tests'] or any(type(row.get('passed')) is not bool for row in result['checks']):
                    raise ValueError('Incomplete isolated browser evidence')
                diagnoses = findings(result)
                if result['passed'] != (len(diagnoses) == 0):
                    raise ValueError('Inconsistent monitor acceptance')
        except Exception as error:
            error_kind = type(error).__name__ if type(error).__name__ in {'ValueError', 'OSError', 'TimeoutError', 'PermissionError', 'FileNotFoundError'} else 'ObservationError'
        content = {'profile': PROFILE, 'monitor_id': monitor_id, 'observation': number, 'repository_id': reference['repository_id'], 'policy_hash': reference['policy_hash'], 'revision': revision, 'acceptance_sha256': policy['acceptance_sha256'], 'source_manifest_sha256': source_sha, 'status': 'unknown' if error_kind else 'healthy' if result['passed'] else 'alert', 'tests': result['tests'] if not error_kind else 0, 'findings': [] if error_kind else diagnoses, 'error_kind': error_kind, 'observed_at': started, 'previous_report_sha256': previous, 'repair_authority': False, 'model_calls': 0, 'provider_requests': 0, 'public_uptime_proven': False}
        report = {**content, 'report_sha256': digest(canonical(content))}
        write_json(root / ('observation-%02d.json' % number), report, exclusive=True)
        write_json(index_file, {**index, 'reports': [*index['reports'], report['report_sha256']], 'pending': None})
        return report
    finally:
        os.close(lease)


def main(argv=None):
    parser = argparse.ArgumentParser(description='Observe one exact owner-pinned committed static candidate; never repair or call a model.')
    parser.add_argument('--registry', required=True)
    parser.add_argument('--repository-id', required=True)
    parser.add_argument('--policy-sha256', required=True)
    parser.add_argument('--journal-directory', required=True)
    parser.add_argument('--monitor-id', required=True)
    parser.add_argument('--runs', type=int, default=1, help='One to8 observations; stop immediately on alert/unknown. Never repair.')
    parser.add_argument('--interval-seconds', type=int, default=60)
    args = parser.parse_args(argv)
    if not 1 <= args.runs <= 8 or not 60 <= args.interval_seconds <= 300:
        parser.error('Finite monitor requires1–8 runs spaced60–300seconds')
    for number in range(args.runs):
        if number:
            time.sleep(args.interval_seconds)
        value = observe(registry=args.registry, reference={'repository_id': args.repository_id, 'policy_hash': args.policy_sha256}, journal_directory=args.journal_directory, monitor_id=args.monitor_id)
        print(canonical(value), flush=True)
        if value['status'] != 'healthy':
            break


if __name__ == '__main__':
    main()
