"""Pure public-note proposals and read-only, exact-reference resolution.

No wallet, provider, vault, company storage, inference, filesystem, signing or
tool connector is imported. The caller supplies a FINAL-view reader already
pinned to the approved registry/network/deployed code identity. Public text is
untrusted source data; a resolved input still needs separate operation approval.
"""
import hashlib
import json
import re


ACCOUNT = re.compile(r'(?=.{2,64}\Z)[a-z0-9]+(?:[._-][a-z0-9]+)*\Z')
ID = re.compile(r'[a-z][a-z0-9_-]{0,31}\Z')
HASH = re.compile(r'[0-9a-f]{64}\Z')
PUBLICATION_FIELDS = {'publisher_id', 'playbook_id', 'version', 'title', 'content',
                      'source_uri', 'provenance', 'license', 'content_sha256', 'publication_sha256'}
REFERENCE_FIELDS = {'profile', 'registry_id', 'consumer_id', 'adoption_id', 'publisher_id',
                    'playbook_id', 'version', 'publication_sha256', 'content_sha256', 'adopted_at',
                    'untrusted_public_data', 'requires_separate_operation_approval',
                    'operation_completed', 'payment_authority', 'tool_authority'}


def _match(value, pattern, message):
    if not isinstance(value, str) or pattern.fullmatch(value) is None:
        raise ValueError(message)


def _id(value):
    _match(value, ID, 'Invalid public ID')
    if value in ('constructor', 'prototype', '__proto__'):
        raise ValueError('Reserved public ID')


def _text(value, maximum):
    if not isinstance(value, str) or not value.strip():
        raise ValueError('Public text required')
    try:
        encoded = value.encode('utf-8')
    except UnicodeEncodeError as error:
        raise ValueError('Invalid Unicode') from error
    if len(encoded) > maximum or any((ord(c) < 32 and c not in '\n\t') or ord(c) == 127 for c in value):
        raise ValueError('Public text exceeds byte/control bounds')


def _version(value):
    if type(value) is not int or not 1 <= value <= 32:
        raise ValueError('Version must be an integer from 1 to 32')


def _timestamp(value):
    if (not isinstance(value, str) or not re.fullmatch(r'[1-9][0-9]{0,19}', value) or
            int(value) > 18446744073709551615):
        raise ValueError('Canonical u64 chain timestamp required')


def _sha(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def prepare_publication(*, publisher_id, playbook_id, version, title, content,
                        source_uri, provenance, license):
    """Prepare a bounded unsigned proposal; this never opts in or publishes."""
    _match(publisher_id, ACCOUNT, 'Valid publisher account required')
    _id(playbook_id)
    _version(version)
    for value, limit in ((title, 128), (content, 4096), (source_uri, 256), (provenance, 512)):
        _text(value, limit)
    if license not in ('CC0-1.0', 'CC-BY-4.0'):
        raise ValueError('Supported public license required')
    content_sha256 = _sha(content)
    canonical = json.dumps(['near-public-playbook-v1', publisher_id, playbook_id, version,
                            title, content, source_uri, provenance, license, content_sha256],
                           ensure_ascii=False, separators=(',', ':'))
    return {'publisher_id': publisher_id, 'playbook_id': playbook_id, 'version': version,
            'title': title, 'content': content, 'source_uri': source_uri, 'provenance': provenance,
            'license': license, 'content_sha256': content_sha256, 'publication_sha256': _sha(canonical)}


def validate_reference(reference, *, registry_id, consumer_id):
    """Validate an unprivileged input reference against the expected principal."""
    _match(registry_id, ACCOUNT, 'Valid registry account required')
    _match(consumer_id, ACCOUNT, 'Valid consumer account required')
    if not isinstance(reference, dict) or set(reference) != REFERENCE_FIELDS:
        raise ValueError('Exact typed public-playbook reference required')
    if (reference['profile'] != 'near-public-playbook-reference-v1' or
            reference['registry_id'] != registry_id or reference['consumer_id'] != consumer_id):
        raise ValueError('Reference registry/consumer identity mismatch')
    _match(reference['publisher_id'], ACCOUNT, 'Valid publisher account required')
    _id(reference['playbook_id'])
    _id(reference['adoption_id'])
    _version(reference['version'])
    for field in ('publication_sha256', 'content_sha256'):
        _match(reference[field], HASH, 'Lowercase SHA-256 required')
    _timestamp(reference['adopted_at'])
    if any(reference[field] is not True for field in ('untrusted_public_data', 'requires_separate_operation_approval')):
        raise ValueError('Untrusted data and separate operation approval markers required')
    if any(reference[field] is not False for field in ('operation_completed', 'payment_authority', 'tool_authority')):
        raise ValueError('Public knowledge cannot grant authority or completed-operation evidence')
    return dict(reference)


def resolve_operation_input(read_final_view, reference, *, registry_id, consumer_id,
                            owner_approved_operation_input):
    """Resolve current exact content for later operation approval, without work.

    The registry uses two views; revocation/consent may change after the reads.
    A caller must revalidate immediately before separately approving/using an
    operation input. This function provides no atomic cross-contract guarantee.
    """
    reference = validate_reference(reference, registry_id=registry_id, consumer_id=consumer_id)
    if owner_approved_operation_input is not True:
        raise ValueError('Explicit owner approval to resolve this operation input required')
    current = read_final_view('operation_reference', {'consumer_id': consumer_id, 'adoption_id': reference['adoption_id']})
    if validate_reference(current, registry_id=registry_id, consumer_id=consumer_id) != reference:
        raise ValueError('Current adoption reference changed')
    keys = ('publisher_id', 'playbook_id', 'version', 'publication_sha256')
    status = read_final_view('eligible_publication', {'consumer_id': consumer_id, **{key: reference[key] for key in keys}})
    if (not isinstance(status, dict) or status.get('eligible') is not True or status.get('reason') != 'eligible' or
            not isinstance(status.get('publication'), dict)):
        raise ValueError('Public note is no longer eligible')
    note = status['publication']
    if set(note) != PUBLICATION_FIELDS | {'published_at', 'revoked'} or note['revoked'] is not False:
        raise ValueError('Exact currently eligible public note required')
    _timestamp(note['published_at'])
    prepared = prepare_publication(**{key: note[key] for key in PUBLICATION_FIELDS - {'content_sha256', 'publication_sha256'}})
    if any(note[key] != value for key, value in prepared.items()):
        raise ValueError('Public note content/provenance hash conflict')
    if any(note[key] != reference[key] for key in (*keys, 'content_sha256')):
        raise ValueError('Public note does not match exact adopted version')
    return {'profile': 'near-public-playbook-input-v1', 'reference': reference,
            'public_note': dict(note), 'untrusted_public_data': True,
            'requires_separate_operation_approval': True, 'operation_completed': False,
            'payment_authority': False, 'tool_authority': False}
