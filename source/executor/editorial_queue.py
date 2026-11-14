"""Native source changes -> separately approved drafts -> explicit publication.

This queue imports no signer/provider/worker authority. Recovery keys are used
in memory, never saved. Every new draft and public revision needs owner approval.
"""
from __future__ import annotations
import argparse
import copy
import html
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import sys

from app.worker_crypto import decrypt
from executor.company_exit import canonical,digest,strict,exact,b64,hash_value,reference,_directory,_read,_write_new,_sync
from executor.native_source_watch import history,records,verify_access,validate_policy
from executor.operations import validate_scope,validate_artifact
from executor.claims import claim_scope,validate_claim_review
from executor.portability import reject_private_material

FORMAT='near-native-editorial-queue-v1'


def _report(watch_root,sha):
    hash_value(sha);manifest,reports=history(watch_root)
    found=next((r for r in reports if r['report_sha256']==sha),None)
    if found is None:raise ValueError('Original authenticated source report is required')
    return manifest,found,reports


def _load(root,watch_root):
    root=_directory(root);manifest,reports=history(watch_root)
    identity={'format':FORMAT,'policy_sha256':manifest['policy_sha256'],'publisher':manifest['policy']['publisher']}
    if (root/'queue.json').exists():
        if strict(_read(root,'queue.json',65536))!=identity:raise ValueError('Editorial queue belongs to another source policy')
    else:_write_new(root/'queue.json',canonical(identity));_sync(root)
    entries={};previous=None;events=[]
    for n,path in enumerate(sorted(root.glob('event-*.json')),1):
        if path.name!='event-%04d.json'%n:raise ValueError('Editorial event sequence is incomplete')
        event=strict(_read(root,path.name,262144));exact(event,{'format','number','previous_event_sha256','entry_id','kind','data','event_sha256'})
        unsigned={k:v for k,v in event.items() if k!='event_sha256'}
        if event['format']!=FORMAT or event['number']!=n or event['previous_event_sha256']!=previous or event['event_sha256']!=digest(canonical(unsigned)):
            raise ValueError('Editorial hash lineage changed')
        ident=hash_value(event['entry_id']);kind=event['kind'];data=event['data'];entry=entries.get(ident)
        if kind=='queued':
            if entry is not None:raise ValueError('Duplicate editorial entry')
            exact(data,{'report_sha256','record_key','change_kind','before_sha256','after_sha256'})
            _,report,_=_report(watch_root,data['report_sha256']);change=next((c for c in report['changes'] if c['record_key']==data['record_key']),None)
            expected=None if change is None else {'report_sha256':report['report_sha256'],'record_key':change['record_key'],'change_kind':change['kind'],
                     'before_sha256':None if change['before'] is None else change['before']['raw_sha256'],'after_sha256':None if change['after'] is None else change['after']['raw_sha256']}
            if data!=expected or ident!=digest(canonical([manifest['policy_sha256'],data])):raise ValueError('Editorial entry differs from original source change')
            entries[ident]={'entry_id':ident,**data,'phase':'queued'}
        elif kind=='task_bound':
            if entry is None or entry['phase']!='queued':raise ValueError('A source change may bind only one owner task')
            exact(data,{'task_id','scope_hash','use_ai'});hash_value(data['scope_hash'])
            if type(data['use_ai']) is not bool or type(data['task_id']) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',data['task_id']):raise ValueError('Typed owner task required')
            entry.update(**data,phase='draft_pending')
        elif kind=='draft_linked':
            if entry is None or entry['phase']!='draft_pending':raise ValueError('Original bound draft required')
            exact(data,{'evidence_hash','payload_sha256','archived_at_block'});hash_value(data['evidence_hash']);hash_value(data['payload_sha256']);reference(data['archived_at_block']);entry.update(**data,phase='draft_linked')
        elif kind=='publication_prepared':
            if entry is None or entry['phase']!='draft_linked':raise ValueError('Prior publication intent must be resolved, never retried')
            exact(data,{'request_id','intent','record_sha256','source_change_sha256','started_block'});hash_value(data['record_sha256']);reference(data['started_block'])
            if data['source_change_sha256']!=ident:raise ValueError('Publication source-change lineage changed')
            entry.update(publication=copy.deepcopy(data),phase='publication_pending')
        elif kind=='publication_broadcast':
            if entry is None or entry['phase']!='publication_pending':raise ValueError('Only the original publication may be broadcast')
            exact(data,{'transaction_hash'})
            if type(data['transaction_hash']) is not str or not re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}',data['transaction_hash']):raise ValueError('Original NEAR transaction hash required')
            entry.update(transaction_hash=data['transaction_hash'],phase='publication_unknown')
        elif kind=='publication_confirmed':
            if entry is None or entry['phase']!='publication_unknown':raise ValueError('Original unknown publication hash required')
            exact(data,{'record_sha256','transaction_hash','final_block','transaction'})
            if data['record_sha256']!=entry['publication']['record_sha256'] or data['transaction_hash']!=entry['transaction_hash']:raise ValueError('Publication changed original intent/hash')
            reference(data['final_block']);entry.update(confirmation=copy.deepcopy(data),phase='published')
        else:raise ValueError('Unknown editorial event')
        previous=event['event_sha256'];events.append(event)
    if len(entries)>128 or len(events)>1024:raise ValueError('Editorial queue capacity exhausted')
    return manifest,reports,entries,events


