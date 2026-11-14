"""Exact owner-approved excerpts from matching private company document bytes."""
import argparse
import base64
import json
from pathlib import Path
import sys
from executor.document_store import (PROFILE,FORMATS,MAX_RAW,MAX_TEXT,DocumentStore,DocumentDeferred,
                                     canonical,digest,exact,sha,company,read_private)
from executor.localization import scope_locale

OPERATIONS=('research_summary','website_build','content_draft','support_draft','outreach_draft','social_draft','ads_draft','analytics_report')
RECEIPT='owner-document-receipt-v1'

def excerpt_text(value):
    if not isinstance(value,str) or not value.lstrip('\ufeff').strip() or len(value)>600 or any(ord(c)<32 and c not in '\n\r\t' or ord(c)==127 for c in value):raise ValueError('Exact bounded document excerpt required')
    value.encode('utf-8');return value

def validate_document_scope(scope,company_id=None):
    if not isinstance(scope,dict):raise ValueError('Typed document scope required')
    exact(scope,('profile','operation','brief','context','sources','use_ai','documents')+(('locale',) if 'locale' in scope else ()))
    ref=exact(scope['documents'],('profile','company_id','asset_sha256','extraction_sha256','format','parser_sha256','selection'))
    if ref['profile']!=PROFILE or ref['format'] not in FORMATS or scope['operation'] not in OPERATIONS:raise ValueError('Document excerpts require a separate ordinary text operation')
    company(ref['company_id'])
    if company_id is not None and ref['company_id']!=company(company_id):raise ValueError('Document scope belongs to another company')
    for key in ('asset_sha256','extraction_sha256','parser_sha256'):sha(ref[key])
    selection=exact(ref['selection'],('start','end'))
    if any(type(value) is not int for value in selection.values()) or not 0<=selection['start']<selection['end']<=MAX_TEXT or selection['end']-selection['start']>600:raise ValueError('Exact bounded document character offsets required')
    sources=scope['sources']
    if not isinstance(sources,list) or len(sources)!=1 or exact(sources[0],('id','text'))['id']!='document_excerpt' or len(excerpt_text(sources[0]['text']))!=selection['end']-selection['start']:raise ValueError('Use the exact selected document_excerpt source')
    # CRLF is preserved in the approved source, never normalized in its hash.
    # Only this validation copy adapts to the unchanged legacy text guard.
    from executor.operations import validate_scope
    base={key:value for key,value in scope.items() if key!='documents'};base['sources']=[{'id':'document_excerpt','text':sources[0]['text'].replace('\r','\n')}]
    validate_scope(base,scope['operation'])
    if len(json.dumps(scope,ensure_ascii=True).encode())>2700:raise ValueError('Document request exceeds full encrypted scope limit')
    return scope

def document_scope(metadata,text,*,brief,context,start,end,operation='research_summary',use_ai=False,locale=None):
    exact(metadata,('profile','company_id','asset_sha256','bytes','format','extraction_sha256','extracted_bytes','characters','pages','parser_sha256','parser'))
    if metadata['profile']!='owner-document-asset-v1' or digest(text)!=metadata['extraction_sha256'] or len(text)!=metadata['characters']:raise ValueError('Preview differs from its exact document extraction')
    if type(start) is not int or type(end) is not int:raise ValueError('Exact character offsets required')
    ref={key:metadata[key] for key in ('company_id','asset_sha256','extraction_sha256','format','parser_sha256')};ref.update(profile=PROFILE,selection={'start':start,'end':end})
    result={'profile':'business-operations-v1','operation':operation,'brief':brief,'context':context,'sources':[{'id':'document_excerpt','text':text[start:end]}],'use_ai':use_ai,'documents':ref}
    if locale is not None:result['locale']=locale
    return validate_document_scope(result,metadata['company_id'])

def resolve_document_input(scope,*,worker_dir,company_id,scope_hash):
    validate_document_scope(scope,company_id);sha(scope_hash);ref=scope['documents'];value=DocumentStore(worker_dir,company_id).open(ref['asset_sha256'],ref['format'],ref['parser_sha256'])
    selected=value['text'][ref['selection']['start']:ref['selection']['end']]
    if value['metadata']['extraction_sha256']!=ref['extraction_sha256'] or selected!=scope['sources'][0]['text']:raise ValueError('Approved document extraction, offsets or literal source changed')
    return {'profile':RECEIPT,'scope_sha256':scope_hash,**{key:ref[key] for key in ('company_id','asset_sha256','extraction_sha256','parser_sha256','format','selection')},'excerpt_sha256':digest(selected),'untrusted_data':True,'authority':False,'training':False,'network_reads':0}

