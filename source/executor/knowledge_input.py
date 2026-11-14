"""Consume one explicitly adopted public note as untrusted operation data.

The worker's private registry pin supplies only receiver/code identity. Network
identity and the endpoint come from its existing trusted gateway configuration.
Nothing in an operation, public note, model response or source URI can select a
network, receiver, RPC method, file, tool, payment or training operation.
"""
import base64
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import ssl
import stat
import time
from urllib.parse import urlsplit

from executor.knowledge import ACCOUNT, HASH, resolve_operation_input, validate_reference


RECEIPT_PROFILE = 'near-public-playbook-receipt-v1'
SOURCE_ID = 'adopted_note'
POLICY_NAME = 'knowledge-registry.json'
MAX_REPLY = 65536
TIMEOUT = 8
READ_METHODS = frozenset(('state', 'operation_reference', 'eligible_publication'))
ORDINARY_OPERATIONS = frozenset(('research_summary', 'website_build', 'content_draft', 'support_draft',
                                 'outreach_draft', 'social_draft', 'ads_draft', 'analytics_report'))
DEFERRABLE = frozenset(('revoked', 'consumer_not_opted_in', 'publisher_not_opted_in', 'registry_not_configured'))
ELIGIBILITY_DEFERRABLE = DEFERRABLE - {'registry_not_configured'}
_BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
_RECEIPT_FIELDS = frozenset(('profile', 'scope_sha256', 'reference_sha256',
                            'sources_sha256', 'publication_sha256', 'registry_id',
                            'code_hash', 'final', 'license', 'attribution', 'source_uri',
                            'untrusted_public_data', 'authority', 'training', 'private_reads'))


class KnowledgeInputError(ValueError):
    """Unknown, malformed or identity-changing input; halt the worker."""


class KnowledgeDeferred(ValueError):
    """Verified current consent/revocation refusal; review only this task."""
    def __init__(self, reason):
        if reason not in DEFERRABLE:
            raise KnowledgeInputError('Unrecognized public input refusal')
        self.reason = reason
        super().__init__('Public input requires owner review: ' + reason)


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(',', ':'), allow_nan=False)


def _hash(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _strict_json(raw):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                raise KnowledgeInputError('Duplicate public input JSON field')
            value[key] = item
        return value
    def invalid(_):
        raise KnowledgeInputError('Nonfinite public input JSON number')
    try:
        return json.loads(raw, object_pairs_hook=pairs, parse_constant=invalid)
    except (ValueError, UnicodeError, RecursionError):
        raise KnowledgeInputError('Invalid bounded public input JSON') from None


def _account(value):
    if not isinstance(value, str) or ACCOUNT.fullmatch(value) is None:
        raise KnowledgeInputError('Valid public input account required')


def _digest(value):
    if not isinstance(value, str) or HASH.fullmatch(value) is None:
        raise KnowledgeInputError('Public input SHA-256 required')


def _chain_id(value):
    if not isinstance(value, str) or re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,63}', value) is None:
        raise KnowledgeInputError('Exact trusted chain ID required')
    return value


def _base58_hash(value):
    if not isinstance(value, str) or not 32 <= len(value) <= 44 or any(c not in _BASE58 for c in value):
        raise KnowledgeInputError('Canonical chain hash required')
    number = 0
    for char in value:
        number = number * 58 + _BASE58.index(char)
    size = (number.bit_length() + 7) // 8
    if len(value) - len(value.lstrip('1')) + size != 32:
        raise KnowledgeInputError('Exact 32-byte chain hash required')


def _u64(value):
    if (not isinstance(value, str) or re.fullmatch(r'[1-9][0-9]{0,19}', value) is None or
            int(value) > 18446744073709551615):
        raise KnowledgeInputError('Canonical public input chain timestamp required')


