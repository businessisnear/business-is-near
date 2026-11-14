"""Encrypted NEAR-native customer messages; no email or external send connector."""
import json

from executor.crypto import committed_plaintext, json_object, open_record_key
from executor.operations import PROFILE, text, validate_scope
from executor.localization import validate_locale, validate_payload_locale

MESSAGE_PROFILE = 'near-inbox-v1'


class UnsupportedMessage(ValueError):
    pass


def validate_message(value):
    expected = {'profile', 'message'}
    if isinstance(value, dict) and 'locale' in value:
        validate_locale(value['locale'])
        expected.add('locale')
    if not isinstance(value, dict) or set(value) != expected or value['profile'] != MESSAGE_PROFILE:
        raise ValueError('Typed inbox message required')
    text(value['message'], 600)
    return value


def open_scope(vault, task, box, key):
    if (not box or box['id'] != task['inbox_id'] or box['customer_id'] != task['customer_id'] or
            box['worker_key_id'] != task['worker_key_id'] or box['execution_profile_version'] != task['execution_profile_version'] or
            task['operation'] != 'support_draft'):
        raise ValueError('Inbox delegation changed')
    message = validate_message(json_object(committed_plaintext(vault, task['encrypted_scope'], task['scope_hash'], key)))
    template = box['policy']
    policy_key = open_record_key(vault, template['worker_sealed_key'], box['worker_key_id'])
    policy = json_object(committed_plaintext(vault, template['encrypted_scope'], template['scope_hash'], policy_key))
    validate_scope(policy, 'support_draft')
    if len(policy['sources']) > 3 or any(source['id'] == 'customer_message' for source in policy['sources']):
        raise ValueError('Support policy must leave a distinct customer-message source slot')
    # The customer controls this source and an optional presentation language.
    # Inference consent, instruction context and operation remain owner policy.
    scope = {**policy, 'sources': [*policy['sources'], {'id': 'customer_message', 'text': message['message']}]}
    if 'locale' in message:
        scope['locale'] = message['locale']
    validate_scope(scope, 'support_draft')
    return scope


def validate_export(payload, task, message=None):
    if (payload.get('profile') != PROFILE or payload.get('operation') != 'support_draft' or
            payload.get('delivery') != 'near_inbox' or payload.get('inbox_id') != task.get('inbox_id') or
            payload.get('customer_id') != task.get('customer_id') or task.get('status') not in ('attested', 'archived')):
        raise ValueError('Finalized inbox reply required')
    sources = payload.get('sources')
    if not isinstance(sources, list) or not 2 <= len(sources) <= 4:
        raise ValueError('Inbox reply provenance missing')
    ids = [source.get('id') for source in sources if isinstance(source, dict)]
    if len(ids) != len(sources) or len(set(ids)) != len(ids) or 'customer_message' not in ids:
        raise ValueError('Inbox reply provenance invalid')
    from executor.operations import validate_artifact
    validate_artifact(payload['artifact'], {'sources': sources})
    if message is not None:
        validate_message(message)
        validate_payload_locale(payload, message, allow_policy_inheritance=True)
    elif 'locale' in payload:
        validate_locale(payload['locale'])
    return payload
