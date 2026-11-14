"""Prepare public-pin configuration only. Never generates/reads a vault key.

All rights reserved. No listener, RPC, wallet or transaction is started here.
"""
import argparse,json,os,sys
from pathlib import Path
CAPSULE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(CAPSULE/'service'))
from vault_service import strict_json,exact,NearWalletAuthority,AuthenticationError
from wallet_auth import _private_root,_read,canonical

def prepare(pins_path,state_dir,port):
    if type(port) is not int or not 1024<=port<=65535:raise AuthenticationError('Port must be1024..65535')
    pins_raw=Path(pins_path).read_bytes()
    if len(pins_raw)>16384:raise AuthenticationError('Public pin document exceeds bound')
    pins=strict_json(pins_raw);exact(pins,('network','chain_id','rpc_url','genesis_height','genesis_hash','companies','sandbox'))
    if pins['network']!='testnet':raise AuthenticationError('This initial standalone UI is testnet only')
    NearWalletAuthority(**pins) # validates exact trusted public pins, makes NO RPC
    manifest=strict_json((CAPSULE/'STATIC-MANIFEST.json').read_bytes())
    root=Path(state_dir).expanduser().absolute()
    if CAPSULE==root or CAPSULE in root.parents:raise AuthenticationError('Keep protected state OUTSIDE the source capsule')
    root=_private_root(root);path=root/'managed-vault-config.json'
    cfg={'schema':1,'origin':'http://127.0.0.1:'+str(port),'port':port,'data_dir':str(root/'vault-data'),'authority':pins,'ui_dir':str((CAPSULE/manifest['ui_dir']).resolve()),'static_files':manifest['static_files']}
    if path.exists():
        if strict_json(_read(path))!=cfg:raise AuthenticationError('Existing configuration differs; never replace it automatically')
        return path,False
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    try:
        with os.fdopen(fd,'wb') as stream:stream.write(canonical(cfg).encode());stream.flush();os.fsync(stream.fileno())
        directory=os.open(root,os.O_RDONLY)
        try:os.fsync(directory)
        finally:os.close(directory)
    except Exception:
        # Leave uncertain original bytes for inspection; never silently replace.
        raise
    return path,True
def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--public-pins',required=True);p.add_argument('--state-dir',required=True);p.add_argument('--port',required=True,type=int);args=p.parse_args()
    path,created=prepare(args.public_pins,args.state_dir,args.port)
    print(json.dumps({'configuration':str(path),'created':created,'server_started':False,'key_generated_by_bootstrap':False,'existing_vault_state':'retained; service refuses lost initialized keys'}))
if __name__=='__main__':main()
