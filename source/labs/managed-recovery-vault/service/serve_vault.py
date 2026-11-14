"""All rights reserved. Same-origin loopback managed recovery host.

Root starts this only after source/UI review. No transaction/worker/model API.
"""
from __future__ import annotations
import argparse,json,mimetypes,os,re,stat,threading
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from http.cookies import SimpleCookie
from urllib.parse import urlsplit
from vault_service import ManagedRecovery,NearWalletAuthority,AuthenticationError,exact,strict_json
from wallet_auth import _read,_private_root,_token,canonical

SESSION='proofwork_owner_session';BROWSER='proofwork_owner_browser';CSRF='proofwork_owner_csrf'
def load_configuration(path):
    path=Path(path)
    if not path.is_absolute():raise AuthenticationError('Absolute private configuration path required')
    _private_root(path.parent);cfg=strict_json(_read(path));exact(cfg,('schema','origin','port','data_dir','authority','ui_dir','static_files'))
    if type(cfg['schema']) is not int or cfg['schema']!=1 or type(cfg['port']) is not int or not 1024<=cfg['port']<=65535:raise AuthenticationError('Invalid vault host configuration')
    origin=urlsplit(cfg['origin'])
    if cfg['origin']!='http://127.0.0.1:'+str(cfg['port']) and (origin.scheme!='https' or not origin.hostname or origin.username or origin.password or origin.path or origin.query or origin.fragment or cfg['origin'].endswith('/')):raise AuthenticationError('Exact same-origin deployment required')
    root=Path(cfg['data_dir']);ui=Path(cfg['ui_dir'])
    if not root.is_absolute() or not ui.is_absolute() or root.resolve()!=root or ui.resolve()!=ui or root==ui or ui in root.parents:raise AuthenticationError('Separate absolute private and static paths required')
    assets=static_assets(ui,cfg['static_files']);authority=NearWalletAuthority(**cfg['authority']);service=ManagedRecovery(root,cfg['origin'],authority)
    return cfg,service,assets
def static_assets(root,files):
    if not isinstance(files,dict) or not 1<=len(files)<=32 or '/__vault/' not in files or '/wallet-auth-callback.html' not in files:raise AuthenticationError('Explicit static UI allowlist required')
    result={};total=0
    for route,relative in files.items():
        if not isinstance(route,str) or not re.fullmatch(r'/[A-Za-z0-9_./-]*',route) or '..' in route or route.startswith('/__private/') or not isinstance(relative,str):raise AuthenticationError('Invalid fixed static route')
        path=root/relative
        if Path(relative).is_absolute() or '..' in Path(relative).parts or path.resolve()!=path or root not in path.parents:raise AuthenticationError('Static UI escaped reviewed root')
        info=path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1 or info.st_size>2*1024*1024:raise AuthenticationError('Invalid reviewed static asset')
        content=path.read_bytes();total+=len(content)
        if total>16*1024*1024:raise AuthenticationError('Static UI bound exceeded')
        mime=mimetypes.guess_type(path.name)[0] or 'application/octet-stream';result[route]=(content,mime)
    return result
def cookie(name,value,secure=False,http_only=False,expire=False):return name+'='+value+'; Path=/; SameSite=Strict'+('; Secure' if secure else '')+('; HttpOnly' if http_only else '')+('; Max-Age=0' if expire else '; Max-Age='+('900' if name in (SESSION,CSRF) else '3600'))
def cookies(headers):
    raw=headers.get_all('Cookie') or []
    if len(raw)>1 or raw and len(raw[0])>8192:raise AuthenticationError('Invalid cookie header')
    raw=raw[0] if raw else '';names=[x.strip().partition('=')[0] for x in raw.split(';') if x.strip()]
    if any(names.count(n)>1 for n in (SESSION,BROWSER,CSRF)):raise AuthenticationError('Duplicate private cookie')
    parsed=SimpleCookie();parsed.load(raw);return {k:m.value for k,m in parsed.items()}
def validate_post(headers,origin):
    if headers.get_all('Origin')!=[origin] or headers.get_all('Content-Type')!=['application/json'] or headers.get_all('Transfer-Encoding'):raise AuthenticationError('Exact same-origin JSON required')
    lengths=headers.get_all('Content-Length') or []
    if len(lengths)!=1 or not re.fullmatch(r'[1-9][0-9]{0,5}',lengths[0]) or int(lengths[0])>131072:raise AuthenticationError('Bounded JSON body required')
    return int(lengths[0])