def load_registry_policy(path):
    """Read the fixed 0600 policy through its owned private directory handle."""
    path = Path(path)
    if not path.is_absolute() or path.name != POLICY_NAME:
        raise KnowledgeInputError('Fixed absolute public registry policy required')
    directory = None
    file_fd = None
    try:
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        parent = os.fstat(directory)
        if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid() or parent.st_mode & 0o077:
            raise KnowledgeInputError('Public registry policy directory must be private and owner-controlled')
        try:
            file_fd = os.open(POLICY_NAME, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory)
        except FileNotFoundError:
            raise KnowledgeDeferred('registry_not_configured') from None
        before = os.fstat(file_fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid() or
                stat.S_IMODE(before.st_mode) != 0o600 or before.st_nlink != 1 or before.st_size > 1024):
            raise KnowledgeInputError('Public registry policy must be an owner-owned 0600 regular file')
        with os.fdopen(file_fd, 'rb', closefd=False) as stream:
            raw = stream.read(1025)
        after = os.fstat(file_fd)
        fields = ('st_dev', 'st_ino', 'st_size', 'st_mtime_ns', 'st_ctime_ns')
        if len(raw) > 1024 or any(getattr(before, field) != getattr(after, field) for field in fields):
            raise KnowledgeInputError('Public registry policy changed while reading')
        policy = _strict_json(raw)
    except OSError:
        raise KnowledgeInputError('Protected public registry policy unavailable') from None
    finally:
        if file_fd is not None:
            os.close(file_fd)
        if directory is not None:
            os.close(directory)
    if not isinstance(policy, dict) or set(policy) != {'registry_id', 'expected_code_hash'}:
        raise KnowledgeInputError('Public registry policy permits only fixed receiver and code hash')
    _account(policy['registry_id'])
    _base58_hash(policy['expected_code_hash'])
    return policy


def validate_knowledge_scope(scope):
    """Validate the inert extension; ordinary scope validation remains separate."""
    if (not isinstance(scope, dict) or scope.get('profile') != 'business-operations-v1' or
            not isinstance(scope.get('operation'), str) or scope['operation'] not in ORDINARY_OPERATIONS or
            any(key in scope for key in ('control', 'control_ref', 'media', 'engineering'))):
        raise KnowledgeInputError('Public input requires an ordinary owner-approved artifact operation')
    if 'locale' in scope:
        from executor.localization import validate_locale
        try:
            validate_locale(scope['locale'])
        except ValueError:
            raise KnowledgeInputError('Public input language must be the owner-selected en/es enum') from None
    knowledge = scope.get('knowledge')
    if not isinstance(knowledge, dict) or set(knowledge) != {'reference'}:
        raise KnowledgeInputError('Exact public knowledge reference extension required')
    reference = knowledge['reference']
    if not isinstance(reference, dict):
        raise KnowledgeInputError('Exact public knowledge reference required')
    try:
        validate_reference(reference, registry_id=reference.get('registry_id'), consumer_id=reference.get('consumer_id'))
    except ValueError:
        raise KnowledgeInputError('Invalid exact public knowledge reference') from None
    sources = scope.get('sources')
    if not isinstance(sources, list) or len(sources) != 1:
        raise KnowledgeInputError('The sole source must be the exact whole adopted_note')
    for source in sources:
        if (not isinstance(source, dict) or set(source) != {'id', 'text'} or
                not isinstance(source['id'], str) or re.fullmatch(r'[a-z][a-z0-9_]{0,23}', source['id']) is None or
                not isinstance(source['text'], str) or not source['text'].strip() or len(source['text']) > 600 or
                any((ord(c) < 32 and c not in '\n\t') or ord(c) == 127 or 0xd800 <= ord(c) <= 0xdfff for c in source['text'])):
            raise KnowledgeInputError('Public input permits bounded supplied text sources only')
    if len({source['id'] for source in sources}) != len(sources):
        raise KnowledgeInputError('Duplicate public input source ID')
    adopted = [source for source in sources if source['id'] == SOURCE_ID]
    if len(adopted) != 1 or _hash(adopted[0]['text']) != reference['content_sha256']:
        raise KnowledgeInputError('Exact whole adopted_note source required; notes over 600 characters need separate owner review')
    return scope


