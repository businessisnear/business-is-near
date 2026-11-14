"""Loopback private media service authenticated with current NEAR ownership.

Run behind a same-origin UI proxy. No provider, model, signing or arbitrary path
endpoint exists. The existing local shared-token rehearsal remains separate.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from http.cookies import SimpleCookie
import json
from pathlib import Path
import re
import secrets
import threading
from executor.wallet_auth import (OwnerAuthentication,NearWalletAuthority,
    AuthenticationError,_private_root,_read,_token,canonical)
from executor.studio_workspace import Workspace
from executor.portability import strict_json

ROOT=Path(__file__).resolve().parents[1]
SESSION='proofwork_owner_session';BROWSER='proofwork_owner_browser';CSRF='proofwork_owner_csrf'

def exact(value,keys):
    if not isinstance(value,dict) or set(value)!=set(keys):raise AuthenticationError('Exact private API fields required')
    return value

def protected_path(value):
    path=Path(value)
    if not path.is_absolute():raise AuthenticationError('Absolute protected path required')
    if ROOT==path or ROOT in path.parents and path.relative_to(ROOT).parts[0]!='.artifacts':raise AuthenticationError('Private configuration/data cannot be placed in served source')
    return path

def load_configuration(value):
    path=protected_path(value);_private_root(path.parent);return strict_json(_read(path))

class PrivateWorkspaceService:
    def __init__(self,config):
        exact(config,('schema','origin','port','data_dir','authority'))
        if config['schema']!=1 or type(config['port']) is not int or not 1024<=config['port']<=65535:raise AuthenticationError('Invalid private service configuration')
        self.port=config['port'];self.origin=config['origin'];self.secure=self.origin.startswith('https://')
        path=protected_path(config['data_dir'])
        self.root=_private_root(path);self.authority=NearWalletAuthority(**config['authority']);self.auth=OwnerAuthentication(self.root/'authentication',self.origin,self.authority)
    def workspace(self,company):
        if company not in self.authority.companies:raise AuthenticationError('Company is not enabled')
        parent=_private_root(self.root/'companies');parent=_private_root(parent/hashlib.sha256(company.encode()).hexdigest());root=parent/'workspace'
        return Workspace(root,ROOT)
    def cookie(self,name,value,*,http_only=False,expire=False):
        text=name+'='+value+'; Path=/; SameSite=Strict'+('; Secure' if self.secure else '')+('; HttpOnly' if http_only else '')
        return text+('; Max-Age=0' if expire else '; Max-Age='+('900' if name in (SESSION,CSRF) else '3600'))
    def public(self):return {'schema':1,'origin':self.origin,'network':self.authority.network,'chain_id':self.authority.chain_id,'companies':self.authority.companies,'authentication':'NEP-413 owner; current FINAL full-access key and code pins','private_actions':['inventory','import','import_audio','asset','reuse'],'private_document_actions':['import','preview'],'document_worker_associated':False,'document_tasks':False,'signs_transactions':False,'calls_models':False}

def handler_for(service):
    class Handler(BaseHTTPRequestHandler):
        protocol_version='HTTP/1.1'
        server_version='PrivateWorkspace'
        def setup(self):
            super().setup();self.connection.settimeout(10)
        def log_message(self,*unused):pass
        def _send(self,status,value,cookies=()):
            data=canonical(value).encode();self.send_response(status);self.send_header('Connection','close');self.close_connection=True;self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('Referrer-Policy','no-referrer');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'")
            for cookie in cookies:self.send_header('Set-Cookie',cookie)
            self.end_headers();self.wfile.write(data)
        def _host(self):
            if self.headers.get_all('Host')!=['127.0.0.1:'+str(service.port)]:raise AuthenticationError('Exact private service Host required')
        def _cookies(self):
            headers=self.headers.get_all('Cookie') or []
            if len(headers)>1 or headers and len(headers[0])>8192:raise AuthenticationError('Invalid cookie header')
            raw=headers[0] if headers else '';names=[part.strip().partition('=')[0] for part in raw.split(';') if part.strip()]
            for name in (SESSION,BROWSER,CSRF):
                if names.count(name)>1:raise AuthenticationError('Duplicate authentication cookie')
            parsed=SimpleCookie();parsed.load(raw);return {name:morsel.value for name,morsel in parsed.items()}
        def do_GET(self):
            try:
                self._host()
                if self.path!='/__private/config':return self._send(404,{'error':'Unknown private endpoint'})
                self._send(200,service.public())
            except Exception:self._send(403,{'error':'Private workspace request denied'})
        def do_POST(self):
            try:
                self._host()
                if self.headers.get_all('Origin')!=[service.origin] or self.headers.get('Transfer-Encoding') or self.headers.get_all('Content-Type')!=['application/json']:raise AuthenticationError('Same-origin JSON request required')
                lengths=self.headers.get_all('Content-Length') or []
                if len(lengths)!=1 or not re.fullmatch(r'[1-9]\d{0,6}',lengths[0]) or int(lengths[0])>2097152:raise AuthenticationError('Bounded request length required')
                body=strict_json(self.rfile.read(int(lengths[0])));cookies=self._cookies();route=self.path
                if route=='/__private/auth/challenge':
                    exact(body,('company_id','account_id'))
                    if body['company_id'] not in service.authority.companies:raise AuthenticationError('Company is not enabled')
                    binding=cookies.get(BROWSER)
                    try:_token(binding)
                    except AuthenticationError:binding=secrets.token_urlsafe(32)
                    result=service.auth.begin(body['company_id'],body['account_id'],binding)
                    return self._send(200,result,[service.cookie(BROWSER,binding,http_only=True)])
                if route=='/__private/auth/exchange':
                    exact(body,('signed',));result=service.auth.exchange(body['signed'],cookies.get(BROWSER));token=result.pop('token')
                    return self._send(200,result,[service.cookie(SESSION,token,http_only=True),service.cookie(CSRF,result['csrf'])])
                if route=='/__private/auth/logout':
                    exact(body,('company_id',));service.auth.authorize(cookies.get(SESSION),self.headers.get('X-Proof-CSRF'),body['company_id']);service.auth.logout(cookies.get(SESSION))
                    return self._send(200,{'logged_out':True},[service.cookie(SESSION,'',http_only=True,expire=True),service.cookie(CSRF,'',expire=True)])
                if not isinstance(body,dict) or 'company_id' not in body:raise AuthenticationError('Company identity required')
                company=body['company_id'];identity=service.auth.authorize(cookies.get(SESSION),self.headers.get('X-Proof-CSRF'),company)
                if route=='/__private/auth/session':
                    exact(body,('company_id',));return self._send(200,identity)
                workspace=service.workspace(company);request={key:value for key,value in body.items() if key!='company_id'}
                if route in ('/__private/documents/import','/__private/documents/preview'):
                    from executor.document_input import document_api
                    # This derived owner workspace is NOT the operator's fixed
                    # worker directory. Import/preview grant no task readiness.
                    result=document_api(route.rsplit('/',1)[1],request,worker_dir=workspace.root,company_id=company,worker_associated=False)
                elif route=='/__private/media/inventory':exact(request,());result=workspace.inventory()
                elif route=='/__private/media/import':result=workspace.add(request)
                elif route=='/__private/media/import_audio':result=workspace.add_audio(request)
                elif route.startswith('/__private/native-watch/'):
                    from executor.native_watch_api import native_watch_api
                    result=native_watch_api(service,company,identity,route.rsplit('/',1)[1],request)
                elif route=='/__private/media/asset':exact(request,('asset_id',));result=workspace.asset(request['asset_id'])
                elif route=='/__private/media/reuse':
                    exact(request,('asset_id','import_id','operation_id','scope_hash','role'));boundary=identity['boundary']
                    params={'request_type':'call_function','account_id':company,'method_name':'company_task','args_base64':base64.b64encode(canonical({'id':request['operation_id']}).encode()).decode(),'block_id':boundary['block_hash']}
                    view=service.authority._rpc('query',params)
                    if view.get('block_hash')!=boundary['block_hash'] or view.get('block_height')!=boundary['block_height']:raise AuthenticationError('Association left its FINAL boundary')
                    raw=view.get('result')
                    if not isinstance(raw,list) or len(raw)>32768 or any(type(x) is not int or not 0<=x<=255 for x in raw):raise AuthenticationError('Invalid approved task view')
                    task=json.loads(bytes(raw))
                    if not isinstance(task,dict) or task.get('scope_hash')!=request['scope_hash'] or not task.get('operation') or task.get('status')=='cancelled':raise AuthenticationError('Actual approved company task required')
                    result=workspace.reuse({**request,'chain_reference':{'hash':boundary['block_hash'],'height':boundary['block_height'],'code_hash':boundary['code_hash'],'contract':company}})
                else:return self._send(404,{'error':'Unknown private endpoint'})
                self._send(200,result)
            except Exception:self._send(403,{'error':'Private workspace request denied'})
    return Handler

class PrivateHTTPServer(ThreadingHTTPServer):
    request_queue_size=8
    daemon_threads=True
    def __init__(self,*args,**kwargs):
        self.slots=threading.BoundedSemaphore(8);super().__init__(*args,**kwargs)
    def process_request(self,request,address):
        if not self.slots.acquire(blocking=False):self.shutdown_request(request);return
        try:super().process_request(request,address)
        except Exception:self.slots.release();raise
    def process_request_thread(self,request,address):
        try:super().process_request_thread(request,address)
        finally:self.slots.release()

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',required=True);args=parser.parse_args();service=PrivateWorkspaceService(load_configuration(args.config))
    server=PrivateHTTPServer(('127.0.0.1',service.port),handler_for(service))
    print(canonical({'ready':True,'address':'127.0.0.1','port':service.port,'provider_calls':0,'model_calls':0}),flush=True)
    try:server.serve_forever(poll_interval=0.2)
    finally:server.server_close()

if __name__=='__main__':main()
