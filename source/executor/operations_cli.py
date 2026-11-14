"""Offline preparation/export for owner-reviewed business operations."""
import argparse
import base64
import json
import os
from pathlib import Path
import re
import secrets

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from app.worker_crypto import encrypt, decrypt
from executor.main import private_root
from executor.operations import PROFILE, validate_scope, render_website, digest


def write_private(path, data):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(data)
        stream.flush()
        os.fsync(stream.fileno())


def seal_payload(scope, manifest):
    pem = manifest['worker_public_key']
    if manifest.get('profile') != PROFILE or digest(pem) != manifest['worker_key_id']:
        raise ValueError('Business worker manifest mismatch')
    public = serialization.load_pem_public_key(pem.encode('ascii'))
    if not isinstance(public, rsa.RSAPublicKey) or public.key_size != 4096:
        raise ValueError('RSA-4096 worker required')
    key = secrets.token_urlsafe(32)
    envelope = encrypt(json.dumps(scope, separators=(',', ':')), key)
    sealed = public.encrypt(json.dumps({'record_key': key}).encode(),
                            padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    return envelope, base64.b64encode(sealed).decode(), key


def prepare(scope, manifest, task_id, version, *, company_id=None):
    validate_scope(scope, scope.get('operation'))
    validate_id(task_id)
    dependencies = []
    if 'documents' in scope:
        from executor.document_input import validate_document_scope, company
        validate_document_scope(scope, company(company_id))
    if 'goal_plan' in scope or 'goal_ref' in scope:
        from executor.goal_plan import goal_task_id, _plan_identity, _account, validate_goal_scope, validate_step_scope
        _account(company_id)
        if 'goal_plan' in scope:
            validate_goal_scope(scope, company_id)
            policy = scope['goal_plan']; expected = goal_task_id(policy['plan_id'], policy['revision'])
        else:
            validate_step_scope(scope, company_id)
            ref = scope['goal_ref']; plan_id, revision = _plan_identity(ref['plan_task_id'])
            expected = goal_task_id(plan_id, revision, ref['step']); dependencies = list(ref['dependencies'])
        if task_id != expected: raise ValueError('Goal work requires its exact canonical task ID')
    if 'control' in scope or 'control_ref' in scope:
        from executor.conversation import conversation_task_id, selected_scope
        from executor.app_generation import validate_generation_scope
        if company_id is None and ('app_generation' in scope or any(
                'app_generation' in item for item in scope.get('control', {}).get('menu', []))):
            raise ValueError('Connected company required for typed chat app provisioning')
        if 'control' in scope:
            for index, item in enumerate(scope['control']['menu']):
                if 'app_generation' in item:
                    validate_generation_scope(selected_scope(scope, index), company_id)
        elif 'app_generation' in scope:
            validate_generation_scope({k: v for k, v in scope.items() if k != 'control_ref'}, company_id)
        reference = scope.get('control', scope.get('control_ref'))
        kind = 'proposal' if 'control' in scope else 'decision'
        if task_id != conversation_task_id(reference['conversation_id'], reference['turn'], kind):
            raise ValueError('Conversation task ID must match its canonical owner record')
    if type(version) is not int or not 1 <= version <= 64:
        raise ValueError('Invalid profile version')
    envelope, sealed, key = seal_payload(scope, manifest)
    args = {'id': task_id, 'operation': scope['operation'], 'scope_hash': envelope['hash'],
            'encrypted_scope': envelope['envelope'], 'worker_sealed_key': sealed,
            'worker_key_id': manifest['worker_key_id'], 'execution_profile_version': version,
            'dependencies': dependencies, 'not_before': '0'}
    return args, {'version': 1, 'task_id': task_id, 'scope_hash': envelope['hash'], 'record_key': key}


def validate_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}', value) or value in ('__proto__', 'prototype', 'constructor'):
        raise ValueError('Invalid public ID')


def prepare_message(message, manifest, inbox_id, task_id):
    from executor.inbox import validate_message, MESSAGE_PROFILE
    validate_id(inbox_id); validate_id(task_id)
    payload = validate_message({'profile': MESSAGE_PROFILE, 'message': message})
    envelope, sealed, key = seal_payload(payload, manifest)
    return {'inbox_id': inbox_id, 'id': task_id, 'scope_hash': envelope['hash'],
            'encrypted_scope': envelope['envelope'], 'worker_sealed_key': sealed}, {
                'version': 1, 'task_id': task_id, 'scope_hash': envelope['hash'], 'record_key': key}


