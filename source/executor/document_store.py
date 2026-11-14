"""Company-bound private document bytes and deterministic, bounded extraction.

Import grants no task authority. Native PDF text is an extraction, not an exact
raw-byte quote, OCR, image analysis, active PDF execution or fact verification.
"""
import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
from executor.document_native import LIMITS

PROFILE='owner-document-input-v1'
FORMATS=('utf8-text-v1','csv-v1','pdf-native-v1')
MAX_RAW=1048576;MAX_TEXT=65536;MAX_PAGES=8
ROOT=Path(__file__).resolve().parents[1]
class DocumentDeferred(ValueError):pass

def canonical(value):return json.dumps(value,ensure_ascii=True,sort_keys=True,separators=(',',':'),allow_nan=False)
def digest(value):return hashlib.sha256(value.encode('utf-8') if isinstance(value,str) else value).hexdigest()
def exact(value,keys):
    if not isinstance(value,dict) or set(value)!=set(keys):raise ValueError('Exact document fields required')
    return value

def sha(value):
    if not isinstance(value,str) or not re.fullmatch('[0-9a-f]{64}',value):raise ValueError('Exact document SHA-256 required')
    return value

def company(value):
    if not isinstance(value,str) or not 2<=len(value)<=64 or not re.fullmatch('[a-z0-9]+(?:[._-][a-z0-9]+)*',value):raise ValueError('Bound document company identity required')
    return value

def private_dir(path,create=False):
    path=Path(path).absolute()
    if create:path.mkdir(mode=0o700)
    info=path.lstat()
    if path.resolve()!=path or not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode&0o077:raise ValueError('Canonical owner-private document directory required')
    return path

def read_private(path,limit):
    private_dir(path.parent);fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        before=os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_uid!=os.getuid() or before.st_nlink!=1 or before.st_mode&0o077 or before.st_size>limit:raise ValueError('Bounded owner-private document file required')
        with os.fdopen(fd,'rb',closefd=False) as stream:raw=stream.read(limit+1)
        after=os.fstat(fd)
        if len(raw)>limit or any(getattr(before,key)!=getattr(after,key) for key in ('st_dev','st_ino','st_size','st_mtime_ns','st_ctime_ns')):raise ValueError('Private document changed while reading')
        return raw
    finally:os.close(fd)

def write_immutable(path,raw):
    private_dir(path.parent)
    try:fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    except FileExistsError:
        if read_private(path,max(MAX_RAW,len(raw)))!=raw:raise ValueError('Immutable document file conflicts with retained bytes')
        return
    with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
    parent=os.open(path.parent,os.O_RDONLY|getattr(os,'O_DIRECTORY',0))
    try:os.fsync(parent)
    finally:os.close(parent)

