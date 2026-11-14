"""Owner-authorized image observations in the existing encrypted worker path."""
from pathlib import Path

from executor.local_model import LocalModelClient, MODEL, EXPECTED_DIGEST
from executor.media import MediaLibrary


def media_staging_ready(worker_root,scope):
    """Missing separately transferred bytes defer before any AI reservation.

    Existing malformed/corrupt library state still raises rather than being
    disguised as an ordinary pending owner-to-worker transfer.
    """
    library=MediaLibrary(Path(worker_root)/'media');data=library.inventory();media=scope['media']
    return (media['asset_id'] in data['assets'] and media['import_id'] in data['imports']
            and data['imports'][media['import_id']]['asset_id']==media['asset_id'])


def generate_image_operation(scope, client, task_id, scope_hash, worker_root):
    from executor.operations import validate_artifact, validate_scope
    from executor.media_analysis import MediaAnalysis, compact_receipt, factory_from_local_client
    validate_scope(scope, 'research_summary')
    cloud=scope.get('media',{}).get('backend')=='near_ai_cloud'
    from app.near_ai_client import NearAIClient
    if 'media' not in scope or not isinstance(client, NearAIClient if cloud else LocalModelClient):
        raise ValueError('Approved image observations require the explicit local Gemma backend')
    root = Path(worker_root)
    if not root.is_absolute() or root.resolve() != root:
        raise ValueError('Canonical private worker root required')
    approval = {'operation_id': task_id, 'scope_hash': scope_hash, **scope['media']}
    if 'locale' in scope:
        approval['requested_locale'] = scope['locale']
    kind='audio' if scope['media']['task']=='transcribe_short_audio_v1' else 'image'
    if cloud:
        from app.cloud_media_client import CloudMediaClient
        result=CloudMediaClient(client).analyze(MediaLibrary(root/'media'),approval,task_id,task_id)
    else:
        analysis = MediaAnalysis(root / ('audio-analysis' if kind=='audio' else 'media-analysis'), MediaLibrary(root / 'media'),
                                factory_from_local_client(client),media_kind=kind)
        result = analysis.analyze(task_id, approval, task_id)
    if result.get('ok') is not True:
        raise ValueError('Image observation is unresolved or refused; no automatic inference retry')
    observation = result['observation']
    if kind=='audio':
        from executor.audio_analysis import compact_receipt as audio_receipt
        artifact={'title':'Private audio transcript','summary':observation['transcript'] or 'No intelligible speech was reported.',
                  'items':[{'text':'Transcript remains unverified; original audio SHA-256 '+scope['media']['asset_id'],'source_ids':['audio_source']},
                           {'text':'Uncertainty: '+observation['uncertainty'],'source_ids':['audio_source']}]}
        validate_artifact(artifact,scope)
        if cloud:return cloud_operation(result,scope,scope_hash,artifact)
        return {'artifact':artifact,'generation':{'mode':'local_ollama','model':MODEL,'model_digest':EXPECTED_DIGEST,'cached':result['cached'],'authorization_model':result['authorization_model'],'cloud_provider_charge_nanos':0,'local_compute_cost_unknown':True},'media':{'receipt':audio_receipt(result),'observation':observation}}
    artifact = {'title': 'Private image observations', 'summary': observation['caption'],
                'items': [{'text': ('Visible text: ' + observation['visible_text'])[:300]
                          if observation['visible_text'] else 'No readable text was reported.',
                           'source_ids': ['image_source']},
                          {'text': ('Uncertainty: ' + observation['uncertainty'])[:300],
                           'source_ids': ['image_source']}]}
    validate_artifact(artifact, scope)
    if cloud:return cloud_operation(result,scope,scope_hash,artifact)
    receipt = compact_receipt(result)
    # Full provenance/import receipts and detailed provider telemetry remain in
    # the durable private analysis journal. Commit their exact hash, not a copy
    # of every field, within the unchanged encrypted-record size ceiling.
    for key in ('source_provenance', 'source_import_cost', 'reported_capabilities', 'reported_duration_nanos', 'observation'):
        receipt.pop(key, None)
    return {'artifact': artifact,
            'generation': {'mode': 'local_ollama', 'model': MODEL,
                           'model_digest': EXPECTED_DIGEST, 'cached': result['cached'],
                           'authorization_model': result['authorization_model'],
                           'cloud_provider_charge_nanos': 0, 'local_compute_cost_unknown': True},
            'media': {'receipt': receipt, 'observation': observation}}


def cloud_operation(result,scope,scope_hash,artifact):
    from executor.claims import canonical,_digest
    identity=result['identity']
    receipt={'format':'near-ai-cloud-media-receipt-v1','execution_backend':'near_ai_cloud_unattested',
        'model':result['model'],'task':identity['task'],'scope_hash':scope_hash,
        'source_asset_sha256':identity['asset_id'],'import_id':identity['import_id'],
        'input':identity['media'],'source_receipt_sha256':identity['source_receipt_sha256'],
        'observation_sha256':_digest(canonical(result['observation'])),'raw_response_sha256':result['raw_response_sha256'],
        'usage':result['usage'],'reserved_nanos':result['reserved_nanos'],
        'estimated_provider_nanos':result['estimated_provider_nanos'],'actual_provider_charge_nanos':None,
        'provider_billing_verified':False,'verified_attestation':False,'cached':result['cached']}
    if 'locale' in scope:receipt['requested_locale']=scope['locale']
    return {'artifact':artifact,'generation':{'mode':'near_ai_cloud_unattested','model':result['model'],'cached':result['cached']},
            'media':{'receipt':receipt,'observation':result['observation']}}
