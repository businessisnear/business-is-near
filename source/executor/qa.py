"""Bounded website QA with a single owner-approved origin and path scope.

HTTPS connections pin a public DNS answer and retain original TLS SNI/certificate
validation. No proxies, redirects, scripts, forms or external subresources run.
The sole loopback exception is the explicit bundled sandbox fixture.
"""
import hashlib
import http.client
import ipaddress
import socket
import ssl
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
from urllib.parse import urljoin,urlsplit
from qa.runner import _Page,DEMO_URL

MAX_BODY=262144


def safe_base(value,sandbox=False):
    if not isinstance(value,str) or len(value)>500 or any(ord(c)<33 or ord(c)>126 for c in value) or '\\' in value or '%' in value:raise ValueError('Invalid approved target')
    p=urlsplit(value)
    if sandbox and value==DEMO_URL:return p
    if p.scheme!='https' or not p.hostname or p.username or p.password or p.query or p.fragment or p.port not in (None,443) or not p.path.endswith('/'):
        raise ValueError('Approved target must be a public HTTPS directory URL')
    if any(s in ('.','..') for s in p.path.split('/')):raise ValueError('Invalid approved path')
    return p


def public_addresses(host,port=443,resolver=socket.getaddrinfo):
    rows=resolver(host,port,type=socket.SOCK_STREAM)
    ips=list(dict.fromkeys(row[4][0] for row in rows))
    if not ips or len(ips)>32:raise ValueError('Invalid target DNS')
    for value in ips:
        ip=ipaddress.ip_address(value)
        if (not ip.is_global or ip.is_reserved or ip.is_multicast or ip.is_unspecified
                or (getattr(ip,'ipv4_mapped',None) and not ip.ipv4_mapped.is_global)):
            raise ValueError('Private or reserved network access forbidden')
    # The first supported profile connects only to public IPv4. IPv6 transition
    # and deployment-specific translation prefixes can hide private IPv4 targets.
    ipv4=[value for value in ips if ipaddress.ip_address(value).version==4]
    if not ipv4:raise ValueError('Target must offer a public IPv4 address')
    return ipv4


class ScopedQA:
    def __init__(self,target,*,sandbox=False,fetcher=None):
        self.target=target;self.base=safe_base(target,sandbox);self.local=sandbox and target==DEMO_URL;self.fetcher=fetcher
    def _path(self,href):
        if not isinstance(href,str) or len(href)>256 or '%' in href or '\\' in href or any(ord(c)<33 or ord(c)>126 for c in href):return None
        p=urlsplit(urljoin(self.target,href))
        if p.scheme!=self.base.scheme or p.netloc!=self.base.netloc or p.username or p.password or p.query or p.fragment:return None
        if not p.path.startswith(self.base.path):return None
        return p.path
    def _get(self,path):
        if self._path(path)!=path:raise ValueError('Path escapes authorized scope')
        if self.fetcher:return self.fetcher(path)
        # A killable subprocess bounds DNS, TLS and slow-drip bodies together;
        # a socket inactivity timeout alone does not bound a hostile web server.
        root=Path(__file__).resolve().parents[1]
        try:
            result=subprocess.run([sys.executable,'-m','executor.fetch'],input=json.dumps({'target':self.target,'path':path,'sandbox':self.local}).encode(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,cwd=root,
                env={'PATH':os.environ.get('PATH','/usr/bin:/bin'),'PYTHONPATH':str(root)},timeout=8,check=True)
            if len(result.stdout)>360000:raise ValueError('Website response exceeds scope')
            value=json.loads(result.stdout);body=base64.b64decode(value['body'],validate=True)
            if type(value['status']) is not int or not 100<=value['status']<=599 or len(body)>MAX_BODY:raise ValueError('Invalid fetch result')
            return value['status'],body
        except (subprocess.SubprocessError,ValueError,KeyError) as exc:raise ValueError('Scoped fetch failed or exceeded its absolute deadline') from exc
    def _get_direct(self,path):
        # Called only by the short-lived fixed fetch program, never arbitrary code.
        if self._path(path)!=path:raise ValueError('Path escapes authorized scope')
        if self.local:conn=http.client.HTTPConnection('127.0.0.1',8788,timeout=5)
        else:
            # Revalidate DNS for every request, then connect to a numeric pinned
            # address; HTTPSConnection still validates the original hostname.
            ip=public_addresses(self.base.hostname)[0]
            conn=http.client.HTTPSConnection(self.base.hostname,443,timeout=5,context=ssl.create_default_context())
            conn._create_connection=lambda address,timeout,source_address=None:socket.create_connection((ip,443),timeout,source_address)
        try:
            conn.request('GET',path,headers={'Accept':'text/html','User-Agent':'ProofWork-ScopedQA/1.0'})
            response=conn.getresponse();body=response.read(MAX_BODY+1)
            if len(body)>MAX_BODY:raise ValueError('Website response exceeds scope')
            return response.status,body
        finally:conn.close()
    def run(self):
        status,body=self._get(self.base.path or '/')
        if status!=200:raise ValueError('Approved homepage was unavailable; no report issued')
        page=_Page();page.feed(body.decode('utf-8','replace'));findings=[];checked=[];seen=set();skipped=0
        for href in page.links[:8]:
            path=self._path(href)
            if path is None:skipped+=1;continue
            if path in seen:continue
            seen.add(path);code,_=self._get(path);checked.append({'path':path,'status':code})
            if code>=400:findings.append({'id':'link:'+path,'category':'Broken link','severity':'medium','title':f'Link returns HTTP {code}','evidence':f'GET {path} returned HTTP {code}','reproduction':f'Open {self.target} and follow the link to {path}.','path':path,'status':code})
        for index,image in enumerate(page.images[:8]):
            if 'alt' not in image:
                src=str(image.get('src','(no src)'))[:120]
                findings.append({'id':f'image-alt:{index}','category':'Accessibility','severity':'medium','title':'Image has no alt attribute','evidence':f'Image {index+1} src={src!r} has no alt attribute','reproduction':f'Open {self.target}, inspect image {index+1}, and check its missing alt attribute.'})
        return {'target':self.target,'specialist':'scoped-site-inspector.v1','method':'Bounded HTTP and HTML inspection; model does not generate evidence',
                'checks':{'homepage_status':status,'homepage_sha256':hashlib.sha256(body).hexdigest(),'links_checked':checked,'out_of_scope_links_skipped':skipped,'links_truncated':len(page.links)>8,'images_inspected':min(8,len(page.images)),'images_truncated':len(page.images)>8},'findings':findings}
    def verify(self,report):
        current=self.run()
        valid=isinstance(report,dict) and report==current
        return {'verified':valid,'reason':'Independent scoped HTTP recheck' if valid else 'Independent observations differed','findings':current['findings'] if valid else [],'recheck':current['checks']}
