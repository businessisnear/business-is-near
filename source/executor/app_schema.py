"""Deterministic, unsigned preparation for the bounded native public-record template.

No model calls, network, deployment, account keys, dependency installation or commands.
The chain's fresh quote and explicit owner wallet transaction remain authoritative.
"""
from __future__ import annotations

import hashlib
import base64
import json
import re
from typing import Any

PROFILE = 'near-native-public-app-v1'
ACK = 'PUBLIC_NONSECRET_PERMANENT'
RESERVED = frozenset(('owner admin role auth account account_id record_id schema schema_hash '
    'schema_version revision payer payee amount price balance money payment deposit storage '
    'storage_collected cash escrow revenue operator supplier method contract_id public_key '
    'private_key secret_key constructor prototype __proto__').split())
ABI = {
    'views': ['schema_info', 'record_quote', 'get_record', 'list_records', 'migration_quote',
              'migration_status', 'state'],
    'calls': ['create_record', 'update_record', 'begin_migration', 'migrate_batch'],
    'initialization': 'init',
    'template_source': 'contract/onchain/app.ts',
    'template_wasm': 'contract/build/app.wasm',
}
LIMITS = {'fields': 8, 'accounts': 16, 'rows': 64, 'rows_per_account': 8,
          'string_utf8_bytes': 128, 'int_absolute': 1_000_000_000,
          'migration_batch_rows': 4, 'schema_version': 32,
          'sealed_fields': 1, 'sealed_envelope_utf8_bytes': 2048,
          'client_plaintext_utf8_bytes': 256}


def validate_sealed_value(value: Any) -> str:
    """Validate public ciphertext syntax only; the contract never decrypts it."""
    if type(value) is not str or len(value.encode('utf-8')) > 2048:
        raise ValueError('sealedtext must fit 2048 UTF-8 bytes')
    if value == '':
        return value
    try:
        envelope = json.loads(value)
        _exact(envelope, {'v', 'alg', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext'})
        if (type(envelope['v']) is not int or envelope['v'] != 1 or
                envelope['alg'] != 'AES-256-GCM' or envelope['kdf'] != 'PBKDF2-SHA256' or
                type(envelope['iterations']) is not int or envelope['iterations'] != 600000 or
                _canonical(envelope) != value or list(envelope) !=
                ['v', 'alg', 'kdf', 'iterations', 'salt', 'iv', 'ciphertext']):
            raise ValueError('unsupported sealedtext envelope')
        decoded = {}
        for name in ('salt', 'iv', 'ciphertext'):
            field = envelope[name]
            if type(field) is not str:
                raise ValueError('canonical base64 required')
            decoded[name] = base64.b64decode(field, validate=True)
            if base64.b64encode(decoded[name]).decode() != field:
                raise ValueError('canonical base64 required')
        if len(decoded['salt']) != 16 or len(decoded['iv']) != 12 or len(decoded['ciphertext']) < 16:
            raise ValueError('invalid sealedtext dimensions')
    except (ValueError, TypeError, KeyError, UnicodeError) as exc:
        raise ValueError('invalid sealedtext envelope') from exc
    return value


def _canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':'))


def _exact(value: Any, names: set[str]) -> None:
    if type(value) is not dict or set(value) != names:
        raise ValueError('exact typed object fields required')


def _scalar(kind: str, value: Any) -> None:
    if kind == 'shortstring':
        if type(value) is not str:
            raise ValueError('shortstring must be text')
        try:
            encoded = value.encode('utf-8')
        except UnicodeEncodeError as exc:
            raise ValueError('invalid Unicode') from exc
        if len(encoded) > 128 or any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError('shortstring must fit 128 UTF-8 bytes without controls')
    elif kind == 'int':
        if type(value) is not int or abs(value) > 1_000_000_000:
            raise ValueError('int must be within +/-1000000000')
    elif kind == 'bool':
        if type(value) is not bool:
            raise ValueError('bool must be boolean')
    elif kind == 'sealedtext':
        validate_sealed_value(value)
    else:
        raise ValueError('unsupported field type')


