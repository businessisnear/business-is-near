"""Bounded owner conversation over existing, separately owner-signed operations.

This module has no transaction writer, wallet, provider configuration or storage.
The caller supplies FINAL reads from one fixed company and authenticated decryption.
A model chooses an immutable menu index; only a later owner operation can approve it.
"""
import copy
import json
import re

from executor.operations import PROFILE, digest, text, validate_scope, validate_artifact
from executor.planner import choose_next
from executor.claims import claim_scope, review_artifact, validate_claim_review
from executor.localization import validate_locale, attach_payload_locale, validate_payload_locale

CONVERSATION_PROFILE = 'owner-conversation-v1'
WORK_OPERATIONS = ('research_summary', 'website_build', 'content_draft', 'support_draft',
                   'outreach_draft', 'social_draft', 'ads_draft', 'analytics_report')
PROPOSAL_NOTICE = ('A proposal among owner-approved choices. A separate owner-signed decision is required; '
                   'private artifacts do not prove delivery, revenue or business success.')
REJECTION_NOTICE = 'Owner rejected the referenced proposal. No model or selected operation was executed.'


def canonical(value):
    """Portable JSON commitment (ASCII, sorted keys, no insignificant whitespace)."""
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True)


def _exact(value, fields, label):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise ValueError('Invalid ' + label + ' fields')
    return value


def _sha(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9a-f]{64}', value):
        raise ValueError('Expected a lowercase SHA-256 commitment')
    return value


def _identity(conversation_id, turn):
    if (not isinstance(conversation_id, str) or not re.fullmatch(r'[0-9a-f]{16}', conversation_id) or
            type(turn) is not int or not 1 <= turn <= 1000):
        raise ValueError('Invalid bounded conversation identity')


def conversation_task_id(conversation_id, turn, kind):
    _identity(conversation_id, turn)
    if kind not in ('proposal', 'decision'):
        raise ValueError('Unsupported conversation task kind')
    return 'chat_' + conversation_id + '_' + str(turn) + '_' + kind


def _base(scope):
    if not isinstance(scope, dict):
        raise ValueError('Typed conversation scope required')
    return {key: value for key, value in scope.items() if key not in ('control', 'control_ref')}


def _size(scope):
    if len(json.dumps(scope, ensure_ascii=True).encode()) > 2700:
        raise ValueError('Conversation scope exceeds the encrypted operation limit')


def validate_control_scope(scope):
    """Validate a proposal scope without granting it execution authority."""
    fields = ('profile', 'operation', 'brief', 'context', 'sources', 'use_ai', 'control')
    _exact(scope, fields + (('locale',) if isinstance(scope, dict) and 'locale' in scope else ()), 'proposal scope')
    validate_scope(_base(scope), 'strategy_plan')
    control = _exact(scope['control'], ('profile', 'kind', 'conversation_id', 'turn', 'menu', 'previous'), 'proposal control')
    if control['profile'] != CONVERSATION_PROFILE or control['kind'] != 'proposal':
        raise ValueError('Unsupported conversation control profile')
    _identity(control['conversation_id'], control['turn'])
    menu = control['menu']
    if not isinstance(menu, list) or not 1 <= len(menu) <= 4:
        raise ValueError('One to four owner-approved work choices required')
    for item in menu:
        _exact(item, ('operation', 'brief', 'use_ai') +
               (('app_generation',) if isinstance(item, dict) and 'app_generation' in item else ()), 'approved work choice')
        if item['operation'] not in WORK_OPERATIONS or type(item['use_ai']) is not bool:
            raise ValueError('Unsupported owner-approved work choice')
        text(item['brief'], 400)
        selected = {**_base(scope), **item}
        validate_scope(selected, item['operation'])
        if 'app_generation' in item:
            from executor.app_generation import GENERAL_PROFILE
            if item['app_generation']['profile'] != GENERAL_PROFILE:
                raise ValueError('Chat app provisioning supports only the fixed GENERAL record template')
    previous = control['previous']
    if control['turn'] == 1:
        if previous is not None:
            raise ValueError('First conversation turn cannot reference prior work')
    else:
        _exact(previous, ('task_id', 'evidence_hash'), 'previous decision reference')
        if previous['task_id'] != conversation_task_id(control['conversation_id'], control['turn'] - 1, 'decision'):
            raise ValueError('Conversation must continue its immediately previous decision')
        _sha(previous['evidence_hash'])
    _size(scope)
    return scope