def _native(operation,binary,file=None,limit=MAX_TEXT):
    args=[sys.executable,'-m','executor.document_native',operation,binary]+([] if file is None else [str(file)])
    child=subprocess.Popen(args,cwd=ROOT,env={'PATH':'/usr/bin:/bin','PYTHONPATH':str(ROOT),'LANG':'C'},stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    deadline=time.monotonic()+LIMITS['wall_seconds'];output={'out':bytearray(),'err':bytearray()};selector=selectors.DefaultSelector()
    for stream,name in ((child.stdout,'out'),(child.stderr,'err')):os.set_blocking(stream.fileno(),False);selector.register(stream,selectors.EVENT_READ,name)
    try:
        while selector.get_map():
            remaining=deadline-time.monotonic()
            if remaining<=0:raise ValueError('Native document parser exceeded wall time')
            if sys.platform=='darwin' and child.poll() is None:
                # Darwin on this host refuses setrlimit for DATA/AS/RSS. A
                # retained child PID is monitored before/through native exec;
                # exceeding the resident budget kills its entire process group.
                usage=subprocess.run(['/bin/ps','-o','rss=','-p',str(child.pid)],stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=min(1,remaining),env={'PATH':'/usr/bin:/bin'})
                if usage.returncode==0:
                    if not usage.stdout.strip().isdigit():raise ValueError('Native document memory usage unavailable')
                    if int(usage.stdout.strip())*1024>LIMITS['memory_bytes']:raise ValueError('Native document parser exceeded resident memory bound')
                elif child.poll() is None:raise ValueError('Native document memory usage unavailable')
            for item,_ in selector.select(min(remaining,LIMITS['memory_poll_milliseconds']/1000)):
                chunk=os.read(item.fileobj.fileno(),4096)
                if not chunk:selector.unregister(item.fileobj);continue
                target=output[item.data];target.extend(chunk)
                if len(target)>(limit if item.data=='out' else 8192):raise ValueError('Native document parser exceeded output bound')
        if child.wait(timeout=max(0.01,deadline-time.monotonic()))!=0:raise ValueError('Native document parser refused the bounded input')
        return bytes(output['out']),bytes(output['err'])
    except BaseException:
        if child.poll() is None:os.killpg(child.pid,signal.SIGKILL)
        child.wait(timeout=2);raise
    finally:selector.close();child.stdout.close();child.stderr.close()

def parser_identity(format):
    if format not in FORMATS:raise ValueError('Supported bounded document format required')
    value={'profile':format,'implementation_sha256':digest(Path(__file__).read_bytes()),'python':sys.implementation.name+' '+'.'.join(map(str,sys.version_info[:3]))}
    binaries={}
    if format=='pdf-native-v1':
        value['native_helper_sha256']=digest((ROOT/'executor/document_native.py').read_bytes());value['limits']=LIMITS
        for name,operation in (('pdfinfo','info-version'),('pdftotext','text-version')):
            found=shutil.which(name)
            if not found:raise ValueError('Native PDF extraction is unavailable; no fallback or OCR is permitted')
            binary=str(Path(found).resolve());info=Path(binary).stat()
            if not stat.S_ISREG(info.st_mode) or info.st_mode&0o022 or info.st_size>10*1024*1024:raise ValueError('Protected native PDF binary required')
            out,err=_native(operation,binary,limit=2048);version=(out+err).decode('utf-8','strict').splitlines()[0]
            if not version.startswith(name+' version ') or len(version)>160:raise ValueError('Observed native PDF parser version required')
            value[name]={'sha256':digest(Path(binary).read_bytes()),'version':version};binaries[name]=binary
    return value,binaries

def _text(raw):
    text=raw.decode('utf-8','strict')
    if not text.lstrip('\ufeff').strip() or len(raw)>MAX_TEXT or any((ord(char)<32 and char not in '\n\r\t') or ord(char)==127 for char in text):raise ValueError('Readable bounded UTF-8 document text required')
    return text

def extract(raw,format):
    if not isinstance(raw,bytes) or not 1<=len(raw)<=MAX_RAW:raise ValueError('Document must contain 1 byte to 1 MiB')
    parser,binaries=parser_identity(format);pages=0
    if format=='pdf-native-v1':
        if not raw.startswith(b'%PDF-'):raise ValueError('Declared PDF bytes do not match PDF container')
        with tempfile.TemporaryDirectory(prefix='proof-document-') as folder:
            folder=Path(folder).resolve();os.chmod(folder,0o700);file=folder/'source.pdf';write_immutable(file,raw)
            info,_=_native('info',binaries['pdfinfo'],file,limit=8192);info=info.decode('utf-8','strict')
            match=re.search(r'^Pages:\s+(\d+)\s*$',info,re.M)
            if not match or not 1<=int(match[1])<=MAX_PAGES or not re.search(r'^Encrypted:\s+no(?:\s|$)',info,re.M):raise ValueError('Native PDF requires one to eight unencrypted pages')
            pages=int(match[1]);body,_=_native('text',binaries['pdftotext'],file)
            text=_text(body)
    else:
        text=_text(raw)
        if format=='csv-v1':
            rows=0
            for row in csv.reader(io.StringIO(text,newline=''),strict=True):
                rows+=1
                if rows>256 or len(row)>32 or any(len(cell)>4096 for cell in row):raise ValueError('CSV exceeds bounded row, column or cell limits')
            if rows==0:raise ValueError('CSV requires readable rows')
    return {'text':text,'pages':pages,'parser':parser,'parser_sha256':digest(canonical(parser))}

class DocumentStore:
    """Fixed worker_dir/documents/SHA256(company_id); no request-controlled path."""
    def __init__(self,worker_dir,company_id,*,create=False):
        self.company=company(company_id);base=private_dir(worker_dir)
        try:
            parent=base/'documents'
            if create and not os.path.lexists(parent):private_dir(parent,True)
            private_dir(parent);self.root=parent/digest(self.company)
            if create and not os.path.lexists(self.root):private_dir(self.root,True)
            private_dir(self.root)
            for name in ('assets','extractions','records'):
                path=self.root/name
                if create and not os.path.lexists(path):private_dir(path,True)
                private_dir(path)
            binding=self.root/'binding.json';expected=canonical({'profile':'private-document-store-v1','company_id':self.company}).encode()
            if create:write_immutable(binding,expected)
            if read_private(binding,512)!=expected:raise ValueError('Private document store belongs to another company')
        except FileNotFoundError as exc:raise DocumentDeferred('Matching private worker document store is not provisioned') from exc
    def import_bytes(self,raw,format):
        result=extract(raw,format);text=result['text'];asset=digest(raw);text_hash=digest(text)
        metadata={'profile':'owner-document-asset-v1','company_id':self.company,'asset_sha256':asset,'bytes':len(raw),'format':format,'extraction_sha256':text_hash,'extracted_bytes':len(text.encode()),'characters':len(text),'pages':result['pages'],'parser_sha256':result['parser_sha256'],'parser':result['parser']}
        record_id=self.record_id(asset,format,result['parser_sha256'])
        write_immutable(self.root/'assets'/(asset+'.bin'),raw);write_immutable(self.root/'extractions'/(text_hash+'.txt'),text.encode());write_immutable(self.root/'records'/(record_id+'.json'),canonical(metadata).encode())
        return {'metadata':metadata,'text':text}
    @staticmethod
    def record_id(asset,format,parser_hash):
        sha(asset);sha(parser_hash)
        if format not in FORMATS:raise ValueError('Supported document format required')
        return digest(canonical([asset,format,parser_hash]))
    def open(self,asset,format,parser_hash):
        try:
            metadata=json.loads(read_private(self.root/'records'/(self.record_id(asset,format,parser_hash)+'.json'),16384))
            exact(metadata,('profile','company_id','asset_sha256','bytes','format','extraction_sha256','extracted_bytes','characters','pages','parser_sha256','parser'))
            if metadata['profile']!='owner-document-asset-v1' or metadata['company_id']!=self.company or metadata['asset_sha256']!=asset or metadata['format']!=format or metadata['parser_sha256']!=parser_hash or digest(canonical(metadata['parser']))!=parser_hash:raise ValueError('Document metadata identity changed')
            raw=read_private(self.root/'assets'/(asset+'.bin'),MAX_RAW);text_bytes=read_private(self.root/'extractions'/(sha(metadata['extraction_sha256'])+'.txt'),MAX_TEXT)
        except FileNotFoundError as exc:raise DocumentDeferred('Exact approved private document bytes are unavailable') from exc
        result=extract(raw,format);text=result['text']
        if result['parser_sha256']!=parser_hash or result['parser']!=metadata['parser']:raise ValueError('Document parser identity changed; reimport and review explicitly')
        if digest(raw)!=asset or metadata['bytes']!=len(raw) or text_bytes!=text.encode() or digest(text_bytes)!=metadata['extraction_sha256'] or metadata['extracted_bytes']!=len(text_bytes) or metadata['characters']!=len(text) or metadata['pages']!=result['pages']:raise ValueError('Document raw bytes or exact extraction changed')
        return {'metadata':metadata,'text':text}
