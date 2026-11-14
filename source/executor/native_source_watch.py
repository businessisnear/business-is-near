"""Finite owner-approved native public projections and immutable change reports.

Trusted RPC observations are not verified market facts. No model, provider key,
signer, publication, arbitrary URL or discovered-account authority is present.
"""
from __future__ import annotations
import argparse
import base64
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

from executor.company_exit import (canonical, digest, strict, exact, account, b64, hash_value,
    reference, _base58, _directory, _read, _write_new, _sync)
from executor.portability import reject_private_material
from executor.wallet_auth import verify_signature

FORMAT = 'near-native-source-watch-v1'
FAMILIES = ('feed', 'public_page')
ROOT = Path(__file__).resolve().parents[1]
ID = re.compile(r'[a-z][a-z0-9_]{0,23}\Z')
COVERAGE = {'projection': 'enabled_public_current_page_or_feed_posts', 'explicit_sources_only': True,
            'raw_storage_current': False, 'deleted_history_included': False, 'rpc_trust_required': True,
            'market_facts_verified': False, 'transactions': 0, 'model_calls': 0}


def validate_policy(p):
    exact(p, {'format','watch_id','company_id','owner_id','network','chain_id','genesis_hash','genesis_height',
              'approved_at','company','publisher','sources','max_observations','minimum_interval_seconds','ack'})
    if p['format'] != FORMAT or p['ack'] != 'PUBLIC_SOURCES_ONLY_NO_FACT_OR_ACTION_AUTHORITY' or type(p['watch_id']) is not str or not ID.fullmatch(p['watch_id']):
        raise ValueError('Explicit exact native source policy required')
    account(p['company_id']); account(p['owner_id']); reference(p['approved_at']); _base58(p['genesis_hash'])
    for pin in (p['company'], p['publisher']):
        exact(pin, {'account_id','code_hash','wasm_sha256'}); account(pin['account_id']); hash_value(pin['wasm_sha256'])
        if _base58(pin['code_hash']).hex() != pin['wasm_sha256']: raise ValueError('Code/WASM commitment mismatch')
    if (p['company']['account_id'] != p['company_id'] or p['publisher']['account_id'] == p['company_id'] or
            p['network'] not in ('sandbox','testnet','mainnet') or type(p['chain_id']) is not str or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}',p['chain_id']) or
            type(p['genesis_height']) is not int or p['genesis_height'] < 0 or type(p['max_observations']) is not int or not 1 <= p['max_observations'] <= 8 or
            type(p['minimum_interval_seconds']) is not int or not 0 <= p['minimum_interval_seconds'] <= 3600 or type(p['sources']) is not list or not 1 <= len(p['sources']) <= 8):
        raise ValueError('Pinned finite native watch required')
    ids = []; accounts = []
    for target in p['sources']:
        exact(target, {'source_id','family','account_id','code_hash','wasm_sha256'})
        account(target['account_id']); hash_value(target['wasm_sha256'])
        if (type(target['source_id']) is not str or not ID.fullmatch(target['source_id']) or target['family'] not in FAMILIES or
                _base58(target['code_hash']).hex() != target['wasm_sha256'] or target['account_id'] == p['publisher']['account_id']):
            raise ValueError('Unsupported source or publication feedback loop')
        ids.append(target['source_id']); accounts.append(target['account_id'])
    if ids != sorted(set(ids)) or len(accounts) != len(set(accounts)) or len(canonical(p)) > 16384:
        raise ValueError('Sorted distinct source declarations required')
    return p


def policy_challenge(p):
    validate_policy(p); sha = digest(canonical(p))
    return {'account_id':p['owner_id'],'state':sha,'nonce':base64.b64encode(bytes.fromhex(sha)).decode(),
            'recipient':'proofwork-native-source-watch-v1:'+p['company_id'],'callback_url':None,
            'message':'Approve finite native public-source watch '+sha+'. Read-only snapshots and editorial queue only; no model, transaction, publication or fact-verification authority.'}


def verify_policy(p, signed):
    return verify_signature(policy_challenge(p), signed)


def verify_access(p, signed, block, proof):
    reference(block); key = verify_policy(p,signed)
    if proof != {'public_key':key,'permission':'FullAccess','block':block}:
        raise ValueError('Fresh owner FullAccess proof required')
    prior = p['approved_at']
    if block['height'] < prior['height'] or block['height'] == prior['height'] and block['hash'] != prior['hash']:
        raise ValueError('Watch observation predates approval or changes FINAL hash')


