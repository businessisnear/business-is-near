"""Explicit selected-media transfer into a reviewed worker. No model or writes.

The capsule is untrusted data. Only trusted host code supplies the pinned current
task, decrypted approved scope, company and owner. No capsule selects a path.
"""
import argparse
import base64
import copy
import json
import os
from pathlib import Path
import stat
import tempfile

from executor.media import MediaLibrary, _identifier, _hash, _provenance, _cost
from executor.portability import canonical, digest, directory, read_regular, strict_json

PROFILE = 'owner-approved-media-transfer-v1'
FIELDS = {'profile','company_id','task_id','scope_hash','media','mime_type','bytes',
          'content_base64','source_import_receipt','source_receipt_sha256','worker_associated'}
MEDIA = {'asset_id','import_id','task','backend','upload_consent'}


def exact(value, keys):
    if type(value) is not dict or set(value) != set(keys):
        raise ValueError('Exact selected media transfer fields required')
    return value


def validate_capsule(value):
    exact(value, FIELDS)
    from executor.document_store import company
    company(value['company_id']); _identifier(value['task_id']); _hash(value['scope_hash'])
    if value['profile'] != PROFILE or value['worker_associated'] is not False:
        raise ValueError('Data-only selected media capsule required')
    media=exact(value['media'], MEDIA)
    _hash(media['asset_id']); _identifier(media['import_id'])
    if (media['backend'] != 'near_ai_cloud' or media['upload_consent'] != 'EXACT_ASSET_TO_NEAR_AI'
            or media['task'] not in ('caption_visible_text_v1','transcribe_short_audio_v1')):
        raise ValueError('Exact owner asset-upload consent required')
    receipt=exact(value['source_import_receipt'], {'asset_id','provenance','cost'})
    _provenance(receipt['provenance']); _cost(receipt['cost']); _hash(value['source_receipt_sha256'])
    if receipt['asset_id'] != media['asset_id'] or digest(canonical(receipt)) != value['source_receipt_sha256']:
        raise ValueError('Exact source import receipt commitment required')
    encoded=value['content_base64']
    if type(encoded) is not str or len(encoded)>349528:
        raise ValueError('Bounded selected media bytes required')
    raw=base64.b64decode(encoded, validate=True)
    if (base64.b64encode(raw).decode() != encoded or type(value['bytes']) is not int
            or value['bytes'] != len(raw) or digest(raw) != media['asset_id']):
        raise ValueError('Selected media bytes differ from their commitment')
    if media['task'] == 'transcribe_short_audio_v1':
        from executor.audio_analysis import validate_audio
        validate_audio(raw, value['mime_type'])
    else:
        from executor.cloud_media_transport import validate_cloud_image
        validate_cloud_image(raw, value['mime_type'])
    return raw


def import_media_transfer(worker_dir, value, *, company_id, owner, task, scope):
    """Caller must obtain task/scope/owner through trusted FINAL reads + vault."""
    raw=validate_capsule(value)
    from executor.operations import validate_scope
    validate_scope(scope, 'research_summary')
    if (company_id != value['company_id'] or task.get('id') != value['task_id']
            or task.get('scope_hash') != value['scope_hash'] or task.get('approved_by') != owner
            or task.get('operation') != 'research_summary' or task.get('inbox_id') or task.get('mandate_id')
            or task.get('status') not in ('queued','awaiting_evidence') or scope.get('media') != value['media']):
        raise ValueError('Current original owner-approved media task and scope required')
    root=directory(worker_dir, private=True, create=False)
    if root.resolve() != root:
        raise ValueError('Canonical existing worker directory required')
    library=MediaLibrary(root/'media')
    fd,name=tempfile.mkstemp(prefix='selected-media-', dir=library.root)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(raw); stream.flush(); os.fsync(stream.fileno())
        media=value['media']; receipt=value['source_import_receipt']
        library.import_file(name, import_id=media['import_id'], mime_type=value['mime_type'],
                            provenance=receipt['provenance'], cost=receipt['cost'])
        actual=library.inventory()['imports'][media['import_id']]
        if canonical(actual) != canonical(receipt):
            raise ValueError('Imported media provenance changed')
        library.reuse(media['asset_id'], task['id'], scope_hash=task['scope_hash'],
                      role='approved_cloud_transfer', import_id=media['import_id'])
    finally:
        Path(name).unlink(missing_ok=True)
    return {'profile':'owner-media-worker-import-receipt-v1','company_id':company_id,
            'task_id':task['id'],'scope_hash':task['scope_hash'],**copy.deepcopy(value['media']),
            'source_receipt_sha256':value['source_receipt_sha256'],'worker_associated':True,
            'model_calls':0,'transactions':0,'provider_uploads':0}