def _append(root,watch_root,entry_id,kind,data,expected_phase):
    root=_directory(root);fd=os.open(root/'queue.lock',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        os.close(fd);_,_,entries,events=_load(root,watch_root);entry=entries.get(entry_id)
        if (None if entry is None else entry['phase'])!=expected_phase:raise ValueError('Queue changed; review current original state')
        if kind=='publication_prepared' and any(e['phase'] in ('publication_pending','publication_unknown') for e in entries.values()):
            raise ValueError('Resolve the original publisher intent before preparing another publication')
        if len(events)>=1024:raise ValueError('Queue event budget exhausted')
        event={'format':FORMAT,'number':len(events)+1,'previous_event_sha256':None if not events else events[-1]['event_sha256'],
               'entry_id':entry_id,'kind':kind,'data':data};event['event_sha256']=digest(canonical(event))
        if len(canonical(event))>262144:raise ValueError('Editorial event exceeds bound')
        _write_new(root/('event-%04d.json'%event['number']),canonical(event));_sync(root);return event
    finally:(root/'queue.lock').unlink(missing_ok=True)


def queue_report(root,watch_root,report_sha256):
    manifest,report,_=_report(watch_root,report_sha256);_,_,entries,_=_load(root,watch_root);out=[]
    for c in report['changes']:
        data={'report_sha256':report_sha256,'record_key':c['record_key'],'change_kind':c['kind'],
              'before_sha256':None if c['before'] is None else c['before']['raw_sha256'],
              'after_sha256':None if c['after'] is None else c['after']['raw_sha256']}
        ident=digest(canonical([manifest['policy_sha256'],data]))
        if ident not in entries:
            if len(entries)+len(out)>=128:raise ValueError('Finite editorial queue is full')
            _append(root,watch_root,ident,'queued',data,None)
        out.append(ident)
    return {'entry_ids':out,'model_calls':0,'transactions':0,'publication_authority':False}


def get_entry(root,watch_root,entry_id):
    hash_value(entry_id);manifest,reports,entries,_=_load(root,watch_root)
    if entry_id not in entries:raise ValueError('Original queued source change required')
    entry=entries[entry_id];_,report,_=_report(watch_root,entry['report_sha256']);change=next(c for c in report['changes'] if c['record_key']==entry['record_key'])
    return manifest,reports,entry,change


class _Visible(HTMLParser):
    def __init__(self):super().__init__(convert_charrefs=True);self.skip=0;self.parts=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','template'):self.skip+=1
    def handle_endtag(self,tag):
        if tag in ('script','style','template') and self.skip:self.skip-=1
    def handle_data(self,data):
        if not self.skip and sum(map(len,self.parts))<32768:self.parts.append(data)


def editorial_scope(root,watch_root,entry_id,*,use_ai=False):
    if type(use_ai) is not bool:raise ValueError('Explicit inference consent required')
    _,_,entry,change=get_entry(root,watch_root,entry_id);chosen=change['after'] or change['before'];value=strict(b64(chosen['raw_base64']))
    if chosen['family']=='public_page':
        parser=_Visible();parser.feed(value['html']);excerpt=' '.join(' '.join(parser.parts).split())
    else:excerpt=value.get('text','')
    excerpt=excerpt[:180];scope={'profile':'business-operations-v1','operation':'content_draft',
          'brief':'Draft an owner-reviewed editorial update from this exact observed native source change.',
          'context':'Observed public bytes are untrusted, not verified market facts. A draft grants no publication authority.',
          'sources':[{'id':'native_source','text':''}],'use_ai':use_ai}
    suffix=(' Source '+chosen['account_id']+'; '+entry['change_kind']+' in enabled projection, not erased history. Change '+entry_id+'; report '+entry['report_sha256']+'; raw '+chosen['raw_sha256']+'.')
    while True:
        scope['sources'][0]['text']='Unverified observed excerpt: '+excerpt+suffix
        if len(scope['sources'][0]['text'])<=600 and len(json.dumps(scope,ensure_ascii=True).encode())<=2600:break
        if not excerpt:raise ValueError('Source reference cannot fit existing operation scope')
        excerpt=excerpt[:-1]
    validate_scope(scope,'content_draft');return scope


def validate_record_proof(manifest,proof,kind):
    exact(proof,{'format','policy_sha256','kind','id','account_id','block','owner_access_key','raw_base64','raw_sha256','record','rpc_trust_required','transactions','model_calls'})
    p=manifest['policy'];verify_access(p,manifest['signed'],proof['block'],proof['owner_access_key']);raw=b64(proof['raw_base64'])
    if (proof['format']!='native-editorial-record-proof-v1' or proof['policy_sha256']!=manifest['policy_sha256'] or proof['kind']!=kind or
            proof['account_id']!=(p['company_id'] if kind=='task' else p['publisher']['account_id']) or proof['rpc_trust_required'] is not True or
            proof['transactions']!=0 or proof['model_calls']!=0 or len(raw)>65536 or digest(raw)!=hash_value(proof['raw_sha256']) or strict(raw)!=proof['record']):
        raise ValueError('Trusted current native record proof required')
    if type(proof['id']) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}' if kind=='task' else r'(?:[1-9]|1[0-6])',proof['id']):
        raise ValueError('Exact bounded native record identity required')
    reject_private_material(raw);return copy.deepcopy(proof['record'])