def selected_scope(scope, choice):
    validate_control_scope(scope)
    menu = scope['control']['menu']
    if type(choice) is not int or not 0 <= choice < len(menu):
        raise ValueError('Proposal selected work outside the approved menu')
    return copy.deepcopy({**_base(scope), **menu[choice]})


def proposal_hash(scope, task_id, choice):
    control = scope['control']
    if task_id != conversation_task_id(control['conversation_id'], control['turn'], 'proposal'):
        raise ValueError('Proposal task ID does not match its conversation')
    return digest(canonical({'profile': CONVERSATION_PROFILE, 'proposal_id': task_id,
                             'scope_digest': digest(canonical(scope)), 'choice': choice,
                             'selected_scope': selected_scope(scope, choice)}))


def _artifact(scope, choice, reason):
    return {'title': 'Owner proposal for review', 'summary': reason,
            'items': [{'text': selected_scope(scope, choice)['brief'][:300],
                       'source_ids': [scope['sources'][0]['id']]}]}


def _sources(scope):
    return [{'id': source['id'], 'sha256': digest(source['text'])} for source in scope['sources']]


def _generation(value, use_ai):
    if not isinstance(value, dict) or type(value.get('cached')) is not bool:
        raise ValueError('Invalid proposal generation provenance')
    mode = value.get('mode')
    if mode == 'local_ollama' and use_ai:
        _exact(value, ('mode', 'model', 'cached', 'model_digest', 'authorization_model',
                       'cloud_provider_charge_nanos', 'local_compute_cost_unknown'), 'local generation')
        text(value['model'], 160); text(value['authorization_model'], 160)
        _sha(value['model_digest'])
        if value['cloud_provider_charge_nanos'] != 0 or value['local_compute_cost_unknown'] is not True:
            raise ValueError('Local compute has no verified Cloud invoice')
    elif mode == 'near_ai_unattested' and use_ai:
        _exact(value, ('mode', 'model', 'cached'), 'model generation')
        text(value['model'], 160)
    elif mode == 'deterministic_planner' and not use_ai:
        _exact(value, ('mode', 'model', 'cached'), 'deterministic generation')
        if value['model'] is not None or value['cached'] is not False:
            raise ValueError('Deterministic proposal cannot claim inference')
    else:
        raise ValueError('Proposal generation contradicts owner inference consent')


def choose_proposal(scope, client, task_id, previous=None):
    """One bounded model choice, never a task submission or selected work execution.

    The worker must call validate_previous_reference first. ``previous`` is only
    the small untrusted summary returned there; no historical text is authority.
    Existing client reservation/call limits and encrypted response cache apply.
    """
    validate_control_scope(scope)
    control = scope['control']
    if task_id != conversation_task_id(control['conversation_id'], control['turn'], 'proposal'):
        raise ValueError('Proposal task ID does not match its conversation')
    previous = {} if previous is None else previous
    _exact(previous, () if not previous else ('operation', 'status', 'delivery', 'summary'), 'prior model context')
    if previous:
        if previous['operation'] not in WORK_OPERATIONS + ('strategy_plan',) or previous['status'] != 'archived':
            raise ValueError('Invalid prior decision context')
        text(previous['delivery'], 80); text(previous['summary'], 200)
    if bool(previous) != (control['turn'] > 1):
        raise ValueError('Later proposals require validated previous decision context')
    menu = [{'operation': item['operation'], 'brief': item['brief']} for item in control['menu']]
    choice, old_artifact, generation = choose_next(_base(scope), menu, previous, client, task_id, control['turn'] - 1)
    reason = old_artifact['summary']
    payload = {'profile': PROFILE, 'operation': 'strategy_plan', 'delivery': 'private_proposal_only',
               'artifact': _artifact(scope, choice, reason), 'generation': generation,
               'sources': _sources(scope), 'notice': PROPOSAL_NOTICE,
               'control': {'profile': CONVERSATION_PROFILE, 'kind': 'proposal',
                           'conversation_id': control['conversation_id'], 'turn': control['turn'],
                           'choice': choice, 'reason': reason, 'selected_scope': selected_scope(scope, choice),
                           'proposal_hash': proposal_hash(scope, task_id, choice)}}
    attach_payload_locale(payload, scope)
    payload['claim_review'] = review_artifact(payload['artifact'], claim_scope(payload, scope), generation)
    return validate_proposal_payload(payload, scope, task_id)