def prepare_schema(schema: Any) -> dict:
    """Validate without sorting/repairing input; hash exactly the chain's typed format."""
    _exact(schema, {'version', 'fields'})
    if type(schema['version']) is not int or not 1 <= schema['version'] <= 32:
        raise ValueError('schema version must be 1..32')
    fields = schema['fields']
    if type(fields) is not list or not 1 <= len(fields) <= 8:
        raise ValueError('schema must have 1..8 fields')
    prior = ''
    copied = []
    for field in fields:
        _exact(field, {'name', 'type', 'default'})
        name, kind = field['name'], field['type']
        if (type(name) is not str or not re.fullmatch(r'[a-z][a-z0-9_]{0,23}', name)
                or name in RESERVED or any(token in RESERVED for token in name.split('_'))):
            raise ValueError('protected or invalid schema field')
        if name <= prior:
            raise ValueError('schema fields must be sorted and unique')
        prior = name
        _scalar(kind, field['default'])
        if kind == 'sealedtext' and field['default'] != '':
            raise ValueError('sealedtext schema default must be empty')
        copied.append({'name': name, 'type': kind, 'default': field['default']})
    if sum(field['type'] == 'sealedtext' for field in copied) > 1:
        raise ValueError('one sealedtext field per schema')
    clean = {'version': schema['version'], 'fields': copied}
    canonical = _canonical(['near-native-public-app-schema-v1', clean['version'],
                            [[f['name'], f['type'], f['default']] for f in copied]])
    return {'schema': clean, 'schema_hash': hashlib.sha256(canonical.encode()).hexdigest(),
            'canonical_schema': canonical, 'unsigned': True, 'model_calls': 0}


def prepare_migration(current_schema: Any, target_schema: Any, row_count: int) -> dict:
    old, new = prepare_schema(current_schema), prepare_schema(target_schema)
    if type(row_count) is not int or not 0 <= row_count <= 64:
        raise ValueError('bounded actual chain row count required')
    if new['schema']['version'] != old['schema']['version'] + 1:
        raise ValueError('migration version must increment exactly one')
    old_fields = old['schema']['fields']
    new_fields = {field['name']: field for field in new['schema']['fields']}
    if len(new_fields) <= len(old_fields):
        raise ValueError('migration must only add fields')
    for field in old_fields:
        # Typed comparison: Python True == 1 must not weaken the schema check.
        if field['name'] not in new_fields or _canonical(field) != _canonical(new_fields[field['name']]):
            raise ValueError('destructive migration denied: old fields/defaults must be unchanged')
    migration_id = hashlib.sha256(_canonical(['near-native-public-app-migration-v1',
        old['schema_hash'], new['schema_hash'], row_count]).encode()).hexdigest()
    old_names = {f['name'] for f in old_fields}
    return {'profile': PROFILE, 'from_hash': old['schema_hash'], 'to_hash': new['schema_hash'],
            'migration_id': migration_id, 'row_count': row_count,
            'added_fields': [f for f in new['schema']['fields'] if f['name'] not in old_names],
            'unsigned': True, 'requires_fresh_chain_quote': True,
            'requires_owner_transaction': True, 'destructive': False,
            'business_revenue_yocto': '0', 'model_calls': 0}


def _account(value: Any) -> None:
    if (type(value) is not str or not 2 <= len(value) <= 64
            or not re.fullmatch(r'[a-z0-9]+(?:[._-][a-z0-9]+)*', value)):
        raise ValueError('valid NEAR account required')