class FinalRegistryReader:
    """Fixed read-only RPC queries, pinned to one actual FINAL block per use."""
    def __init__(self, gateway_config, policy, *, sandbox=False):
        if not isinstance(gateway_config, dict):
            raise KnowledgeInputError('Trusted worker gateway configuration required')
        network = gateway_config.get('network')
        endpoint = gateway_config.get('rpc_url')
        if network == 'testnet':
            if endpoint != 'https://rpc.testnet.near.org':
                raise KnowledgeInputError('Public input requires the fixed official testnet RPC')
            self.chain_id = 'testnet'
            if gateway_config.get('chain_id', 'testnet') != 'testnet':
                raise KnowledgeInputError('Trusted testnet chain ID mismatch')
        elif network == 'sandbox' and sandbox is True:
            if not isinstance(endpoint, str) or re.fullmatch(r'http://127\.0\.0\.1:[1-9][0-9]{0,4}', endpoint) is None:
                raise KnowledgeInputError('Explicit sandbox numeric loopback RPC required')
            self.chain_id = _chain_id(gateway_config.get('chain_id'))
        else:
            raise KnowledgeInputError('Public input supports only pinned testnet or explicit local sandbox')
        self.endpoint = urlsplit(endpoint)
        try:
            port = self.endpoint.port
        except ValueError:
            raise KnowledgeInputError('Invalid trusted RPC port') from None
        if not 1 <= (port or 443) <= 65535:
            raise KnowledgeInputError('Invalid trusted RPC port')
        if not isinstance(policy, dict) or set(policy) != {'registry_id', 'expected_code_hash'}:
            raise KnowledgeInputError('Exact fixed registry policy required')
        _account(policy['registry_id']); _base58_hash(policy['expected_code_hash'])
        self.registry_id = policy['registry_id']
        self.code_hash = policy['expected_code_hash']
        status = self._rpc('status', {})
        if not isinstance(status, dict) or status.get('chain_id') != self.chain_id:
            raise KnowledgeInputError('Public registry RPC chain mismatch')
        block = self._rpc('block', {'finality': 'final'})
        header = block.get('header') if isinstance(block, dict) else None
        if not isinstance(header, dict):
            raise KnowledgeInputError('Actual FINAL registry block required')
        _base58_hash(header.get('hash'))
        if type(header.get('height')) is not int or not 0 <= header['height'] <= 9007199254740991:
            raise KnowledgeInputError('Exact FINAL registry block height required')
        _u64(header.get('timestamp_nanosec'))
        self.block_hash, self.block_height = header['hash'], header['height']
        self.timestamp = header['timestamp_nanosec']
        account = self._query({'request_type': 'view_account', 'account_id': self.registry_id})
        if account.get('code_hash') != self.code_hash:
            raise KnowledgeInputError('Pinned public registry deployed code mismatch')
        state = self('state', {})
        if (not isinstance(state, dict) or state.get('profile') != 'near-public-playbook-registry-v1' or
                state.get('registry_id') != self.registry_id or
                any(state.get(field) is not False for field in (
                    'default_publication_enabled', 'default_adoption_enabled', 'private_company_reads',
                    'model_training', 'payment_authority', 'tool_authority', 'operation_completion'))):
            raise KnowledgeInputError('Pinned public registry identity or authority markers mismatch')

    def _rpc(self, method, params):
        if method not in ('status', 'block', 'query'):
            raise KnowledgeInputError('Unsupported read-only public registry RPC')
        connection = None
        try:
            # http.client never consumes proxy variables, cookies or auth state,
            # and does not follow redirects. All request values are public.
            if self.endpoint.scheme == 'https':
                connection = http.client.HTTPSConnection(self.endpoint.hostname, self.endpoint.port or 443,
                                                         timeout=TIMEOUT, context=ssl.create_default_context())
            else:
                connection = http.client.HTTPConnection(self.endpoint.hostname, self.endpoint.port, timeout=TIMEOUT)
            request = canonical({'jsonrpc': '2.0', 'id': 'knowledge-read-v1', 'method': method, 'params': params}).encode()
            deadline = time.monotonic() + TIMEOUT
            connection.request('POST', '/', body=request, headers={
                'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Encoding': 'identity',
                'Connection': 'close'})
            socket = connection.sock
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise KnowledgeInputError('Public registry RPC deadline exceeded')
            if socket is not None:
                socket.settimeout(remaining)
            response = connection.getresponse()
            length = response.getheader('Content-Length')
            if (response.status != 200 or response.getheader('Content-Encoding', 'identity') != 'identity' or
                    length is not None and (not length.isdigit() or int(length) > MAX_REPLY)):
                raise KnowledgeInputError('Bounded public registry RPC response refused')
            chunks, total = [], 0
            while not response.isclosed():
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise KnowledgeInputError('Public registry RPC deadline exceeded')
                if socket is not None:
                    socket.settimeout(remaining)
                chunk = response.read1(min(4096, MAX_REPLY + 1 - total))
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_REPLY:
                    raise KnowledgeInputError('Public registry RPC response exceeds bound')
                chunks.append(chunk)
            if length is not None and total != int(length):
                raise KnowledgeInputError('Truncated public registry RPC response refused')
            payload = _strict_json(b''.join(chunks))
            if (not isinstance(payload, dict) or payload.get('jsonrpc') != '2.0' or
                    payload.get('id') != 'knowledge-read-v1' or set(payload) != {'jsonrpc', 'id', 'result'}):
                raise KnowledgeInputError('Public registry RPC result unavailable')
            return payload['result']
        except (OSError, http.client.HTTPException, ValueError) as error:
            if isinstance(error, KnowledgeInputError):
                raise
            raise KnowledgeInputError('Public registry RPC read failed') from None
        finally:
            if connection is not None:
                connection.close()

    def _query(self, args):
        value = self._rpc('query', {**args, 'block_id': self.block_hash})
        if (not isinstance(value, dict) or value.get('block_hash') != self.block_hash or
                type(value.get('block_height')) is not int or value['block_height'] != self.block_height):
            raise KnowledgeInputError('Public registry FINAL block boundary drift')
        return value

    def __call__(self, method, args):
        if method not in READ_METHODS:
            raise KnowledgeInputError('Unsupported fixed public registry view')
        expected = {'state': set(), 'operation_reference': {'consumer_id', 'adoption_id'},
                    'eligible_publication': {'consumer_id', 'publisher_id', 'playbook_id', 'version', 'publication_sha256'}}
        if not isinstance(args, dict) or set(args) != expected[method]:
            raise KnowledgeInputError('Unexpected fixed public registry view arguments')
        value = self._query({'request_type': 'call_function', 'account_id': self.registry_id,
                             'method_name': method,
                             'args_base64': base64.b64encode(canonical(args).encode()).decode('ascii')})
        raw = value.get('result')
        if (not isinstance(raw, list) or len(raw) > 16384 or
                any(type(byte) is not int or not 0 <= byte <= 255 for byte in raw)):
            raise KnowledgeInputError('Bounded public registry view bytes required')
        return _strict_json(bytes(raw))