def _open_task(manifest,proof,recovery):
    task=validate_record_proof(manifest,proof,'task');required={'version','task_id','scope_hash','record_key'}
    if type(recovery) is not dict or not required<=set(recovery) or set(recovery)-required-{'network','contract'} or recovery['version']!=1 or recovery['task_id']!=proof['id'] or recovery['scope_hash']!=task.get('scope_hash'):
        raise ValueError('Original separate owner recovery required')
    p=manifest['policy']
    if (recovery.get('network',p['network'])!=p['network'] or recovery.get('contract',p['company_id'])!=p['company_id'] or
            task.get('kind')!='general' or task.get('operation')!='content_draft' or task.get('approved_by')!=p['owner_id'] or task.get('inbox_id') or task.get('mandate_id') or
            digest(task.get('encrypted_scope','').encode())!=task.get('scope_hash')):
        raise ValueError('Exact ordinary owner editorial task required')
    scope=strict(decrypt(task['encrypted_scope'],recovery['record_key']));validate_scope(scope,'content_draft');return task,scope


def bind_editorial_task(root,watch_root,entry_id,proof,recovery):
    manifest,_,entry,_=get_entry(root,watch_root,entry_id);task,scope=_open_task(manifest,proof,recovery)
    if task.get('status') not in ('queued','awaiting_evidence','attested','archived') or scope!=editorial_scope(root,watch_root,entry_id,use_ai=scope['use_ai']):
        raise ValueError('Owner task must preserve the exact source-change scope')
    data={'task_id':proof['id'],'scope_hash':task['scope_hash'],'use_ai':scope['use_ai']}
    _append(root,watch_root,entry_id,'task_bound',data,'queued');return data