def validate_proposal_payload(payload, scope, task_id):
    """Authenticate structure after ciphertext commitments have been checked."""
    validate_control_scope(scope)
    fields = ('profile', 'operation', 'delivery', 'artifact', 'generation', 'sources', 'notice', 'control')
    _exact(payload, fields + (('locale',) if 'locale' in scope else ()) +
           (('claim_review',) if 'claim_review' in payload else ()), 'proposal evidence')
    validate_payload_locale(payload, scope)
    if (payload['profile'] != PROFILE or payload['operation'] != 'strategy_plan' or
            payload['delivery'] != 'private_proposal_only' or payload['notice'] != PROPOSAL_NOTICE or
            payload['sources'] != _sources(scope)):
        raise ValueError('Proposal evidence differs from the owner request')
    result = _exact(payload['control'], ('profile', 'kind', 'conversation_id', 'turn', 'choice', 'reason',
                                        'selected_scope', 'proposal_hash'), 'proposal result')
    control = scope['control']
    if (result['profile'] != CONVERSATION_PROFILE or result['kind'] != 'proposal' or
            result['conversation_id'] != control['conversation_id'] or result['turn'] != control['turn']):
        raise ValueError('Proposal evidence belongs to another conversation')
    expected = selected_scope(scope, result['choice'])
    text(result['reason'], 300)
    if (result['selected_scope'] != expected or result['proposal_hash'] != proposal_hash(scope, task_id, result['choice']) or
            payload['artifact'] != _artifact(scope, result['choice'], result['reason'])):
        raise ValueError('Proposal evidence expanded the owner-approved work')
    validate_artifact(payload['artifact'], _base(scope))
    _generation(payload['generation'], scope['use_ai'])
    if 'claim_review' in payload:
        validate_claim_review(payload['claim_review'], payload['artifact'], claim_scope(payload, scope), payload['generation'])
    return payload


def _reference(value):
    _exact(value, ('profile', 'decision', 'conversation_id', 'turn', 'proposal_id', 'evidence_hash', 'proposal_hash'), 'owner decision reference')
    if value['profile'] != CONVERSATION_PROFILE or value['decision'] not in ('approve', 'reject'):
        raise ValueError('Unsupported conversation decision')
    _identity(value['conversation_id'], value['turn'])
    if value['proposal_id'] != conversation_task_id(value['conversation_id'], value['turn'], 'proposal'):
        raise ValueError('Decision proposal ID does not match its conversation')
    _sha(value['evidence_hash']); _sha(value['proposal_hash'])
    return value


def rejection_scope(reference, locale=None):
    _reference(reference)
    if reference['decision'] != 'reject':
        raise ValueError('Rejection requires an explicit reject decision')
    scope = {'profile': PROFILE, 'operation': 'strategy_plan', 'brief': 'Reject the proposed operation.',
            'context': 'Owner rejected this proposal. No model or operation will run.',
            'sources': [{'id': 'owner_decision', 'text': 'Owner rejected the referenced proposal.'}],
            'use_ai': False, 'control_ref': copy.deepcopy(reference)}
    if locale is not None:
        scope['locale'] = validate_locale(locale)
    return scope


