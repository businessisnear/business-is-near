"""Authenticated owner-host bridge. Every chain input is collected here, never
accepted as a browser-supplied RPC proof. No signing key/provider/model is loaded.
The existing private server must authenticate and recheck FINAL owner first.
"""
from pathlib import Path
import os
import subprocess
from executor.company_exit import canonical,strict,exact,_directory
from executor.native_source_watch import open_watch,history,collect,validate_policy,verify_policy,ID
from executor import editorial_queue as queue

ROOT=Path(__file__).resolve().parents[1]


def node(configuration,command,**fields):
    request={'command':command,'configuration':configuration,**fields}
    proc=subprocess.run(['node',str(ROOT/'scripts/native-source-watch.mjs')],input=canonical(request),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,cwd=ROOT,timeout=90,env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'LANG':'C.UTF-8'})
    if proc.returncode or len(proc.stdout)>3*1024*1024:raise ValueError('Native editorial observation unresolved; retain original intent')
    return strict(proc.stdout)


def native_watch_api(service,company,identity,action,request):
    """Call ONLY after the existing same-origin/CSRF owner authorization.

    service.authority owns the fixed protected RPC and company/code allowlist;
    no browser field can set a URL, genesis, contract template, path or signer.
    """
    if identity.get('company_id')!=company or identity.get('account_id')!=identity.get('boundary',{}).get('owner') or company not in service.authority.companies:
        raise ValueError('Current authenticated company owner required')
    owner=identity['account_id'];authority=service.authority
    configuration={k:getattr(authority,k) for k in ('network','chain_id','rpc_url','genesis_hash','genesis_height')}
    if action=='prepare':
        exact(request,{'watch_id','publisher_id','sources','max_observations','minimum_interval_seconds'})
        return node(configuration,'prepare',input={**request,'company_id':company,'owner_id':owner})
    if action=='init':
        exact(request,{'policy','signed'});p=request['policy'];validate_policy(p);verify_policy(p,request['signed'])
        if p.get('company_id')!=company or p.get('owner_id')!=owner or any(p.get(k)!=v for k,v in configuration.items() if k!='rpc_url'):raise ValueError('Watch belongs to another authenticated company/network')
        # Authentication already rechecked current FINAL company owner/code.
        # Initialization never spends an unjournaled source observation.
        if p.get('company',{}).get('code_hash')!=authority.companies[company]:raise ValueError('Reviewed authenticated company code differs')
        parent=service.workspace(company).root/'native-watch';parent.mkdir(exist_ok=True,mode=0o700);parent=_directory(parent)
        target=parent/p['watch_id']
        if target.parent!=parent:raise ValueError('Watch must be a direct owner workspace child')
        target.mkdir(exist_ok=True,mode=0o700);return open_watch(target,p,request['signed'])
    if not isinstance(request,dict) or type(request.get('watch_id')) is not str:raise ValueError('Explicit watch identity required')
    if not ID.fullmatch(request['watch_id']):raise ValueError('Exact watch ID required')
    parent=_directory(service.workspace(company).root/'native-watch')
    watch=_directory(parent/request['watch_id']);manifest,reports=history(watch)
    if manifest['policy']['company_id']!=company or manifest['policy']['owner_id']!=owner:raise ValueError('Watch owner changed')
    editorial=watch/'editorial';editorial.mkdir(exist_ok=True,mode=0o700);editorial=_directory(editorial)
    payload={k:v for k,v in request.items() if k!='watch_id'}
    args={'policy':manifest['policy'],'signed':manifest['signed']}
    if action=='observe':exact(payload,set());return {'reports':collect(watch,configuration,observations=1)}
    if action=='status':
        exact(payload,set());return {'manifest':manifest,'reports':reports,'entries':list(queue._load(editorial,watch)[2].values())}
    if action=='queue':exact(payload,{'report_sha256'});return queue.queue_report(editorial,watch,**payload)
    if action=='scope':exact(payload,{'entry_id','use_ai'});return queue.editorial_scope(editorial,watch,**payload)
    if action=='profile':
        exact(payload,set());boundary=identity['boundary'];out=authority._rpc('query',{'request_type':'call_function','account_id':company,'block_id':boundary['block_hash'],'method_name':'execution_profile','args_base64':'e30='})
        if out.get('block_hash')!=boundary['block_hash'] or out.get('block_height')!=boundary['block_height'] or type(out.get('result')) is not list or len(out['result'])>65536:raise ValueError('Mixed worker-profile boundary')
        return {'execution_profile':strict(bytes(out['result']))}
    if action in ('bind-task','link-draft','render','prepare-publication'):
        fields={'bind-task':{'entry_id','task_id','recovery'},'link-draft':{'entry_id','task_id','recovery'},'render':{'entry_id','task_id','recovery','version'},'prepare-publication':{'entry_id','task_id','recovery','version','request_id','consent'}}[action];exact(payload,fields)
        proof=node(configuration,'record',**args,kind='task',id=payload['task_id']);common={'entry_id':payload['entry_id'],'proof':proof,'recovery':payload['recovery']}
        if action=='bind-task':return queue.bind_editorial_task(editorial,watch,**common)
        if action=='link-draft':return queue.link_archived_draft(editorial,watch,**common)
        common['version']=payload['version']
        if action=='render':return queue.render_editorial_revision(editorial,watch,**common)
        rendered=queue.render_editorial_revision(editorial,watch,**common);quote=node(configuration,'quote',**args,page=rendered['page'])
        return queue.prepare_publication(editorial,watch,**common,quote=quote,request_id=payload['request_id'],consent=payload['consent'])
    if action=='mark-broadcast':exact(payload,{'entry_id','transaction_hash'});return queue.mark_broadcast(editorial,watch,**payload)
    if action=='confirm':
        exact(payload,{'entry_id'});_,_,entry,_=queue.get_entry(editorial,watch,payload['entry_id'])
        if entry['phase']!='publication_unknown':raise ValueError('Original wallet hash must be recorded first')
        intent=entry['publication']['intent'];receipt=node(configuration,'receipt',**args,transaction_hash=entry['transaction_hash'],intent=intent)
        proof=node(configuration,'record',**args,kind='publication',id=str(intent['args']['page']['version']))
        return queue.confirm_publication(editorial,watch,entry['entry_id'],proof,receipt)
    raise ValueError('Unknown native source-watch action')