def _receipt(scope, scope_hash, reader, note):
    reference = scope['knowledge']['reference']
    receipt = {'profile': RECEIPT_PROFILE, 'scope_sha256': scope_hash,
               'reference_sha256': _hash(canonical(reference)),
               'sources_sha256': _hash(canonical(scope['sources'])),
               'publication_sha256': reference['publication_sha256'],
               'registry_id': reader.registry_id, 'code_hash': reader.code_hash,
               'final': {'chain_id': reader.chain_id, 'block_hash': reader.block_hash, 'block_height': reader.block_height},
               'license': note['license'], 'attribution': note['publisher_id'], 'source_uri': note['source_uri'],
               'untrusted_public_data': True, 'authority': False, 'training': False, 'private_reads': False}
    return validate_knowledge_receipt(receipt, scope, scope_hash)


def resolve_knowledge_input(scope, *, gateway_config, policy_path, company_owner, scope_hash, sandbox=False):
    """Resolve/revalidate before work or attestation; performs only public reads.

    The caller must already validate the owner-signed company operation and its
    encrypted scope commitment. Registry adoption alone grants no company power.
    This returns evidence of bounded reads, never semantic fact verification or
    an atomic guarantee that consent cannot change after the returned block.
    """
    validate_knowledge_scope(scope)
    _account(company_owner); _digest(scope_hash)
    policy = load_registry_policy(policy_path)
    reference = scope['knowledge']['reference']
    try:
        validate_reference(reference, registry_id=policy['registry_id'], consumer_id=company_owner)
    except ValueError:
        raise KnowledgeInputError('Public input registry or actual company owner mismatch') from None
    reader = FinalRegistryReader(gateway_config, policy, sandbox=sandbox)
    args = {'consumer_id': company_owner, **{key: reference[key] for key in (
        'publisher_id', 'playbook_id', 'version', 'publication_sha256')}}
    # This structured policy view must precede operation_reference, whose
    # contract assertion is deliberately not parsed as a revocation signal.
    status = reader('eligible_publication', args)
    if (not isinstance(status, dict) or set(status) != {'eligible', 'reason', 'publication', 'observed_at'} or
            type(status['eligible']) is not bool or status['observed_at'] != reader.timestamp):
        raise KnowledgeInputError('Typed pinned public eligibility result required')
    if status['eligible'] is False:
        if status['publication'] is None and isinstance(status['reason'], str) and status['reason'] in ELIGIBILITY_DEFERRABLE:
            raise KnowledgeDeferred(status['reason'])
        raise KnowledgeInputError('Public eligibility identity/hash drift or unexplained refusal')
    if status['reason'] != 'eligible' or not isinstance(status['publication'], dict):
        raise KnowledgeInputError('Exact eligible public publication required')
    def pinned(method, values):
        if method == 'eligible_publication':
            if values != args:
                raise KnowledgeInputError('Public eligibility arguments changed')
            return status
        return reader(method, values)
    try:
        resolved = resolve_operation_input(pinned, reference, registry_id=policy['registry_id'],
                                           consumer_id=company_owner, owner_approved_operation_input=True)
    except ValueError:
        raise KnowledgeInputError('Adopted public reference/content/provenance/license changed') from None
    note = resolved['public_note']
    source = next(source for source in scope['sources'] if source['id'] == SOURCE_ID)
    if source['text'] != note['content'] or len(note['content']) > 600:
        raise KnowledgeInputError('Exact whole public note exceeds source capacity or differs from approved source')
    return _receipt(scope, scope_hash, reader, note)


