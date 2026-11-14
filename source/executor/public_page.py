"""Read-only, pinned NEAR static-page viewer. No signer or private company data.

HTML is confined to an empty-sandbox srcdoc frame under restrictive HTTP CSP.
The exact UTF-8 publication bytes remain independently downloadable as text.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import html
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import json
from pathlib import Path
import re
import threading

from executor.wallet_auth import NearWalletAuthority,_account,_b58,_private_root,_read
from executor.portability import strict_json

PROFILE='near-public-static-page-v1'
ROOT=Path(__file__).resolve().parents[1]
CSP="default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"
CHILD_CSP="default-src 'none'; style-src 'unsafe-inline'; frame-src 'none'; connect-src 'none'; img-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
STATE_FIELDS={'profile','publisher_id','owner','enabled','count','max_versions','max_html_bytes','active_version','active_sha256','storage_collected','storage_byte_cost','storage_reservation_bytes','storage_refundable','storage_withdrawable','history_public','disable_erases_history','business_cash','business_revenue','model_calls','dns_managed','observed_at'}
PAGE_FIELDS={'profile','publisher_id','owner','version','title','html','html_sha256','source','record_sha256','published_at','source_independently_verified'}

def digest(value):return hashlib.sha256(value if isinstance(value,bytes) else value.encode()).hexdigest()
def canonical(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'),allow_nan=False)
def exact(value,fields):
    if not isinstance(value,dict) or set(value)!=set(fields):raise ValueError('Unexpected public page fields')
    return value
def sha(value):
    if not isinstance(value,str) or not re.fullmatch(r'[0-9a-f]{64}',value):raise ValueError('Invalid public page hash')
    return value
def amount(value):
    if not isinstance(value,str) or not re.fullmatch(r'0|[1-9][0-9]{0,38}',value) or int(value)>2**128-1:raise ValueError('Exact bounded public amount required')
    return value
def text(value,maximum):
    if not isinstance(value,str) or not value.strip() or len(value.encode())>maximum or any(ord(c)<32 and c not in '\r\n\t' or ord(c)==127 for c in value):raise ValueError('Invalid bounded public text')
    return value
def load_configuration(value):
    path=Path(value)
    if not path.is_absolute() or path!=path.resolve() or path==ROOT or ROOT in path.parents and path.relative_to(ROOT).parts[0]!='.artifacts':raise ValueError('Canonical protected public viewer configuration required')
    _private_root(path.parent);return strict_json(_read(path))
def record_hash(record):
    source=record['source']
    return digest(canonical([PROFILE,record['publisher_id'],record['owner'],record['version'],record['title'],record['html_sha256'],None if source is None else [source['company_id'],source['task_id'],source['evidence_hash']]]))
def validate_publication(record,publisher,owner):
    exact(record,PAGE_FIELDS)
    if record['profile']!=PROFILE or record['publisher_id']!=publisher or record['owner']!=owner or type(record['version']) is not int or not 1<=record['version']<=16 or record['source_independently_verified'] is not False:raise ValueError('Public page identity or verification claim changed')
    text(record['title'],128);text(record['html'],16384);sha(record['html_sha256']);sha(record['record_sha256']);amount(record['published_at'])
    if record['source'] is not None:
        source=exact(record['source'],('company_id','task_id','evidence_hash'));_account(source['company_id']);sha(source['evidence_hash'])
        if not isinstance(source['task_id'],str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,64}',source['task_id']) or source['task_id'] in ('constructor','prototype','__proto__'):raise ValueError('Invalid source task')
    if digest(record['html'])!=record['html_sha256'] or record_hash(record)!=record['record_sha256']:raise ValueError('Public page content commitment changed')
    return record

class PublicPageReader:
    def __init__(self,*,authority,publisher_id,owner_id):
        self.authority=NearWalletAuthority(**authority);_account(publisher_id);_account(owner_id)
        if set(self.authority.companies)!={publisher_id}:raise ValueError('One fixed public publisher required')
        self.publisher=publisher_id;self.owner=owner_id;self.height=-1;self.lock=threading.Lock()
    def _view(self,method,args,block):
        response=self.authority._rpc('query',{'request_type':'call_function','account_id':self.publisher,'method_name':method,'args_base64':base64.b64encode(canonical(args).encode()).decode(),'block_id':block['hash']})
        self._block(response,block);raw=response.get('result')
        if not isinstance(raw,list) or len(raw)>49152 or any(type(n) is not int or not 0<=n<=255 for n in raw):raise ValueError('Invalid bounded public view bytes')
        return strict_json(bytes(raw))
    @staticmethod
    def _block(response,block):
        if response.get('block_hash')!=block['hash'] or type(response.get('block_height')) is not int or response['block_height']!=block['height']:raise ValueError('Public view left its FINAL block')
    def read(self,version=None):
        if version is not None and (type(version) is not int or not 1<=version<=16):raise ValueError('Bounded historical version required')
        with self.lock:
            a=self.authority
            if a._rpc('status',[]).get('chain_id')!=a.chain_id:raise ValueError('Public page chain identity changed')
            genesis=a._rpc('block',{'block_id':a.genesis_height}).get('header',{})
            if genesis.get('hash')!=a.genesis_hash or genesis.get('height')!=a.genesis_height:raise ValueError('Public page genesis changed')
            header=a._rpc('block',{'finality':'final'}).get('header',{});block={'hash':header.get('hash'),'height':header.get('height')};_b58(block['hash'],32)
            if type(block['height']) is not int or block['height']<max(a.genesis_height,self.height):raise ValueError('Public FINAL height regressed')
            account=a._rpc('query',{'request_type':'view_account','account_id':self.publisher,'block_id':block['hash']});self._block(account,block)
            if account.get('code_hash')!=a.companies[self.publisher]:raise ValueError('Public publisher code changed')
            current=self._view('current',{},block);exact(current,('state','publication'));state=exact(current['state'],STATE_FIELDS)
            if state['profile']!=PROFILE or state['publisher_id']!=self.publisher or state['owner']!=self.owner or type(state['enabled']) is not bool or type(state['count']) is not int or not 0<=state['count']<=16 or type(state['active_version']) is not int or not 0<=state['active_version']<=state['count'] or state['max_versions']!=16 or state['max_html_bytes']!=16384:raise ValueError('Public publisher state changed')
            for key in ('storage_collected','storage_byte_cost','storage_reservation_bytes','business_cash','business_revenue','observed_at'):amount(state[key])
            if state['storage_reservation_bytes']!='65536' or state['business_cash']!='0' or state['business_revenue']!='0' or type(state['model_calls']) is not int or state['model_calls']!=0 or any(state[key] is not False for key in ('storage_refundable','storage_withdrawable','disable_erases_history','dns_managed')) or state['history_public'] is not True:raise ValueError('Unexpected public page powers or accounting')
            if state['active_version']:
                sha(state['active_sha256'])
            elif state['active_sha256'] is not None or state['count']!=0:raise ValueError('Invalid initial public version')
            publication=current['publication']
            if state['enabled'] and state['active_version']:
                validate_publication(publication,self.publisher,self.owner)
                if publication['version']!=state['active_version'] or publication['record_sha256']!=state['active_sha256']:raise ValueError('Active public page changed')
            elif publication is not None:raise ValueError('Disabled publisher returned active content')
            if version is not None:
                publication=self._view('publication',{'version':version},block)
                if publication is not None:
                    validate_publication(publication,self.publisher,self.owner)
                    if publication['version']!=version or version>state['count']:raise ValueError('Historical public page changed')
            self.height=block['height']
            return {'schema':1,'boundary':{'network':a.network,'chain_id':a.chain_id,'genesis_hash':a.genesis_hash,'publisher_id':self.publisher,'owner':self.owner,'code_hash':a.companies[self.publisher],**block},'state':state,'publication':publication,'historical':version is not None,'live_hosting_verified':False,'dns_managed':False}

def render(snapshot):
    record=snapshot['publication'];boundary=snapshot['boundary'];escape=lambda value:html.escape(str(value),quote=True)
    title=record['title'] if record else 'Public page unavailable'
    notice='PUBLIC ARCHIVE · previous versions remain public' if snapshot['historical'] else 'PUBLIC STATIC PAGE · owner-approved copy remains unverified'
    framed='<!doctype html><meta http-equiv="Content-Security-Policy" content="'+CHILD_CSP+'">'+record['html'] if record else ''
    frame='<iframe title="Public owner-approved page" sandbox="" referrerpolicy="no-referrer" srcdoc="'+escape(framed)+'"></iframe>' if record else '<main><h1>Public page unavailable</h1><p>No active publication is available.</p></main>'
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(title)+'</title><style>body{margin:0;background:#f7f4eb;color:#233423;font:15px/1.5 system-ui}header,footer{padding:16px 24px;overflow-wrap:anywhere}header{border-bottom:1px solid #c5ccb9}small{display:block}iframe{width:100%;height:78vh;border:0;background:white}main{padding:32px}a{color:inherit}</style><header><strong>'+notice+'</strong><small>'+escape(boundary['publisher_id'])+' · FINAL '+escape(boundary['height'])+' · '+escape(boundary['hash'])+'</small></header>'+frame+'<footer><small>No model, wallet, payment, customer data or DNS authority is granted by this viewer. Source references are owner assertions, not independently verified results.</small>'+('<small>HTML SHA-256 '+escape(record['html_sha256'])+' · record '+escape(record['record_sha256'])+'</small><a href="/source/'+str(record['version'])+'">Read exact published source as text</a>' if record else '')+'</footer></html>').encode()

def handler_for(reader):
    class Handler(BaseHTTPRequestHandler):
        protocol_version='HTTP/1.1';server_version='PublicPageViewer'
        def log_message(self,*unused):pass
        def setup(self):super().setup();self.connection.settimeout(10)
        def _send(self,status,raw,content='text/html; charset=utf-8'):
            self.send_response(status);self.send_header('Connection','close');self.close_connection=True
            for name,value in [('Content-Type',content),('Content-Length',str(len(raw))),('Cache-Control','no-store'),('Content-Security-Policy',CSP),('Referrer-Policy','no-referrer'),('X-Content-Type-Options','nosniff'),('Permissions-Policy','camera=(), microphone=(), geolocation=()')]:self.send_header(name,value)
            self.end_headers();self.wfile.write(raw)
        def do_GET(self):
            try:
                match=re.fullmatch(r'/(version|source)/(1[0-6]|[1-9])',self.path)
                if self.path not in ('/','/manifest.json') and not match:return self._send(404,b'Unknown public page','text/plain; charset=utf-8')
                snapshot=reader.read(int(match[2]) if match else None)
                if self.path=='/manifest.json':return self._send(200,canonical({**snapshot,'publication':None if snapshot['publication'] is None else {k:v for k,v in snapshot['publication'].items() if k!='html'}}).encode(),'application/json; charset=utf-8')
                if match and match[1]=='source':return self._send(200 if snapshot['publication'] else 404,(snapshot['publication']['html'] if snapshot['publication'] else 'Published version missing').encode(),'text/plain; charset=utf-8')
                return self._send(200 if snapshot['publication'] else 404,render(snapshot))
            except Exception:self._send(503,b'Public chain evidence unavailable; no cached content served.','text/plain; charset=utf-8')
    return Handler

class PublicHTTPServer(ThreadingHTTPServer):
    daemon_threads=True;request_queue_size=8
    def __init__(self,*args,**kwargs):self.slots=threading.BoundedSemaphore(8);super().__init__(*args,**kwargs)
    def process_request(self,request,address):
        if not self.slots.acquire(blocking=False):self.shutdown_request(request);return
        try:super().process_request(request,address)
        except Exception:self.slots.release();raise
    def process_request_thread(self,request,address):
        try:super().process_request_thread(request,address)
        finally:self.slots.release()

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',required=True);args=parser.parse_args();config=load_configuration(args.config);exact(config,('schema','port','authority','publisher_id','owner_id'))
    if config['schema']!=1 or type(config['port']) is not int or not 1024<=config['port']<=65535:raise ValueError('Invalid public viewer configuration')
    reader=PublicPageReader(authority=config['authority'],publisher_id=config['publisher_id'],owner_id=config['owner_id']);server=PublicHTTPServer(('127.0.0.1',config['port']),handler_for(reader))
    print(canonical({'ready':True,'address':'127.0.0.1','port':config['port'],'signs_transactions':False,'model_calls':0,'public_hosting_verified':False}),flush=True)
    try:server.serve_forever(poll_interval=0.2)
    finally:server.server_close()

if __name__=='__main__':main()