def validate_snapshot(p, signed, snapshot):
    exact(snapshot, {'format','policy_sha256','block','owner_access_key','sources','coverage'})
    if snapshot['format'] != 'near-native-source-snapshot-v1' or snapshot['policy_sha256'] != digest(canonical(p)) or snapshot['coverage'] != COVERAGE:
        raise ValueError('Snapshot authority or facts boundary changed')
    verify_access(p,signed,snapshot['block'],snapshot['owner_access_key'])
    if type(snapshot['sources']) is not list or len(snapshot['sources']) != len(p['sources']): raise ValueError('A selected source is missing')
    total = 0
    for source, target in zip(snapshot['sources'],p['sources']):
        exact(source,set(target)|{'enabled','archival_storage_sha256','records'})
        if any(source[k] != v for k,v in target.items()) or type(source['enabled']) is not bool or type(source['records']) is not list or len(source['records']) > 64:
            raise ValueError('Source changed identity, code or projection')
        hash_value(source['archival_storage_sha256']); ids = []
        if not source['enabled'] and source['records']: raise ValueError('Disabled projections have no current visible records')
        for row in source['records']:
            exact(row,{'record_id','raw_base64','raw_sha256'}); raw = b64(row['raw_base64'])
            if (type(row['record_id']) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',row['record_id']) or
                    source['family']=='public_page' and row['record_id']!='current' or digest(raw)!=hash_value(row['raw_sha256']) or len(raw)>65536):
                raise ValueError('Bounded exact raw native record required')
            reject_private_material(raw); value = strict(raw)
            if type(value) is not dict: raise ValueError('Native record object required')
            if source['family']=='public_page':
                if value.get('publisher_id')!=source['account_id'] or digest(value.get('html','').encode())!=value.get('html_sha256'):
                    raise ValueError('Native HTML source commitment changed')
            elif value.get('post_id') != row['record_id']:
                raise ValueError('Native feed record identity changed')
            ids.append(row['record_id']); total += len(raw)
        if ids != sorted(set(ids)) or source['family']=='public_page' and len(ids)>1:
            raise ValueError('Duplicate, unordered or oversized current projection')
    if total > 1024*1024 or len(canonical(snapshot)) > 2*1024*1024: raise ValueError('Native snapshot exceeds bound')
    return digest(canonical(snapshot))


def records(snapshot):
    return {source['source_id']+'/'+row['record_id']:{'source_id':source['source_id'],'family':source['family'],
        'account_id':source['account_id'],**row} for source in snapshot['sources'] for row in source['records']}


def changes(before, after):
    old = {} if before is None else records(before); new = records(after); result = []
    for key in sorted(set(old)|set(new)):
        a,b=old.get(key),new.get(key)
        if a is not None and b is not None and a['raw_sha256']==b['raw_sha256']: continue
        result.append({'record_key':key,'kind':'added' if a is None else 'removed' if b is None else 'changed',
                       'before':a,'after':b})
    if len(result)>128:raise ValueError('Change report exceeds bound')
    return result


def open_watch(root, policy, signed):
    root = _directory(root); verify_policy(policy,signed)
    manifest = {'format':FORMAT,'policy':policy,'signed':signed,'policy_sha256':digest(canonical(policy))}
    path=root/'watch-policy.json'
    if path.exists():
        if strict(_read(root,path.name,65536))!=manifest:raise ValueError('Watch identity cannot change in place')
    else:_write_new(path,canonical(manifest));_sync(root)
    return manifest


def history(root):
    root=_directory(root); manifest=strict(_read(root,'watch-policy.json',65536));verify_policy(manifest['policy'],manifest['signed'])
    files=sorted(root.glob('observation-*.json'));out=[];previous=None;previous_snapshot=None
    for number,path in enumerate(files,1):
        if path.name!='observation-%02d.json'%number:raise ValueError('Observation sequence is incomplete')
        report=strict(_read(root,path.name,8*1024*1024));exact(report,{'format','policy_sha256','observation','previous_report_sha256','observed_at_unix','snapshot','changes','market_facts_verified','editorial_authority','publication_authority','model_calls','transactions','report_sha256'});unsigned={k:v for k,v in report.items() if k!='report_sha256'}
        if report.get('report_sha256')!=digest(canonical(unsigned)) or report.get('previous_report_sha256')!=previous or report.get('observation')!=number:
            raise ValueError('Observation hash lineage changed')
        validate_snapshot(manifest['policy'],manifest['signed'],report['snapshot'])
        if out and (report['snapshot']['block']['height']<=out[-1]['snapshot']['block']['height'] or report['observed_at_unix']-out[-1]['observed_at_unix']<manifest['policy']['minimum_interval_seconds']):raise ValueError('Observation FINAL/clock order changed')
        if report.get('changes')!=changes(previous_snapshot,report['snapshot']):raise ValueError('Observed native diff changed')
        if report['format']!='near-native-source-change-report-v1' or report['policy_sha256']!=manifest['policy_sha256'] or any(report[k] is not False for k in ('market_facts_verified','editorial_authority','publication_authority')) or type(report['observed_at_unix']) is not int or report['model_calls']!=0 or report['transactions']!=0:raise ValueError('Report authority/trust boundary changed')
        previous=report['report_sha256'];previous_snapshot=report['snapshot'];out.append(report)
    if len(out)>manifest['policy']['max_observations']:raise ValueError('Owner observation budget exceeded')
    return manifest,out


