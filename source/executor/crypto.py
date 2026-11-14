"""Interoperable delegated record encryption; never a wallet owner credential."""
import hashlib
import json
from cryptography.hazmat.primitives import serialization
from app.worker_crypto import WorkerVault


def public_manifest(vault):
    pem=vault.private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode('ascii')
    return {'worker_public_key':pem,'worker_key_id':hashlib.sha256(pem.encode()).hexdigest(),'profile':'website-qa-v1'}


def open_record_key(vault,sealed,key_id):
    if public_manifest(vault)['worker_key_id']!=key_id:raise ValueError('A different worker key is required')
    value=vault.open_launch(sealed,vault.public_info()['key_id'])
    if set(value)!={'record_key'}:raise ValueError('Only a separate record key may be delegated')
    return value['record_key']


def private_cache_keys(vault,network,contract):
    # Stable through loss of local cache/ledger: the retained worker private key
    # reproduces the same blinded on-chain call IDs and prevents paid replay.
    material=vault.private.private_bytes(serialization.Encoding.DER,serialization.PrivateFormat.PKCS8,serialization.NoEncryption())
    context=(network+'\0'+contract).encode()
    return tuple(hashlib.sha256(domain+context+material).hexdigest() for domain in (b'proofwork-cache-v1\0',b'proofwork-call-id-v1\0'))


def committed_plaintext(vault,envelope,digest,key):
    if not isinstance(envelope,str) or hashlib.sha256(envelope.encode()).hexdigest()!=digest:raise ValueError('Ciphertext commitment mismatch')
    return vault.decrypt(envelope,key)


def json_object(text):
    value=json.loads(text)
    if not isinstance(value,dict):raise ValueError('Expected an object')
    return value