def validate_decision_scope(scope):
    fields = ('profile', 'operation', 'brief', 'context', 'sources', 'use_ai', 'control_ref')
    _exact(scope, fields + (('locale',) if isinstance(scope, dict) and 'locale' in scope else ()) +
           (('app_generation',) if isinstance(scope, dict) and 'app_generation' in scope else ()), 'decision scope')
    ref = _reference(scope['control_ref'])
    validate_scope(_base(scope), scope['operation'])
    if ref['decision'] == 'reject':
        if scope != rejection_scope(ref, scope.get('locale')):
            raise ValueError('Rejection must be the fixed no-inference event')
    elif scope['operation'] not in WORK_OPERATIONS:
        raise ValueError('Approval cannot introduce another control operation')
    if 'app_generation' in scope:
        from executor.app_generation import GENERAL_PROFILE
        if scope['app_generation']['profile'] != GENERAL_PROFILE:
            raise ValueError('Chat app provisioning supports only the fixed GENERAL record template')
    _size(scope)
    return scope


def decision_scope(proposal_scope, proposal_payload, proposal_id, evidence_hash, decision):
    """Prepare plaintext for a NEW, separately owner-signed operation."""
    validate_proposal_payload(proposal_payload, proposal_scope, proposal_id)
    _sha(evidence_hash)
    result = proposal_payload['control']
    ref = {'profile': CONVERSATION_PROFILE, 'decision': decision,
           'conversation_id': result['conversation_id'], 'turn': result['turn'],
           'proposal_id': proposal_id, 'evidence_hash': evidence_hash, 'proposal_hash': result['proposal_hash']}
    _reference(ref)
    answer = rejection_scope(ref, proposal_scope.get('locale')) if decision == 'reject' else {**copy.deepcopy(result['selected_scope']), 'control_ref': ref}
    return validate_decision_scope(answer)


def _owner_task(task, task_id, owner, worker_key_id, operation=None, profile_version=None):
    # ``read_task`` must read the exact ID from the caller's fixed company FINAL
    # view. company_task returns Work without an id; queue entries include it.
    if (not isinstance(task, dict) or task.get('id', task_id) != task_id or task.get('kind') != 'general' or
            task.get('approved_by') != owner or not isinstance(owner, str) or not owner or
            task.get('worker_key_id') != worker_key_id or not worker_key_id or
            type(task.get('execution_profile_version')) is not int or not 1 <= task['execution_profile_version'] <= 64 or
            (profile_version is not None and task['execution_profile_version'] != profile_version) or
            task.get('mandate_id') or task.get('inbox_id') or
            (operation is not None and task.get('operation') != operation)):
        raise ValueError('Same-company owner-authorized conversation task required')


def validate_approved_reference(task, scope, *, owner, read_task, open_task):
    """Re-read/decrypt the archived parent from the SAME company's FINAL view.

    read_task(id) -> Work or None. open_task(id, Work) -> (scope, evidence), with
    both ciphertext hashes checked before decryption. Neither callback may read
    a company/account/URL supplied in conversation or model text.
    """
    validate_decision_scope(scope)
    ref = scope['control_ref']
    ident = conversation_task_id(ref['conversation_id'], ref['turn'], 'decision')
    _owner_task(task, ident, owner, task.get('worker_key_id'), scope['operation'])
    if task.get('id') != ident or task.get('status') != 'awaiting_evidence':
        raise ValueError('Only an active owner decision can authorize execution')
    parent = read_task(ref['proposal_id'])
    _owner_task(parent, ref['proposal_id'], owner, task['worker_key_id'], 'strategy_plan', task['execution_profile_version'])
    if parent.get('status') != 'archived' or parent.get('evidence_hash') != ref['evidence_hash']:
        raise ValueError('Decision requires its exact archived proposal evidence')
    parent_scope, payload = open_task(ref['proposal_id'], parent)
    validate_proposal_payload(payload, parent_scope, ref['proposal_id'])
    control = payload['control']
    if (control['proposal_hash'] != ref['proposal_hash'] or control['conversation_id'] != ref['conversation_id'] or
            control['turn'] != ref['turn']):
        raise ValueError('Decision references another proposal')
    if ref['decision'] == 'approve' and _base(scope) != control['selected_scope']:
        raise ValueError('Owner approval changed selected work, context, sources or inference consent')
    if ('locale' in scope) != ('locale' in parent_scope) or scope.get('locale') != parent_scope.get('locale'):
        raise ValueError('Owner decision changed its original proposal language')
    return ref['decision']


