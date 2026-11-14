"""Private subprocess protocol for one bounded, authorized HTTP request."""
import base64
import json
import sys
from executor.qa import ScopedQA


def main():
    raw=sys.stdin.buffer.read(4097)
    if len(raw)>4096:raise ValueError('Invalid fetch request')
    request=json.loads(raw)
    if not isinstance(request,dict) or set(request)!={'target','path','sandbox'} or type(request['sandbox']) is not bool:raise ValueError('Invalid fetch request')
    checker=ScopedQA(request['target'],sandbox=request['sandbox'])
    status,body=checker._get_direct(request['path'])
    sys.stdout.write(json.dumps({'status':status,'body':base64.b64encode(body).decode('ascii')}))


if __name__=='__main__':
    try:main()
    except Exception:raise SystemExit(1)