def _generation(value,use_ai):
    if type(value) is not dict or type(value.get('cached')) is not bool:raise ValueError('Typed editorial generation provenance required')
    mode=value.get('mode')
    if not use_ai:
        exact(value,{'mode','model','cached'})
        if value!={'mode':'source_extract','model':None,'cached':False}:raise ValueError('Draft inference contradicts the separate owner consent')
    elif mode in ('near_ai_unattested','local_ollama'):
        extra={'model_digest','authorization_model','cloud_provider_charge_nanos','local_compute_cost_unknown'} if mode=='local_ollama' else set()
        exact(value,{'mode','model','cached'}|extra)
        if type(value['model']) is not str or not 1<=len(value['model'])<=160:raise ValueError('Exact bounded model provenance required')
        if extra:
            hash_value(value['model_digest'])
            if type(value['authorization_model']) is not str or not 1<=len(value['authorization_model'])<=160 or value['cloud_provider_charge_nanos']!=0 or value['local_compute_cost_unknown'] is not True:raise ValueError('Local model cannot imply a verified Cloud bill')
    else:raise ValueError('Ordinary editorial task generation differs from owner consent')


def _draft(root,watch_root,entry_id,proof,recovery):
    manifest,reports,entry,change=get_entry(root,watch_root,entry_id);task,scope=_open_task(manifest,proof,recovery)
    if (task.get('status')!='archived' or proof['id']!=entry.get('task_id') or task['scope_hash']!=entry.get('scope_hash') or scope!=editorial_scope(root,watch_root,entry_id,use_ai=entry['use_ai']) or
            digest(task.get('encrypted_evidence','').encode())!=task.get('evidence_hash')):
        raise ValueError('Exact archived bound editorial draft required')
    payload=strict(decrypt(task['encrypted_evidence'],recovery['record_key']))
    if (payload.get('profile')!='business-operations-v1' or payload.get('operation')!='content_draft' or payload.get('delivery')!='private_artifact_only' or
            payload.get('sources')!=[{'id':s['id'],'sha256':digest(s['text'].encode())} for s in scope['sources']] or 'claim_review' not in payload):
        raise ValueError('Draft changed source provenance or delivery')
    _generation(payload.get('generation'),scope['use_ai'])
    validate_artifact(payload['artifact'],scope);validate_claim_review(payload['claim_review'],payload['artifact'],claim_scope(payload,scope),payload['generation'])
    reject_private_material(canonical(payload))
    return manifest,reports,entry,task,payload


def link_archived_draft(root,watch_root,entry_id,proof,recovery):
    _,_,entry,task,payload=_draft(root,watch_root,entry_id,proof,recovery)
    data={'evidence_hash':task['evidence_hash'],'payload_sha256':digest(canonical(payload)),'archived_at_block':proof['block']}
    _append(root,watch_root,entry_id,'draft_linked',data,'draft_pending');return data


def render_editorial_revision(root,watch_root,entry_id,proof,recovery,version):
    manifest,reports,entry,task,payload=_draft(root,watch_root,entry_id,proof,recovery)
    if entry['phase'] not in ('draft_linked','publication_pending','publication_unknown','published') or type(version) is not int or not 1<=version<=16:
        raise ValueError('Linked draft and bounded publication version required')
    latest=records(reports[-1]['snapshot']).get(entry['record_key']);expected=entry['after_sha256']
    if (None if latest is None else latest['raw_sha256'])!=expected:raise ValueError('New source change needs a new separately approved draft')
    if digest(canonical(payload))!=entry['payload_sha256'] or task['evidence_hash']!=entry['evidence_hash']:raise ValueError('Linked draft bytes changed')
    a=payload['artifact'];escape=html.escape
    content=('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="native-source-change" content="'+entry_id+'">'
             '<meta name="native-source-report" content="'+entry['report_sha256']+'"><title>Reviewed editorial update</title>'
             '<main><p>Owner-reviewed draft. Native source bytes and generated claims remain unverified.</p><h1>'+escape(a['title'])+'</h1><p>'+escape(a['summary'])+'</p>'
             +''.join('<p>'+escape(item['text'])+'</p>' for item in a['items'])+'<small>Source-change '+entry_id+'; archived draft '+escape(entry['task_id'])+'. No verified market facts or business outcome is asserted.</small></main></html>')
    if len(content.encode())>16384:raise ValueError('Editorial revision exceeds native page bound')
    p=manifest['policy'];page={'version':version,'title':'Reviewed editorial update','html':content,'html_sha256':digest(content.encode()),
                             'source':{'company_id':p['company_id'],'task_id':entry['task_id'],'evidence_hash':entry['evidence_hash']}}
    raw=json.dumps(['near-public-static-page-v1',p['publisher']['account_id'],p['owner_id'],version,page['title'],page['html_sha256'],
                   [page['source']['company_id'],page['source']['task_id'],page['source']['evidence_hash']]],ensure_ascii=False,separators=(',',':')).encode()
    return {'page':page,'record_sha256':digest(raw),'source_change_sha256':entry_id,'publication_authority':False}