def rejection_payload(scope):
    validate_decision_scope(scope)
    if scope['control_ref']['decision'] != 'reject':
        raise ValueError('Only an owner rejection produces a rejection event')
    artifact = {'title': 'Proposal rejected', 'summary': REJECTION_NOTICE,
                'items': [{'text': 'The referenced proposal was declined.', 'source_ids': ['owner_decision']}]}
    payload = {'profile': PROFILE, 'operation': 'strategy_plan', 'delivery': 'owner_rejected',
            'artifact': artifact, 'generation': {'mode': 'source_extract', 'model': None, 'cached': False},
            'sources': _sources(scope), 'notice': REJECTION_NOTICE,
            'control_ref': copy.deepcopy(scope['control_ref'])}
    attach_payload_locale(payload, scope)
    payload['claim_review'] = review_artifact(artifact, claim_scope(payload, scope), payload['generation'])
    return payload


def validate_rejection_payload(payload, scope):
    expected = rejection_payload(scope)
    if isinstance(payload, dict) and 'claim_review' not in payload:
        del expected['claim_review']
    if payload != expected:
        raise ValueError('Rejection evidence contradicts the owner decision')
    return payload


def validate_previous_reference(task, scope, *, owner, read_task, open_task):
    """Require a committed prior owner decision before another proposal call."""
    validate_control_scope(scope)
    control = scope['control']
    ident = conversation_task_id(control['conversation_id'], control['turn'], 'proposal')
    _owner_task(task, ident, owner, task.get('worker_key_id'), 'strategy_plan')
    if task.get('id') != ident or task.get('status') != 'awaiting_evidence':
        raise ValueError('Only an active owner question can invoke a proposal')
    previous = control['previous']
    if previous is None:
        return {}
    parent = read_task(previous['task_id'])
    _owner_task(parent, previous['task_id'], owner, task['worker_key_id'], profile_version=task['execution_profile_version'])
    if parent.get('status') != 'archived' or parent.get('evidence_hash') != previous['evidence_hash']:
        raise ValueError('Prior owner decision is missing, unfinished or changed')
    previous_scope, payload = open_task(previous['task_id'], parent)
    validate_decision_scope(previous_scope)
    ref = previous_scope['control_ref']
    if ref['conversation_id'] != control['conversation_id'] or ref['turn'] != control['turn'] - 1:
        raise ValueError('Prior decision belongs to another conversation')
    # Recheck its original proposal too. An operator attestation is never a new
    # owner grant, and a copied/fabricated decision cannot become chat authority.
    validate_approved_reference({**parent, 'id': previous['task_id'], 'status': 'awaiting_evidence'},
                                previous_scope, owner=owner, read_task=read_task, open_task=open_task)
    if ref['decision'] == 'reject':
        validate_rejection_payload(payload, previous_scope)
    else:
        if (payload.get('profile') != PROFILE or payload.get('operation') != previous_scope['operation'] or
                payload.get('delivery') != 'private_artifact_only'):
            raise ValueError('Prior approved result is not a private work artifact')
        validate_artifact(payload.get('artifact'), _base(previous_scope))
        validate_payload_locale(payload, previous_scope)
        if 'claim_review' in payload:
            validate_claim_review(payload['claim_review'], payload['artifact'], claim_scope(payload, previous_scope), payload['generation'])
    return {'operation': previous_scope['operation'], 'status': 'archived', 'delivery': payload['delivery'],
            'summary': payload['artifact']['summary'][:200]}