def validate_document_evidence(payload,scope,scope_hash,company_id=None):
    validate_document_scope(scope,company_id);sha(scope_hash);ref=scope['documents']
    exact(payload,('profile','operation','delivery','artifact','generation','sources','notice','claim_review','document_receipt')+(('locale',) if 'locale' in scope else ()))
    from executor.localization import validate_payload_locale
    from executor.operations import validate_artifact
    from executor.claims import validate_claim_review,claim_scope
    validate_payload_locale(payload,scope);validate_artifact(payload['artifact'],scope)
    generation=payload['generation']
    if not scope['use_ai']:
        exact(generation,('mode','model','cached'))
        if generation['mode']!='source_extract' or generation['model'] is not None or generation['cached'] is not False:raise ValueError('Document extraction cannot claim inference')
    else:
        if not isinstance(generation,dict) or type(generation.get('cached')) is not bool or generation.get('mode') not in ('local_ollama','near_ai_unattested'):raise ValueError('Document generation differs from inference approval')
        if generation['mode']=='local_ollama':
            exact(generation,('mode','model','cached','model_digest','authorization_model','cloud_provider_charge_nanos','local_compute_cost_unknown'));sha(generation['model_digest'])
            if type(generation['cloud_provider_charge_nanos']) is not int or generation['cloud_provider_charge_nanos']!=0 or generation['local_compute_cost_unknown'] is not True:raise ValueError('Local document inference cannot claim Cloud billing')
        else:exact(generation,('mode','model','cached'))
        for key in ('model',*(('authorization_model',) if generation['mode']=='local_ollama' else ())):
            if not isinstance(generation[key],str) or not generation[key].strip() or len(generation[key])>160:raise ValueError('Bounded document model provenance required')
    receipt=exact(payload.get('document_receipt'),('profile','scope_sha256','company_id','asset_sha256','extraction_sha256','parser_sha256','format','selection','excerpt_sha256','untrusted_data','authority','training','network_reads'))
    expected={'profile':RECEIPT,'scope_sha256':scope_hash,**{key:ref[key] for key in ('company_id','asset_sha256','extraction_sha256','parser_sha256','format','selection')},'excerpt_sha256':digest(scope['sources'][0]['text']),'untrusted_data':True,'authority':False,'training':False,'network_reads':0}
    if canonical(receipt)!=canonical(expected):raise ValueError('Document receipt differs from exact source or authority')
    if payload.get('profile')!=scope['profile'] or payload.get('operation')!=scope['operation'] or payload.get('delivery')!='private_artifact_only' or payload.get('notice')!='Source IDs are provenance, not independent fact verification. No external action occurred.' or payload.get('sources')!=[{'id':'document_excerpt','sha256':digest(scope['sources'][0]['text'])}]:raise ValueError('Document artifact provenance changed')
    validate_claim_review(payload['claim_review'],payload['artifact'],claim_scope(payload,scope),generation)
    return receipt

def worker_binding(worker_dir,company_id):
    path=Path(worker_dir)/'vault'/'launch.pem'
    if not path.exists() and not path.is_symlink():return None
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    private=serialization.load_pem_private_key(read_private(path,16384),password=None)
    if not isinstance(private,rsa.RSAPrivateKey) or private.key_size!=4096:raise ValueError('Matching RSA-4096 worker required')
    pem=private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode('ascii')
    return {'profile':'business-operations-v1','company_id':company(company_id),'worker_key_id':digest(pem)}

def document_api(action,request,*,worker_dir,company_id,worker_associated=False):
    company(company_id)
    if type(worker_associated) is not bool:raise ValueError('Trusted explicit worker association required')
    if action=='import':
        exact(request,('document_base64','format'));encoded=request['document_base64']
        if not isinstance(encoded,str) or len(encoded)>4*((MAX_RAW+2)//3):raise ValueError('Bounded base64 document required')
        raw=base64.b64decode(encoded,validate=True)
        if base64.b64encode(raw).decode()!=encoded:raise ValueError('Canonical base64 document required')
        result=DocumentStore(worker_dir,company_id,create=True).import_bytes(raw,request['format'])
    elif action=='preview':
        exact(request,('asset_sha256','format','parser_sha256'));result=DocumentStore(worker_dir,company_id).open(request['asset_sha256'],request['format'],request['parser_sha256'])
    else:raise ValueError('Only private document import and preview are supported')
    binding=worker_binding(worker_dir,company_id) if worker_associated else None
    if worker_associated and binding is None:raise ValueError('Explicit worker document association has no existing worker key')
    return {'profile':'document-preview-v1','company_id':company_id,**result,'task_prepare_ready':binding is not None,'worker_binding':binding}

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--worker-dir',required=True);parser.add_argument('--company-id',required=True);parser.add_argument('--worker-associated',action='store_true');parser.add_argument('action',choices=('import','preview'));args=parser.parse_args()
    raw=sys.stdin.buffer.read(1500001)
    if len(raw)>1500000:raise ValueError('Bounded private document request required')
    from executor.portability import strict_json
    result=document_api(args.action,strict_json(raw),worker_dir=args.worker_dir,company_id=args.company_id,worker_associated=args.worker_associated)
    print(json.dumps(result,ensure_ascii=True,separators=(',',':')))

if __name__=='__main__':main()