def prepare_publication(root,watch_root,entry_id,proof,recovery,version,quote,request_id,consent):
    rendered=render_editorial_revision(root,watch_root,entry_id,proof,recovery,version);manifest,_,entry,_=get_entry(root,watch_root,entry_id)
    exact(consent,{'public_nonsecret','rights_to_publish','permanent_public_ack'})
    if any(v is not True for v in consent.values()):raise ValueError('Separate permanent public nonsecret and rights approval required')
    exact(quote,{'format','policy_sha256','block','owner_access_key','quote','rpc_trust_required','transactions','model_calls'})
    verify_access(manifest['policy'],manifest['signed'],quote['block'],quote['owner_access_key'])
    if (quote['format']!='native-editorial-quote-proof-v1' or quote['policy_sha256']!=manifest['policy_sha256'] or quote['rpc_trust_required'] is not True or quote['transactions']!=0 or quote['model_calls']!=0):raise ValueError('Actual trusted RPC publication quote required')
    _,reports=history(watch_root);started_block=quote['block']
    if reports[-1]['snapshot']['block']['height']<entry['archived_at_block']['height'] or started_block['height']<reports[-1]['snapshot']['block']['height']:raise ValueError('Refresh the unchanged source after draft archival, then obtain a fresh publication quote')
    quote=quote['quote']
    expected={'profile','publisher_id','owner','version','record_sha256','html_sha256','expected_active_sha256','available','storage_byte_cost','storage_reservation_bytes','storage_contribution','storage_refundable','gas_included'}
    exact(quote,expected)
    if (type(request_id) is not str or not re.fullmatch(r'[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}',request_id) or
            quote['profile']!='near-public-static-page-v1' or quote['publisher_id']!=manifest['policy']['publisher']['account_id'] or quote['owner']!=manifest['policy']['owner_id'] or
            quote['version']!=version or quote['record_sha256']!=rendered['record_sha256'] or quote['html_sha256']!=rendered['page']['html_sha256'] or quote['available'] is not True or
            quote['storage_reservation_bytes']!='65536' or quote['storage_refundable'] is not False or quote['gas_included'] is not False or
            not re.fullmatch(r'[1-9][0-9]{0,38}',quote['storage_byte_cost']) or quote['storage_contribution']!=str(65536*int(quote['storage_byte_cost']))):
        raise ValueError('Fresh exact owner publication quote required')
    if quote['expected_active_sha256'] is not None:hash_value(quote['expected_active_sha256'])
    intent={'method':'publish','args':{'page':rendered['page'],'approved_record_sha256':rendered['record_sha256'],'expected_active_sha256':quote['expected_active_sha256'],
            'approved_storage':quote['storage_contribution'],'public_nonsecret':True,'rights_to_publish':True,'permanent_public_ack':True},
            'gas':'150000000000000','deposit':quote['storage_contribution'],'ownerOnly':True}
    data={'request_id':request_id,'intent':intent,'record_sha256':rendered['record_sha256'],'source_change_sha256':entry_id,'started_block':started_block}
    _append(root,watch_root,entry_id,'publication_prepared',data,'draft_linked');return data


def mark_broadcast(root,watch_root,entry_id,transaction_hash):
    if type(transaction_hash) is not str or not re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}',transaction_hash):raise ValueError('Original NEAR hash required')
    _append(root,watch_root,entry_id,'publication_broadcast',{'transaction_hash':transaction_hash},'publication_pending')
    return {'phase':'publication_unknown','transaction_hash':transaction_hash,'automatic_retry':False}


