"""Killable fixed-endpoint transport; called only after budget reservation."""
import json
import os
from pathlib import Path
import subprocess
import sys
from app.near_ai_client import _http


def isolated_transport(payload,key):
    root=Path(__file__).resolve().parents[1]
    raw=json.dumps({'payload':payload,'key':key},separators=(',',':')).encode()
    if len(raw)>16384:raise ValueError('Inference request too large')
    try:
        result=subprocess.run([sys.executable,'-m','executor.inference'],input=raw,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,cwd=root,
            env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'PYTHONPATH':str(root)},timeout=25,check=True)
        if len(result.stdout)>131072:raise ValueError('Inference response too large')
        return json.loads(result.stdout)
    except (subprocess.SubprocessError,ValueError) as exc:raise ValueError('Inference outcome unknown') from exc


def main():
    raw=sys.stdin.buffer.read(16385)
    if len(raw)>16384:raise ValueError('Invalid inference input')
    value=json.loads(raw)
    if not isinstance(value,dict) or set(value)!={'payload','key'} or not isinstance(value['key'],str) or not 16<=len(value['key'])<=4096:raise ValueError('Invalid inference input')
    # _http has a fixed HTTPS host/path, bounded response, and no redirects/proxy.
    result=_http(value['payload'],value['key'])
    sys.stdout.write(json.dumps(result,separators=(',',':')))


if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit(1)