def prepare_mandate(plan, templates, manifest, mandate_id, version, interval, start, expiry, max_runs, daily):
    if any(isinstance(scope, dict) and 'documents' in scope for scope in [plan, *templates]):
        raise ValueError('Document inputs require a separate ordinary owner operation')
    if any(isinstance(scope, dict) and 'leads' in scope for scope in [plan, *templates]):
        raise ValueError('Public discovery requires a separate ordinary owner operation')
    if any(isinstance(scope, dict) and any(key in scope for key in ('goal_plan', 'goal_ref')) for scope in [plan, *templates]):
        raise ValueError('Goal plans and child approvals require separate ordinary owner operations')
    if any(isinstance(scope, dict) and 'knowledge' in scope for scope in [plan, *templates]):
        raise ValueError('Public knowledge requires a separate ordinary owner operation, not a mandate')
    if (not re.fullmatch(r'[A-Za-z0-9_-]{1,24}', mandate_id) or mandate_id in ('__proto__', 'prototype', 'constructor') or
            not 60 <= interval <= 2592000 or not 0 <= start < expiry <= 18446744073 or
            not 1 <= max_runs <= 1000 or not 1 <= daily <= 24 or not 1 <= len(templates) <= 4 or plan.get('operation') != 'strategy_plan'):
        raise ValueError('Invalid bounded mandate')
    prepared, recoveries = [], []
    for index, scope in enumerate([plan] + templates):
        call, recovery = prepare(scope, manifest, 'template_' + str(index), version)
        prepared.append({k: call[k] for k in ('operation', 'scope_hash', 'encrypted_scope', 'worker_sealed_key')})
        recoveries.append({k: recovery[k] for k in ('scope_hash', 'record_key')})
    return {'id': mandate_id, 'plan': prepared[0], 'templates': prepared[1:],
            'worker_key_id': manifest['worker_key_id'], 'execution_profile_version': version,
            'interval_seconds': interval, 'start_at': str(start), 'expires_at': str(expiry),
            'max_runs': max_runs, 'max_runs_per_day': daily}, {'version': 1, 'mandate_id': mandate_id, 'records': recoveries}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    prep = sub.add_parser('prepare')
    prep.add_argument('--scope', required=True)
    prep.add_argument('--manifest', required=True)
    prep.add_argument('--task-id', required=True)
    prep.add_argument('--profile-version', required=True, type=int)
    prep.add_argument('--output-dir', required=True)
    prep.add_argument('--company-id', help='Explicit connected company required for new goal-planning scopes')
    message = sub.add_parser('prepare-message')
    message.add_argument('--message-file', required=True)
    message.add_argument('--manifest', required=True)
    message.add_argument('--inbox-id', required=True)
    message.add_argument('--task-id', required=True)
    message.add_argument('--output-dir', required=True)
    inbox = sub.add_parser('prepare-inbox')
    inbox.add_argument('--policy', required=True)
    inbox.add_argument('--manifest', required=True)
    inbox.add_argument('--id', required=True)
    inbox.add_argument('--customer-id', required=True)
    inbox.add_argument('--profile-version', required=True, type=int)
    inbox.add_argument('--expires', required=True, type=int)
    inbox.add_argument('--max-messages', required=True, type=int)
    inbox.add_argument('--daily-limit', required=True, type=int)
    inbox.add_argument('--output-dir', required=True)
    mandate = sub.add_parser('prepare-mandate')
    mandate.add_argument('--plan', required=True)
    mandate.add_argument('--template', action='append', required=True)
    mandate.add_argument('--manifest', required=True)
    mandate.add_argument('--id', required=True)
    mandate.add_argument('--profile-version', required=True, type=int)
    mandate.add_argument('--interval', type=int, required=True)
    mandate.add_argument('--start', type=int, default=0)
    mandate.add_argument('--expires', type=int, required=True)
    mandate.add_argument('--max-runs', type=int, required=True)
    mandate.add_argument('--daily-limit', type=int, required=True)
    mandate.add_argument('--output-dir', required=True)
    export = sub.add_parser('export')
    export.add_argument('--task', required=True, help='company_task JSON (including evidence hash and ciphertext)')
    export.add_argument('--recovery', required=True)
    export.add_argument('--output-dir', required=True)
    export.add_argument('--company-id', help='Explicit connected company required for new goal-planning evidence')
    args = parser.parse_args()
    output = private_root(args.output_dir)
    # A fresh destination prevents accidental overwrite or partial recovery mixes.
    if any(output.iterdir()):
        raise ValueError('Use an empty private output directory')
    if args.action in ('prepare', 'prepare-mandate', 'prepare-message', 'prepare-inbox'):
        manifest = json.loads(Path(args.manifest).read_text())
        if args.action == 'prepare':
            scope = json.loads(Path(args.scope).read_text())
            call, recovery = prepare(scope, manifest, args.task_id, args.profile_version, company_id=args.company_id)
            method = 'company_submit_operation'
        elif args.action == 'prepare-mandate':
            plan = json.loads(Path(args.plan).read_text())
            templates = [json.loads(Path(name).read_text()) for name in args.template]
            call, recovery = prepare_mandate(plan, templates, manifest, args.id, args.profile_version,
                                            args.interval, args.start, args.expires, args.max_runs, args.daily_limit)
            method = 'company_create_mandate'
        elif args.action == 'prepare-message':
            call, recovery = prepare_message(Path(args.message_file).read_text(), manifest, args.inbox_id, args.task_id)
            method = 'company_customer_message'
        else:
            policy = json.loads(Path(args.policy).read_text())
            call, recovery = prepare(policy, manifest, args.id, args.profile_version)
            if (any(key in policy for key in ('knowledge', 'goal_plan', 'goal_ref', 'leads', 'documents')) or policy['operation'] != 'support_draft' or len(policy['sources']) > 3 or
                    any(source['id'] == 'customer_message' for source in policy['sources']) or len(args.id) > 24 or
                    not 2 <= len(args.customer_id) <= 64 or not re.fullmatch(r'[a-z0-9]+(?:[._-][a-z0-9]+)*', args.customer_id) or
                    not 0 < args.expires <= 18446744073 or not 1 <= args.max_messages <= 1000 or not 1 <= args.daily_limit <= 24):
                raise ValueError('Invalid bounded inbox grant')
            call = {'id': args.id, 'customer_id': args.customer_id,
                    'policy': {key: call[key] for key in ('operation', 'scope_hash', 'encrypted_scope', 'worker_sealed_key')},
                    'worker_key_id': manifest['worker_key_id'], 'execution_profile_version': args.profile_version,
                    'expires_at': str(args.expires), 'max_messages': args.max_messages, 'max_messages_per_day': args.daily_limit}
            method = 'company_create_inbox'
        # Keep recovery separate from the public transaction arguments.
        write_private(output / 'recovery.json', json.dumps(recovery, indent=2) + '\n')
        write_private(output / 'owner-call.json', json.dumps({'method': method, 'args': call}, indent=2) + '\n')
        print('Prepared encrypted owner-call.json and separate private recovery.json; no transaction sent.')
        return
    task = json.loads(Path(args.task).read_text())
    recovery = json.loads(Path(args.recovery).read_text())
    if recovery.get('mandate_id'):
        matches = [record for record in recovery['records'] if record['scope_hash'] == task.get('scope_hash')]
        if recovery['mandate_id'] != task.get('mandate_id') or len(matches) != 1:
            raise ValueError('Mandate recovery does not match task')
        recovery = {'task_id': task['id'], **matches[0]}
    if task.get('id') != recovery['task_id'] or task.get('scope_hash') != recovery['scope_hash']:
        raise ValueError('Recovery does not match task')
    if digest(task['encrypted_evidence']) != task['evidence_hash']:
        raise ValueError('Evidence commitment mismatch')
    if digest(task['encrypted_scope']) != task['scope_hash']:
        raise ValueError('Scope commitment mismatch')
    scope = json.loads(decrypt(task['encrypted_scope'], recovery['record_key']))
    payload = json.loads(decrypt(task['encrypted_evidence'], recovery['record_key']))
    if ('knowledge_receipt' in payload) != ('knowledge' in scope):
        raise ValueError('Unexpected or missing public knowledge evidence')
    if task.get('inbox_id'):
        from executor.inbox import validate_message, validate_export
        validate_message(scope); validate_export(payload, task, scope)
        rendered = None
    else:
        validate_scope(scope, task.get('operation'))
        from executor.localization import validate_payload_locale, scope_locale
        validate_payload_locale(payload, scope)
        if payload.get('profile') != PROFILE or payload.get('operation') != scope['operation']:
            raise ValueError('Evidence operation mismatch')
        from executor.operations import validate_artifact
        if 'control' in scope:
            from executor.conversation import validate_proposal_payload
            validate_proposal_payload(payload, scope, task['id'])
        elif 'control_ref' in scope:
            from executor.conversation import conversation_task_id, validate_rejection_payload
            reference = scope['control_ref']
            if task['id'] != conversation_task_id(reference['conversation_id'], reference['turn'], 'decision'):
                raise ValueError('Decision evidence belongs to another task ID')
            if reference['decision'] == 'reject':
                validate_rejection_payload(payload, scope)
            elif payload.get('control_ref') != reference or payload.get('delivery') != 'private_artifact_only':
                raise ValueError('Approved evidence differs from its original owner reference')
        validate_artifact(payload['artifact'], scope)
        if 'app_generation' in scope:
            from executor.app_generation import validate_generation_evidence
            if task.get('mandate_id') or task.get('inbox_id'):
                raise ValueError('Native app proposal needs a separate ordinary owner task')
            validate_generation_evidence(payload, {k: v for k, v in scope.items() if k != 'control_ref'}, task['scope_hash'])
        elif 'app_generation' in payload:
            raise ValueError('Unexpected native app proposal evidence')
        if 'documents' in scope:
            from executor.document_input import validate_document_evidence, company
            if task.get('mandate_id') or task.get('mandate_role') or task.get('inbox_id'):
                raise ValueError('Document excerpts cannot expand recurring or customer authority')
            validate_document_evidence(payload, scope, task['scope_hash'], company(args.company_id))
        elif 'document_receipt' in payload:
            raise ValueError('Unexpected document input receipt')
        if 'leads' in scope:
            from executor.leads import validate_payload
            if task.get('mandate_id') or task.get('mandate_role') or task.get('inbox_id'):
                raise ValueError('Public discovery cannot expand recurring or customer authority')
            validate_payload(payload, scope)
        elif 'leads' in payload:
            raise ValueError('Unexpected public discovery evidence')
        if 'goal_plan' in scope:
            from executor.goal_plan import validate_plan_payload, validate_goal_scope, _account
            validate_goal_scope(scope, _account(args.company_id))
            validate_plan_payload(payload, scope, task['id'])
        if 'goal_ref' in scope:
            from executor.goal_plan import validate_step_payload, validate_step_scope, _account, _plan_identity, goal_task_id
            validate_step_scope(scope, _account(args.company_id))
            plan_id, revision = _plan_identity(scope['goal_ref']['plan_task_id'])
            if task['id'] != goal_task_id(plan_id, revision, scope['goal_ref']['step']):
                raise ValueError('Goal export task ID differs from its exact graph position')
            validate_step_payload(payload, scope)
            if task.get('dependencies') != scope['goal_ref']['dependencies']:
                raise ValueError('Goal export public dependencies differ from the encrypted approval')
        if 'knowledge' in scope:
            from executor.knowledge_input import validate_knowledge_evidence
            if task.get('mandate_id') or task.get('mandate_role') or task.get('inbox_id'):
                raise ValueError('Public knowledge cannot expand an inbox or recurring mandate')
            validate_knowledge_evidence(payload, scope, task['scope_hash'])
        rendered = render_website(payload['artifact'], locale=scope_locale(scope)) if scope['operation'] == 'website_build' else None
    if 'claim_review' in payload:
        from executor.claims import claim_scope, validate_claim_review
        validate_claim_review(payload['claim_review'], payload['artifact'], claim_scope(payload, scope), payload['generation'])
    write_private(output / 'artifact.json', json.dumps(payload, indent=2) + '\n')
    if rendered is not None:
        write_private(output / 'index.html', rendered)
    print('Exported private plaintext. No transaction was sent by this export command.')


if __name__ == '__main__':
    main()