def confirm_publication(root,watch_root,entry_id,proof,receipt):
    manifest,_,entry,_=get_entry(root,watch_root,entry_id);record=validate_record_proof(manifest,proof,'publication')
    if entry['phase']!='publication_unknown':raise ValueError('Original publication hash must be reconciled')
    p=entry['publication'];intent=p['intent'];page=intent['args']['page'];exact(receipt,{'status','transaction_hash','signer_id','receiver_id','method','args','deposit','gas','transaction_block','transaction'})
    policy=manifest['policy']
    if (receipt['status']!='final' or receipt['transaction_hash']!=entry['transaction_hash'] or receipt['signer_id']!=policy['owner_id'] or receipt['receiver_id']!=policy['publisher']['account_id'] or
            receipt['method']!='publish' or receipt['args']!=intent['args'] or receipt['deposit']!=intent['deposit'] or receipt['gas']!=intent['gas'] or
            record.get('owner')!=policy['owner_id'] or record.get('publisher_id')!=policy['publisher']['account_id'] or record.get('source_independently_verified') is not False or
            any(record.get(k)!=v for k,v in page.items()) or record.get('record_sha256')!=p['record_sha256']):
        raise ValueError('Actual FINAL receipt and exact native revision must match the original owner intent')
    reference(receipt['transaction_block'])
    if receipt['transaction_block']['height']<=p['started_block']['height'] or proof['block']['height']<receipt['transaction_block']['height']:raise ValueError('FINAL publication must follow the original reviewed quote')
    tx=receipt['transaction']
    exact(tx,{'method','job_id','hash','signer','receiver','gas_burnt','tokens_burnt','receipts'})
    if not isinstance(tx,dict) or tx.get('hash')!=receipt['transaction_hash'] or tx.get('signer')!=policy['owner_id'] or tx.get('receiver')!=policy['publisher']['account_id'] or not re.fullmatch(r'0|[1-9][0-9]*',tx.get('tokens_burnt','')):
        raise ValueError('Actual known FINAL fee metadata required')
    if tx['method']!='publish' or tx['job_id'] is not None or not re.fullmatch(r'0|[1-9][0-9]*',tx['gas_burnt']) or type(tx['receipts']) is not list or not 1<=len(tx['receipts'])<=256 or len(tx['receipts'])!=len(set(tx['receipts'])) or any(type(r) is not str or not re.fullmatch(r'[1-9A-HJ-NP-Za-km-z]{32,44}',r) for r in tx['receipts']):raise ValueError('Exact publish receipt graph required')
    data={'record_sha256':record['record_sha256'],'transaction_hash':entry['transaction_hash'],'final_block':proof['block'],'transaction':tx}
    _append(root,watch_root,entry_id,'publication_confirmed',data,'publication_unknown');return {'phase':'published',**data,'market_facts_verified':False}


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',required=True);parser.add_argument('--watch-root',required=True)
    parser.add_argument('command',choices=('queue','entries','scope','bind-task','link-draft','render','prepare-publication','mark-broadcast','confirm'));a=parser.parse_args()
    raw=sys.stdin.buffer.read(3*1024*1024+1)
    if len(raw)>3*1024*1024:raise ValueError('Bounded editorial request required')
    r=strict(raw) if raw else {};root=_directory(a.root);watch=_directory(a.watch_root)
    if a.command=='queue':exact(r,{'report_sha256'});out=queue_report(root,watch,**r)
    elif a.command=='entries':exact(r,set());_,_,entries,_=_load(root,watch);out={'entries':list(entries.values())}
    elif a.command=='scope':exact(r,{'entry_id','use_ai'});out=editorial_scope(root,watch,**r)
    elif a.command in ('bind-task','link-draft'):exact(r,{'entry_id','proof','recovery'});out=(bind_editorial_task if a.command=='bind-task' else link_archived_draft)(root,watch,**r)
    elif a.command=='render':exact(r,{'entry_id','proof','recovery','version'});out=render_editorial_revision(root,watch,**r)
    elif a.command=='prepare-publication':exact(r,{'entry_id','proof','recovery','version','quote','request_id','consent'});out=prepare_publication(root,watch,**r)
    elif a.command=='mark-broadcast':exact(r,{'entry_id','transaction_hash'});out=mark_broadcast(root,watch,**r)
    else:exact(r,{'entry_id','proof','receipt'});out=confirm_publication(root,watch,**r)
    print(json.dumps(out,separators=(',',':')))


if __name__=='__main__':
    try:main()
    except Exception as e:print(json.dumps({'ok':False,'error':str(e)}),file=sys.stderr);raise SystemExit(1)
