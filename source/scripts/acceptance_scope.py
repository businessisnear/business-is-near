"""Strict scope selection and evidence-bound NEAR-native acceptance.

This module reads only declared reports and source identities; it never invokes
runtimes or providers. Historical inventory commitments cannot accept new source.
"""
import hashlib
import json
import re
from pathlib import Path

SCOPES = {'business_requirements_baseline', 'near_native_equivalents_v1'}
STAGES = {'local_authorized', 'public_testnet'}
MODES = {'local_gemma_authorized', 'near_ai_cloud', 'none'}
HEX = re.compile(r'^[a-f0-9]{64}$')
SOURCE_ROOTS = {'app', 'executor', 'qa', 'scripts', 'web-chain', 'contract', 'integration', 'tests', 'docs', 'public'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def _file(root, relative, source=False):
    if not isinstance(relative, str) or not relative or '\\' in relative:
        raise ValueError('Invalid evidence path')
    parts = Path(relative).parts
    if str(Path(relative)) != relative or Path(relative).is_absolute() or any(p in ('..', '.', 'vault', 'secrets', '__pycache__') for p in parts):
        raise ValueError('Unsafe evidence path')
    if any(p in ('operator.json', 'controller-key.json', 'recovery.json', '.env') or p.endswith(('.pem', '.key')) for p in parts):
        raise ValueError('Credential paths are never acceptance evidence')
    if source and parts[0] not in SOURCE_ROOTS and relative != 'requirements.txt':
        raise ValueError('Source identity must name project code')
    current = Path(root)
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise ValueError('Symlink evidence refused')
    if not current.is_file() or current.stat().st_size > 32 * 1024 * 1024:
        raise ValueError('Missing or oversized evidence file')
    return current


def _json(root, relative):
    raw = _file(root, relative).read_bytes()
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError('Acceptance JSON exceeds bound')
    return json.loads(raw), sha(raw)


def selection(root, target_scope=None, required_stage=None):
    value, _ = _json(root, 'docs/acceptance-target.json')
    if set(value) != {'schema', 'target_scope', 'required_stage', 'inference_mode', 'catalog_sha256'}:
        raise ValueError('Exact acceptance target selection required')
    value = dict(value)
    if target_scope is not None:
        value['target_scope'] = target_scope
    if required_stage is not None:
        value['required_stage'] = required_stage
    elif value['target_scope'] == 'business_requirements_baseline':
        value['required_stage'] = 'live_baseline'
    if type(value['schema']) is not int or value['schema'] != 1 or value['target_scope'] not in SCOPES:
        raise ValueError('Unknown acceptance target scope')
    if value['inference_mode'] not in MODES or not isinstance(value['catalog_sha256'], str) or not HEX.fullmatch(value['catalog_sha256']):
        raise ValueError('Invalid inference mode or catalogue identity')
    valid_stages = STAGES if value['target_scope'] == 'near_native_equivalents_v1' else {'live_baseline'}
    if value['required_stage'] not in valid_stages:
        raise ValueError('Acceptance stage does not match target scope')
    return value


def _lookup(value, dotted):
    for key in dotted.split('.'):
        if not isinstance(value, dict) or key not in value:
            raise ValueError('Receipt lacks required assertion')
        value = value[key]
    return value


def _report(root, path, definition, expected_sha=None):
    report, identity = _json(root, path)
    if expected_sha is not None and identity != expected_sha:
        raise ValueError('Acceptance receipt hash mismatch')
    if not isinstance(report, dict) or report.get('passed') is False:
        raise ValueError('Failed receipt cannot establish acceptance')
    checks = report.get('checks')
    if not isinstance(checks, dict) or not checks or any(v is not True for v in checks.values()):
        raise ValueError('Receipt needs actual successful named checks')
    required_checks = definition['required_checks']
    if not isinstance(required_checks, list) or not required_checks or any(not isinstance(k, str) for k in required_checks) or not set(required_checks).issubset(checks):
        raise ValueError('Receipt reduced its reviewed acceptance checks')
    env = definition['environment']
    if set(env) != {'path', 'equals'} or not isinstance(env['equals'], str) or _lookup(report, env['path']) != env['equals']:
        raise ValueError('Receipt environment mismatch')
    for key, expected in definition['completion_assertions'].items():
        if expected is not True or _lookup(report, key) is not True:
            raise ValueError('Receipt completion/teardown not established')
    sources = report.get('source_sha256')
    if not isinstance(sources, dict) or not sources or len(sources) > 2048:
        raise ValueError('Receipt needs bounded source identities')
    changed = []
    for name, digest in sources.items():
        if not isinstance(digest, str) or not HEX.fullmatch(digest):
            raise ValueError('Invalid receipt source hash')
        try:
            file = _file(root, name, source=True)
        except ValueError as error:
            # A historical code/build path may legitimately no longer exist.
            # Unsafe paths are still rejected before any file read.
            if str(error) != 'Missing or oversized evidence file':
                raise
            changed.append(name)
            continue
        if sha(file.read_bytes()) != digest:
            changed.append(name)
    if 'source_inventory' in definition:
        # A commitment binds the ENTIRE predecessor source-key set, not a subset.
        # Canonical hashes contain no encoded filenames and cannot relabel keys.
        inventory = definition['source_inventory']
        names = sorted(sources)
        if len(names) != inventory['count'] or sha(json.dumps(names, separators=(',', ':')).encode()) != inventory['sha256']:
            raise ValueError('Reviewed full source inventory mismatch')
    else:
        required = {p for p in definition['minimum_source_files'] if not p.startswith('web-chain/dist/')}
        if expected_sha is not None and set(definition['minimum_source_files']) != set(sources):
            raise ValueError('Reviewed receipt source coverage cannot be relabeled')
        if not required.issubset(sources):
            raise ValueError('Receipt reduced its reviewed source coverage')
    if definition['stage'] == 'public_testnet' and report.get('public_deployment') is not True:
        raise ValueError('Local receipt cannot establish public observation')
    return {'artifact': path, 'sha256': identity, 'stage': definition['stage'],
            'domain': definition['domain'], 'inference': definition['inference'],
            'named_check_count': len(checks), 'source_count': len(sources),
            'source_manifest_sha256': sha(json.dumps(sources, sort_keys=True, separators=(',', ':')).encode()),
            'current_sources_match': not changed, 'changed_sources': changed}


def _refresh_paths(root, locator):
    if locator is None:
        return []
    if set(locator) == {'file'}:
        value = locator['file']
        if not isinstance(value, str) or not re.fullmatch(r'\.artifacts/[a-z0-9-]+(?:e2e|evidence)\.json', value):
            raise ValueError('Unsafe owned-report refresh path')
        return [value] if (Path(root) / value).exists() else []
    if set(locator) != {'directory', 'filename'} or locator['filename'] not in ('report.json', 'evidence.json'):
        raise ValueError('Invalid owned-report locator')
    folder = locator['directory']
    if not isinstance(folder, str) or not re.fullmatch(r'\.artifacts/[a-z0-9-]+', folder):
        raise ValueError('Unsafe owned-report directory')
    directory = Path(root) / folder
    if not directory.exists():
        return []
    if directory.is_symlink() or not directory.is_dir():
        raise ValueError('Unsafe owned-report directory')
    children = sorted(directory.iterdir(), key=lambda x: x.name, reverse=True)
    if len(children) > 512:
        raise ValueError('Owned-report attempt bound exceeded')
    return [str((p / locator['filename']).relative_to(root)) for p in children
            if not p.is_symlink() and p.is_dir() and re.fullmatch(r'[A-Za-z0-9_-]{1,100}', p.name)
            and (p / locator['filename']).is_file()]


def _receipt(root, definition):
    base = {'artifact', 'sha256', 'environment', 'stage', 'domain', 'inference', 'required_checks', 'refresh_from', 'completion_assertions'}
    keys = set(definition)
    if keys not in (base | {'minimum_source_files'}, base | {'source_inventory'}) or definition['stage'] not in STAGES or definition['domain'] not in ('native', 'external_synthetic') or definition['inference'] not in ('none', 'synthetic', 'actual_local_gemma', 'actual_cloud'):
        raise ValueError('Invalid acceptance receipt definition')
    if 'source_inventory' in definition:
        inventory = definition['source_inventory']
        if not isinstance(inventory, dict) or set(inventory) != {'sha256', 'count'} or type(inventory['count']) is not int or not 1 <= inventory['count'] <= 2048 or not isinstance(inventory['sha256'], str) or not HEX.fullmatch(inventory['sha256']):
            raise ValueError('Invalid full source inventory commitment')
    digest = definition['sha256']
    if not isinstance(digest, str) or not HEX.fullmatch(digest) or definition['artifact'] != f'.artifacts/accepted-components/{digest}.json':
        raise ValueError('Reviewed receipt must be content-addressed')
    historical = _report(root, definition['artifact'], definition, digest)
    historical['receipt_basis'] = 'reviewed_immutable_component'
    if 'source_inventory' in definition:
        # This publication-only representation preserves bounded old evidence.
        # Neither matching old sources nor a refresh candidate qualifies a new
        # source generation. A new explicit reviewed component is required.
        historical['current_acceptance_eligible'] = False
        historical['refresh_requires_new_reviewed_component'] = True
        return historical
    if historical['current_sources_match']:
        return historical
    # Reuse the exact reviewed component even when it is historical. Only an
    # owned harness report with matching assertions/full current source coverage
    # can make it current; failures never overwrite the immutable original.
    rejected = 0
    for candidate in _refresh_paths(root, definition['refresh_from']):
        try:
            fresh = _report(root, candidate, definition)
            if fresh['current_sources_match']:
                fresh['receipt_basis'] = 'current_owned_harness_report'
                fresh['reviewed_component_sha256'] = digest
                return fresh
        except (ValueError, OSError, json.JSONDecodeError):
            rejected += 1
    historical['rejected_refresh_candidates'] = rejected
    return historical


def _native_catalogue(root, selected):
    catalogue, identity = _json(root, 'docs/near-native-capabilities.json')
    if identity != selected['catalog_sha256'] or catalogue.get('schema') != 1 or catalogue.get('target_scope') != 'near_native_equivalents_v1':
        raise ValueError('Selected native catalogue identity mismatch')
    baseline, baseline_hash = _json(root, 'docs/native-business-requirements.json')
    link = catalogue['baseline']
    ids = [r['id'] for r in baseline['capabilities']]
    rows = catalogue['capabilities']
    if link['path'] != 'docs/native-business-requirements.json' or link['sha256'] != baseline_hash or link['ids'] != ids:
        raise ValueError('Native mapping must preserve exact requirements baseline')
    if len(ids) != 44 or len(set(ids)) != 44 or [r['id'] for r in rows] != ids:
        raise ValueError('Native mapping must retain all44 baseline IDs once')
    return catalogue, identity, baseline_hash, ids, rows


def native_structure(root, selected):
    _, identity, baseline_hash, ids, _ = _native_catalogue(root, selected)
    return {'baseline_link_valid': True, 'capability_count': len(ids),
            'catalog_sha256': identity, 'baseline_sha256': baseline_hash,
            'workflow_acceptance_executed': False, 'feature_completion_claimed': False}


def native_audit(root, selected):
    catalogue, identity, baseline_hash, ids, rows = _native_catalogue(root, selected)
    receipts = {name: _receipt(root, value) for name, value in catalogue['receipts'].items()}
    outcomes, gaps, all_case_ids = [], [], set()
    for row in rows:
        if row['implementation_status'] not in ('missing', 'partial', 'implemented_bounded') or not row['criterion']:
            raise ValueError('Invalid native capability description')
        if not isinstance(row['open_native_gaps'], list) or any(not isinstance(x, str) or not x for x in row['open_native_gaps']):
            raise ValueError('Native functional gaps must be explicit')
        evidence_ids, cases = set(), []
        for case in row['local_cases']:
            if set(case) != {'id', 'description', 'receipts'} or not case['id'].startswith(row['id'] + '.') or case['id'] in all_case_ids or not case['description'] or not case['receipts']:
                raise ValueError('Exact unique native acceptance case required')
            all_case_ids.add(case['id'])
            for rid in case['receipts']:
                if rid not in receipts or receipts[rid]['domain'] != 'native':
                    raise ValueError('External synthetic transport is not native workflow acceptance')
                evidence_ids.add(rid)
            cases.append(case['id'])
        for rid in row['related_receipts'] + row['public_receipts']:
            if rid not in receipts:
                raise ValueError('Unknown related/public evidence')
        covered = bool(cases)
        current = covered and all(receipts[rid]['current_sources_match'] and receipts[rid].get('current_acceptance_eligible', True) and receipts[rid]['stage'] == selected['required_stage'] for rid in evidence_ids)
        if row['id'] == 'live_near_ai_runtime':
            model_kind = {'local_gemma_authorized': 'actual_local_gemma', 'near_ai_cloud': 'actual_cloud', 'none': None}[selected['inference_mode']]
            model_ok = model_kind is not None and any(receipts[rid]['inference'] == model_kind for rid in evidence_ids)
            covered = covered and model_ok
            current = current and model_ok
        complete_bounded = covered and not row['open_native_gaps']
        public = [rid for rid in row['public_receipts'] if receipts[rid]['stage'] == 'public_testnet']
        if len(public) != len(row['public_receipts']):
            raise ValueError('Local receipt cannot promote public observation')
        reasons = list(row['open_native_gaps'])
        if not covered:
            reasons.append('No accepted native workflow case for the selected inference boundary.')
        elif not current:
            reasons.append('Bounded historical evidence retained; affected current-source/stage acceptance needs refresh.')
        item = {'id': row['id'], 'criterion': row['criterion'], 'implementation_status': row['implementation_status'],
                'local_component_coverage': 'accepted_bounded' if covered else 'not_established',
                'local_workflow_accepted_bounded': complete_bounded, 'current_candidate_accepted': complete_bounded and current,
                'public_observation': 'observed_bounded' if public else 'not_observed_by_this_catalogue',
                'public_receipts': public, 'evidence_receipts': sorted(evidence_ids), 'related_evidence_receipts': row['related_receipts'],
                'declared_bounds': row['declared_bounds'], 'optional_external_extensions': row['optional_external_extensions'],
                'remaining_native_gaps': reasons}
        outcomes.append(item)
        if not item['current_candidate_accepted']:
            gaps.append({'id': row['id'], 'status': 'native_gap' if row['open_native_gaps'] or not covered else 'current_source_refresh_required', 'missing': '; '.join(reasons)})
    return {'target_scope': selected['target_scope'], 'required_stage': selected['required_stage'], 'inference_mode': selected['inference_mode'],
            'catalog_sha256': identity, 'baseline_sha256': baseline_hash, 'statement_verified': not gaps,
            'selected_target_complete': not gaps, 'capability_count': 44, 'gaps': gaps, 'capabilities': outcomes,
            'receipt_evidence': receipts, 'bounded_components_reused': len(receipts),
            'locally_accepted_bounded_count': sum(x['local_workflow_accepted_bounded'] for x in outcomes),
            'current_candidate_accepted_count': sum(x['current_candidate_accepted'] for x in outcomes),
            'cloud_enrollment_required': selected['inference_mode'] == 'near_ai_cloud',
            'public_observation_from_local': False,
            'reason': 'Selected NEAR-native functional criteria and exact current evidence; optional named external services do not gate this target.'}


def evidence_files(root):
    catalogue, _ = _json(root, 'docs/near-native-capabilities.json')
    return sorted({x['artifact'] for x in catalogue['receipts'].values()})