def append_snapshot(root, policy, signed, snapshot, *, observed_at=None):
    root=_directory(root);open_watch(root,policy,signed);_,reports=history(root);validate_snapshot(policy,signed,snapshot)
    if (root/'observation.lock').exists():raise ValueError('Another observation may be in progress')
    fd=os.open(root/'observation.lock',os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    try:
        os.close(fd);_,reports=history(root)
        if len(reports)>=policy['max_observations']:raise ValueError('Finite owner observation budget exhausted')
        prior=reports[-1] if reports else None
        if prior:
            a,b=prior['snapshot']['block'],snapshot['block']
            if b['height']<=a['height']:raise ValueError('A new later FINAL observation is required')
        now=time.time() if observed_at is None else observed_at
        if type(now) not in (int,float) or now<0:raise ValueError('Observation clock required')
        if prior and now-prior['observed_at_unix']<policy['minimum_interval_seconds']:raise ValueError('Explicit minimum observation interval not reached')
        report={'format':'near-native-source-change-report-v1','policy_sha256':digest(canonical(policy)),
                'observation':len(reports)+1,'previous_report_sha256':None if prior is None else prior['report_sha256'],
                'observed_at_unix':int(now),'snapshot':snapshot,'changes':changes(None if prior is None else prior['snapshot'],snapshot),
                'market_facts_verified':False,'editorial_authority':False,'publication_authority':False,'model_calls':0,'transactions':0}
        report['report_sha256']=digest(canonical(report))
        if len(canonical(report))>8*1024*1024:raise ValueError('Change report exceeds bounded journal size')
        _write_new(root/('observation-%02d.json'%report['observation']),canonical(report));_sync(root);return report
    finally:(root/'observation.lock').unlink(missing_ok=True)


def collect(root, configuration, *, observations=1):
    """Finite explicit read-only polling; a failed request consumes its attempt.

    Run only as the owner host. A prior incomplete attempt is never retried.
    """
    root=_directory(root);manifest,_=history(root);policy=manifest['policy']
    if type(observations) is not int or not 1<=observations<=policy['max_observations']:raise ValueError('Finite observation count required')
    results=[]
    for _ in range(observations):
        _,done=history(root);attempts=list(root.glob('attempt-*.json'))
        if len(attempts)>=policy['max_observations'] or len(done)>=policy['max_observations']:raise ValueError('Finite owner observation budget exhausted')
        for attempt in attempts:
            marker=strict(_read(root,attempt.name,4096))
            if not (root/('result-'+marker['attempt_id']+'.json')).exists():raise ValueError('Prior read outcome requires owner review; no automatic retry')
        attempt_id='%02d'%(len(attempts)+1);_write_new(root/('attempt-'+attempt_id+'.json'),canonical({'attempt_id':attempt_id,'policy_sha256':manifest['policy_sha256'],'requested_at':int(time.time())}));_sync(root)
        request={'command':'collect','configuration':configuration,'policy':policy,'signed':manifest['signed']}
        proc=subprocess.run(['node',str(ROOT/'scripts/native-source-watch.mjs')],input=canonical(request),cwd=ROOT,
            env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'LANG':'C.UTF-8'},stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=90)
        if proc.returncode or len(proc.stdout)>2*1024*1024:raise ValueError('Native watch observation failed; original attempt retained without retry')
        value=strict(proc.stdout);exact(value,{'snapshot','snapshot_sha256'})
        if digest(canonical(value['snapshot']))!=value['snapshot_sha256']:raise ValueError('Snapshot response commitment changed')
        report=append_snapshot(root,policy,manifest['signed'],value['snapshot'])
        _write_new(root/('result-'+attempt_id+'.json'),canonical({'attempt_id':attempt_id,'report_sha256':report['report_sha256']}));_sync(root);results.append(report)
        if len(results)<observations:
            # Sleep in short intervals so a host can stop the finite watcher.
            for _ in range(max(1,policy['minimum_interval_seconds'])):time.sleep(1)
    return results


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',required=True);parser.add_argument('command',choices=('init','append','history','watch'));args=parser.parse_args();root=_directory(args.root)
    raw=sys.stdin.buffer.read(3*1024*1024+1)
    if len(raw)>3*1024*1024:raise ValueError('Bounded watch request required')
    r=strict(raw) if raw else {}
    if args.command=='init':exact(r,{'policy','signed'});out=open_watch(root,r['policy'],r['signed'])
    elif args.command=='append':exact(r,{'policy','signed','snapshot'});out=append_snapshot(root,r['policy'],r['signed'],r['snapshot'])
    elif args.command=='watch':exact(r,{'configuration','observations'});out={'reports':collect(root,r['configuration'],observations=r['observations'])}
    else:exact(r,set());manifest,reports=history(root);out={'policy':manifest['policy'],'reports':reports}
    print(json.dumps(out,separators=(',',':')))


if __name__=='__main__':
    try:main()
    except Exception as e:print(json.dumps({'ok':False,'error':str(e)}),file=sys.stderr);raise SystemExit(1)