def import_from_worker_config(config_path, capsule_path):
    from executor.main import read_config
    from app.worker_crypto import WorkerVault
    from executor.crypto import public_manifest
    from executor.rpc_gateway import RPCGateway
    from executor.operations import BusinessExecutor
    config=read_config(config_path); root=directory(config['data_dir'],private=True,create=False)
    if root.resolve()!=root:raise ValueError('Canonical existing worker required')
    for name in ('master.key','launch.pem'):
        info=(root/'vault'/name).lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_mode&0o077 or info.st_uid!=os.getuid() or info.st_nlink!=1:
            raise ValueError('Existing protected worker vault required')
    path=Path(capsule_path).absolute(); info=path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_mode&0o077 or info.st_uid!=os.getuid()
            or info.st_nlink!=1 or not 1<=info.st_size<=512*1024):
        raise ValueError('Private bounded selected-media capsule required')
    encoded,_=read_regular(path.parent,path.name,limit=512*1024); value=strict_json(encoded)
    validate_capsule(value)
    vault=WorkerVault(root/'vault'); gateway_config=config['gateway']
    if gateway_config.get('worker_key_id')!=public_manifest(vault)['worker_key_id']:
        raise ValueError('Original worker encryption identity required')
    gateway=RPCGateway(gateway_config)
    class ReadOnlyOperation:
        def __init__(self): self.vault=vault
        def _read(self,command,**args):
            if command!='execution_profile':raise ValueError('Only operation profile read is supported')
            result=gateway.call(command,**args)
            if result.get('ok') is not True:raise ValueError('Pinned operation profile unavailable')
            return result
    try:
        # Acquire the ORIGINAL journal lease: a running worker must be stopped,
        # never assigned a fresh journal, nonce or operator to bypass it.
        gateway.start()
        if gateway.pending:raise ValueError('Reconcile original pending hash before transfer')
        snapshot=gateway.snapshot(); company_id=gateway_config['contract_id']
        if company_id!=value['company_id']:raise ValueError('Capsule belongs to another company')
        result=gateway.call('company_task',id=value['task_id'])
        if result.get('ok') is not True:raise ValueError('Current approved media task unavailable')
        task={**result['task'],'id':value['task_id']}
        _,scope=BusinessExecutor._open_operation(ReadOnlyOperation(),task)
        return import_media_transfer(root,value,company_id=company_id,
                                     owner=snapshot['contract']['owner'],task=task,scope=scope)
    finally:
        gateway.close()


def main():
    parser=argparse.ArgumentParser(description=__doc__); sub=parser.add_subparsers(dest='command',required=True)
    action=sub.add_parser('import');action.add_argument('--config',required=True);action.add_argument('--capsule',required=True)
    args=parser.parse_args()
    try:
        print(json.dumps(import_from_worker_config(args.config,args.capsule)));return 0
    except Exception as error:
        print(json.dumps({'status':'selected_media_transfer_refused','error_kind':type(error).__name__,
                          'model_calls':0,'transactions':0,'provider_uploads':0}));return 2


if __name__=='__main__':raise SystemExit(main())