def prepare_review(schema: Any, contract_id: str) -> dict:
    _account(contract_id)
    prepared = prepare_schema(schema)
    return {**prepared, 'profile': PROFILE, 'contract_id': contract_id, 'abi': ABI,
            'limits': LIMITS, 'public_nonsecret_ack': ACK, 'unsigned': True,
            'storage': {'retained': True, 'refundable': False, 'withdrawable': False,
                        'requires_fresh_chain_quote': True, 'business_revenue_yocto': '0'},
            'public_plaintext': True, 'encryption': False, 'erasure': False,
            'client_sealed_fields': sum(f['type'] == 'sealedtext' for f in prepared['schema']['fields']),
            'privacy_boundary': 'Public metadata/raw values; sealedtext is client-prepared ciphertext. No contract encryption or decryption.',
            'payment_authority': False, 'requires_explicit_wallet_transaction': True}


def prepare_source_bundle(schema: Any, contract_id: str, *, source_sha256: str,
                          wasm_sha256: str) -> dict:
    """Return inert static source + review manifest; trusted caller pins actual files.

    This form only prepares a record_quote request. It does not connect a wallet,
    sign, deploy, install dependencies, execute model text or submit transactions.
    """
    review = prepare_review(schema, contract_id)
    for pin in (source_sha256, wasm_sha256):
        if type(pin) is not str or not re.fullmatch(r'[0-9a-f]{64}', pin):
            raise ValueError('actual trusted template source/WASM SHA-256 pins required')
    manifest = {**review, 'template_source_sha256': source_sha256,
                'template_wasm_sha256': wasm_sha256,
                'generated_by': 'deterministic native public-record template',
                'ai_generated': False, 'wallet_connected': False}
    # Escape HTML delimiters even inside the inert JSON script element.
    embedded = _canonical(manifest).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    page = '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Public NEAR record draft</title>
<style>body{font:16px system-ui;max-width:54rem;margin:3rem auto;padding:1rem;background:#101b24;color:#eef5f5}label{display:block;margin:1rem 0}input{display:block;padding:.6rem;max-width:100%}button{padding:.8rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}code{color:#90e2cf}</style>
<h1>Public NEAR record draft</h1><p>Public nonsecret records only. Chain history is permanent. This local form prepares unsigned JSON. Review the deployed contract and get its fresh storage quote before any wallet approval.</p>
<p id="identity"></p><form id="draft"><label>Your NEAR account<input id="principal" required></label><label>Record ID<input id="record" required pattern="[a-z][a-z0-9_-]{0,31}"></label><div id="fields"></div><button>Prepare unsigned quote request</button></form><pre id="output"></pre>
<script id="manifest" type="application/json">''' + embedded + '''</script>
<script>
'use strict';const manifest=JSON.parse(document.getElementById('manifest').textContent);document.getElementById('identity').textContent='Contract: '+manifest.contract_id+' | schema SHA-256: '+manifest.schema_hash+' | ABI source: '+manifest.abi.template_source;
for(const field of manifest.schema.fields){const label=document.createElement('label');label.textContent=field.name+' ('+field.type+')';const input=document.createElement('input');input.name=field.name;input.dataset.kind=field.type;input.type=field.type==='bool'?'checkbox':field.type==='int'?'number':'text';if(field.type==='bool')input.checked=field.default;else input.value=String(field.default);if(field.type==='int'){input.min='-1000000000';input.max='1000000000';input.step='1';}label.append(input);document.getElementById('fields').append(label);}
document.getElementById('draft').addEventListener('submit',event=>{event.preventDefault();const data={};for(const input of document.querySelectorAll('#fields input'))data[input.name]=input.dataset.kind==='bool'?input.checked:input.dataset.kind==='int'?Number(input.value):input.value;document.getElementById('output').textContent=JSON.stringify({unsigned:true,receiver_id:manifest.contract_id,method:'record_quote',args:{account_id:document.getElementById('principal').value,record_id:document.getElementById('record').value,data,schema_hash:manifest.schema_hash},template_source_sha256:manifest.template_source_sha256,template_wasm_sha256:manifest.template_wasm_sha256},null,2);});
</script></html>'''
    return {'manifest': manifest, 'files': {'index.html': page,
            'native-app-manifest.json': json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'},
            'unsigned': True, 'remote_actions': 0, 'model_calls': 0}
