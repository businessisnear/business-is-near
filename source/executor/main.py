"""Headless worker CLI. No HTTP listener, owner key or customer key."""
import argparse
import getpass
import json
import os
from pathlib import Path
import signal
import stat
import time
from app.worker_crypto import WorkerVault
from executor.crypto import public_manifest
from executor.engine import CompanyExecutor
from executor.rpc_gateway import RPCGateway


def private_root(raw):
    path=Path(raw).expanduser()
    if not path.is_absolute():raise ValueError('Use an absolute private data directory')
    path.mkdir(mode=0o700,parents=True,exist_ok=True)
    st=path.lstat()
    if not stat.S_ISDIR(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid():raise ValueError('Private data directory must be owned by this user with mode 0700')
    return path


def read_config(raw):
    fd=os.open(raw,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_mode&0o077 or st.st_uid!=os.getuid() or st.st_size>16384:raise ValueError('Use a private, user-owned config file')
        with os.fdopen(fd,'r',closefd=False) as f:value=json.load(f)
        if not isinstance(value,dict) or set(value)!={'data_dir','gateway'}:raise ValueError('Config needs exactly data_dir and gateway')
        return value
    finally:os.close(fd)


def main():
    parser=argparse.ArgumentParser(description='Proof / Work headless NEAR executor; no application server')
    sub=parser.add_subparsers(dest='action',required=True)
    for name in ('init','set-ai-key'):
        p=sub.add_parser(name);p.add_argument('--data-dir',required=True)
        if name=='init':p.add_argument('--profile',choices=('website-qa-v1','business-operations-v1'),default='website-qa-v1')
    for name in ('run','reconcile'):
        p=sub.add_parser(name);p.add_argument('--config',required=True)
        if name=='run':
            p.add_argument('--steps',type=int,default=0);p.add_argument('--interval',type=int,default=10)
            p.add_argument('--profile',choices=('website-qa-v1','business-operations-v1'),default='website-qa-v1')
            p.add_argument('--autonomous',action='store_true',help='Run due owner-approved business mandates')
            p.add_argument('--local-model',action='store_true',help='Explicit sandbox-only local Gemma inference substitute')
    args=parser.parse_args()
    if args.action in ('init','set-ai-key'):
        root=private_root(args.data_dir)
        if args.action=='init':
            manifest=public_manifest(WorkerVault(root/'vault'));manifest['profile']=args.profile;print(json.dumps(manifest));return
        value=getpass.getpass('Dedicated capped NEAR AI API key (hidden): ').strip()
        if not 16<=len(value)<=4096 or any(not 33<=ord(c)<=126 for c in value):raise ValueError('Invalid provider key')
        fd=os.open(root/'near-ai-key',os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
        with os.fdopen(fd,'w') as f:f.write(value);f.flush();os.fsync(f.fileno())
        print('Protected key installed. No model call or AI-policy change was made.');return
    config=read_config(args.config);root=private_root(config['data_dir']);vault=WorkerVault(root/'vault')
    gateway_config=dict(config['gateway'])
    if gateway_config.get('worker_key_id')!=public_manifest(vault)['worker_key_id']:raise ValueError('Config does not match worker encryption identity')
    gateway=RPCGateway(gateway_config)
    try:
        gateway.start()
        if args.action=='reconcile':print(json.dumps(gateway.reconcile()));return
        if not 0<=args.steps<=10000 or not 2<=args.interval<=3600:raise ValueError('Invalid bounded run settings')
        engine_class=CompanyExecutor
        if args.profile=='business-operations-v1':
            from executor.operations import BusinessExecutor
            engine_class=BusinessExecutor
        if (args.autonomous or args.local_model) and args.profile!='business-operations-v1':raise ValueError('Business runtime flags require the business operations profile')
        engine=engine_class(gateway,vault,root,sandbox=gateway_config['network']=='sandbox',**({'autonomous':args.autonomous,'local_model':args.local_model} if args.profile=='business-operations-v1' else {}))
        iteration=0;last=None
        while args.steps==0 or iteration<args.steps:
            try:status=engine.tick()
            except Exception as exc:
                # Keep prompt, credentials and provider errors out of logs.
                print(json.dumps({'status':'halted','error_kind':type(exc).__name__,'action':'Inspect chain receipts and private configuration before restarting'}),flush=True)
                return 2
            if status!=last:print(json.dumps(status),flush=True);last=status
            iteration+=1
            if args.steps==0 or iteration<args.steps:time.sleep(args.interval)
    finally:gateway.close()


if __name__=='__main__':
    def stop(_signal,_frame):raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM,stop)
    try:raise SystemExit(main())
    except KeyboardInterrupt:pass
    except Exception as error:
        print(json.dumps({'status':'startup_refused','error_kind':type(error).__name__,'action':'Inspect protected setup; no automatic reset or retry'}));raise SystemExit(2)