def handler_for(service,port,assets):
    class Handler(BaseHTTPRequestHandler):
        protocol_version='HTTP/1.1';server_version='ManagedRecovery'
        def log_message(self,*unused):pass
        def setup(self):super().setup();self.connection.settimeout(10)
        def host(self):
            if self.headers.get_all('Host')!=['127.0.0.1:'+str(port)]:raise AuthenticationError('Exact managed host required')
        def send(self,status,value,cookie_values=(),mime='application/json; charset=utf-8'):
            raw=value if isinstance(value,bytes) else canonical(value).encode();self.send_response(status);self.send_header('Connection','close');self.close_connection=True
            for k,v in [('Content-Type',mime),('Content-Length',str(len(raw))),('Cache-Control','no-store'),('Referrer-Policy','no-referrer'),('X-Content-Type-Options','nosniff'),('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")]:self.send_header(k,v)
            for c in cookie_values:self.send_header('Set-Cookie',c)
            self.end_headers();self.wfile.write(raw)
        def do_GET(self):
            try:
                self.host()
                if self.path=='/__private/config':return self.send(200,service.public())
                if self.path in assets:
                    raw,mime=assets[self.path];return self.send(200,raw,mime=mime)
                return self.send(404,{'error':'Unknown managed route'})
            except Exception:self.send(403,{'error':'Managed recovery request denied'})
        def do_POST(self):
            try:
                self.host();size=validate_post(self.headers,service.origin);raw=self.rfile.read(size)
                if len(raw)!=size:raise AuthenticationError('Incomplete bounded body')
                body=strict_json(raw);saved=cookies(self.headers);secure=service.origin.startswith('https://')
                if self.path=='/__private/auth/challenge':
                    exact(body,('company_id','account_id'))
                    if body['company_id'] not in service.authority.companies:raise AuthenticationError('Company not enabled')
                    browser=saved.get(BROWSER)
                    try:_token(browser)
                    except AuthenticationError:
                        import secrets
                        browser=secrets.token_urlsafe(32)
                    value=service.auth.begin(body['company_id'],body['account_id'],browser)
                    return self.send(200,value,[cookie(BROWSER,browser,secure,http_only=True)])
                if self.path=='/__private/auth/exchange':
                    exact(body,('signed',));value=service.auth.exchange(body['signed'],saved.get(BROWSER));token=value.pop('token')
                    return self.send(200,value,[cookie(SESSION,token,secure,http_only=True),cookie(CSRF,value['csrf'],secure)])
                if self.path in ('/__private/auth/session','/__private/auth/logout'):
                    if self.headers.get_all('X-Proof-CSRF') is None or len(self.headers.get_all('X-Proof-CSRF'))!=1:raise AuthenticationError('Exact CSRF required')
                    exact(body,('company_id',));value=service.auth.authorize(saved.get(SESSION),self.headers.get('X-Proof-CSRF'),body['company_id'])
                    if self.path.endswith('/logout'):
                        service.auth.logout(saved.get(SESSION));return self.send(200,{'logged_out':True},[cookie(SESSION,'',secure,http_only=True,expire=True),cookie(CSRF,'',secure,expire=True)])
                    return self.send(200,value)
                action={'/__private/recovery/save':'save','/__private/recovery/open':'open','/__private/recovery/list':'list','/__private/recovery/context':'context'}.get(self.path)
                if not action:return self.send(404,{'error':'Unknown managed route'})
                if self.headers.get_all('X-Proof-CSRF') is None or len(self.headers.get_all('X-Proof-CSRF'))!=1:raise AuthenticationError('Exact CSRF required')
                return self.send(200,service.operation(action,body,saved.get(SESSION),self.headers.get('X-Proof-CSRF')))
            except Exception:self.send(403,{'error':'Managed recovery request denied'})
    return Handler
class Server(ThreadingHTTPServer):
    daemon_threads=True;request_queue_size=8
    def __init__(self,*a,**k):self.slots=threading.BoundedSemaphore(8);super().__init__(*a,**k)
    def process_request(self,request,address):
        if not self.slots.acquire(blocking=False):self.shutdown_request(request);return
        try:super().process_request(request,address)
        except Exception:self.slots.release();raise
    def process_request_thread(self,request,address):
        try:super().process_request_thread(request,address)
        finally:self.slots.release()
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',required=True);parser.add_argument('--seconds',type=int,default=900);args=parser.parse_args()
    if not 30<=args.seconds<=1800:parser.error('Finite 30..1800 second window required')
    cfg,service,assets=load_configuration(args.config);server=Server(('127.0.0.1',cfg['port']),handler_for(service,cfg['port'],assets));timer=threading.Timer(args.seconds,server.shutdown);timer.daemon=True;timer.start()
    print(canonical({'ready':True,'port':cfg['port'],'custody':'service-wrapped','signs_transactions':False,'calls_models':False}),flush=True)
    try:server.serve_forever(poll_interval=.2)
    finally:timer.cancel();server.server_close();print(canonical({'stopped':True}),flush=True)
if __name__=='__main__':main()