def validate_knowledge_receipt(receipt, scope, scope_hash):
    """Check encrypted offline evidence consistency; does not check live consent."""
    validate_knowledge_scope(scope); _digest(scope_hash)
    reference = scope['knowledge']['reference']
    if not isinstance(receipt, dict) or set(receipt) != _RECEIPT_FIELDS:
        raise KnowledgeInputError('Exact bounded public knowledge receipt required')
    expected = {'profile': RECEIPT_PROFILE, 'scope_sha256': scope_hash,
                'reference_sha256': _hash(canonical(reference)),
                'sources_sha256': _hash(canonical(scope['sources'])),
                'publication_sha256': reference['publication_sha256'], 'registry_id': reference['registry_id'],
                'attribution': reference['publisher_id'], 'untrusted_public_data': True,
                'authority': False, 'training': False, 'private_reads': False}
    if any(type(receipt[key]) is not type(value) or receipt[key] != value for key, value in expected.items()):
        raise KnowledgeInputError('Public knowledge receipt scope/source/authority commitment changed')
    _base58_hash(receipt['code_hash'])
    final = receipt['final']
    if not isinstance(final, dict) or set(final) != {'chain_id', 'block_hash', 'block_height'}:
        raise KnowledgeInputError('Exact public knowledge FINAL boundary required')
    _chain_id(final['chain_id']); _base58_hash(final['block_hash'])
    if type(final['block_height']) is not int or not 0 <= final['block_height'] <= 9007199254740991:
        raise KnowledgeInputError('Exact public knowledge FINAL height required')
    if receipt['license'] not in ('CC0-1.0', 'CC-BY-4.0'):
        raise KnowledgeInputError('Supported public knowledge license required')
    uri = receipt['source_uri']
    if (not isinstance(uri, str) or not uri.strip() or
            any((ord(c) < 32 and c not in '\n\t') or ord(c) == 127 or 0xd800 <= ord(c) <= 0xdfff for c in uri) or
            len(uri.encode('utf-8')) > 256):
        raise KnowledgeInputError('Bounded descriptive public knowledge source URI required')
    if len(canonical(receipt).encode()) > 1200:
        raise KnowledgeInputError('Public knowledge receipt exceeds 1200-byte encrypted payload budget')
    return receipt


def same_knowledge_input(previous, current):
    """Permit a fresh FINAL boundary while preserving every source binding."""
    return (isinstance(previous, dict) and isinstance(current, dict) and
            isinstance(previous.get('final'), dict) and isinstance(current.get('final'), dict) and
            previous['final'].get('chain_id') == current['final'].get('chain_id') and
            {key: value for key, value in previous.items() if key != 'final'} ==
            {key: value for key, value in current.items() if key != 'final'})


def validate_knowledge_evidence(payload, scope, scope_hash):
    """Bind offline/cached provenance to the whole approved supplied source."""
    if (not isinstance(payload, dict) or payload.get('profile') != scope.get('profile') or
            payload.get('operation') != scope.get('operation') or payload.get('delivery') != 'private_artifact_only'):
        raise KnowledgeInputError('Public knowledge evidence must remain an ordinary private artifact')
    receipt = validate_knowledge_receipt(payload.get('knowledge_receipt'), scope, scope_hash)
    expected = [{'id': SOURCE_ID, 'sha256': _hash(scope['sources'][0]['text'])}]
    if payload.get('sources') != expected:
        raise KnowledgeInputError('Public knowledge evidence source SHA-256 differs from the exact approved text')
    return receipt
