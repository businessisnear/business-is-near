"""Private immutable rollover for nonauthoritative finalized worker traces.

No pending transaction, signing intent, plaintext report or key belongs here.
The RPC journal and chain remain authoritative for recovery and payments.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile

_HASH=re.compile(r'^[a-f0-9]{64}$')
_LIMIT=1_048_576
_SEGMENTS=8192


def _raw(value):return json.dumps(value,separators=(',',':'),sort_keys=True).encode()
def _hash(raw):return hashlib.sha256(raw).hexdigest()


def _directory(path):
    path.mkdir(mode=0o700,exist_ok=True)
    s=path.lstat()
    if not stat.S_ISDIR(s.st_mode) or s.st_mode&0o077 or s.st_uid!=os.getuid():raise ValueError('Unsafe worker archive directory')


def _read(path):
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_mode&0o077 or s.st_uid!=os.getuid() or s.st_size>_LIMIT:raise ValueError('Unsafe worker archive file')
        with os.fdopen(fd,'rb',closefd=False) as f:raw=f.read(_LIMIT+1)
        if len(raw)>_LIMIT:raise ValueError('Worker archive too large')
        return raw
    finally:os.close(fd)


def _sync(path):
    fd=os.open(path,os.O_RDONLY)
    try:os.fsync(fd)
    finally:os.close(fd)


def _immutable(directory,name,raw):
    _directory(directory)
    fd,temp=tempfile.mkstemp(dir=directory,prefix='.archive-')
    try:
        with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
        try:os.link(temp,directory/name)
        except FileExistsError:
            if _read(directory/name)!=raw:raise ValueError('Immutable worker archive conflict')
        _sync(directory)
    finally:os.unlink(temp)


class TraceArchive:
    def __init__(self,path,identity):self.path=Path(path);self.identity=identity
    @staticmethod
    def _record(record):
        if not isinstance(record,dict) or not isinstance(record.get('hash'),str) or not record['hash'] or not isinstance(record.get('method'),str) or record.get('status') not in (None,'final','failed') or 'pending' in record:raise ValueError('Invalid finalized worker trace')
    def validate(self,data):
        if not isinstance(data.get('transactions'),list) or len(data['transactions'])>1000:raise ValueError('Invalid active worker traces')
        for record in data['transactions']:self._record(record)
        a=data.get('archive',{'count':0,'head':None});end=a.get('count');head=a.get('head')
        if type(end) is not int or end<0 or (head is not None and (not isinstance(head,str) or not _HASH.fullmatch(head))) or (end==0)!=(head is None):raise ValueError('Invalid worker archive head')
        count=0
        if head is not None:_directory(self.path)
        while head is not None:
            count+=1
            if count>_SEGMENTS:raise ValueError('Worker archive segment capacity exhausted')
            raw=_read(self.path/(head+'.json'))
            if _hash(raw)!=head:raise ValueError('Worker archive integrity mismatch')
            payload=json.loads(raw);records=payload.get('records');start=payload.get('from');previous=payload.get('previous')
            if payload.get('version')!=1 or payload.get('identity')!=self.identity or not isinstance(records,list) or not 1<=len(records)<=64 or type(start) is not int or start<1 or payload.get('to')!=end or end-start+1!=len(records) or previous is not None and (not isinstance(previous,str) or not _HASH.fullmatch(previous)) or (start==1)!=(previous is None):raise ValueError('Invalid worker archive chain')
            for record in records:self._record(record)
            end=start-1;head=previous
        if end!=0:raise ValueError('Incomplete worker archive chain')
    def compact(self,data):
        while len(data['transactions'])>=128:
            a=data.get('archive',{'count':0,'head':None});records=data['transactions'][:64]
            for record in records:self._record(record)
            if a['count']>=_SEGMENTS*64:raise ValueError('Worker archive segment capacity exhausted')
            payload={'version':1,'identity':self.identity,'previous':a['head'],'from':a['count']+1,'to':a['count']+len(records),'records':records};raw=_raw(payload)
            if len(raw)>_LIMIT:raise ValueError('Worker archive segment too large')
            head=_hash(raw);_immutable(self.path,head+'.json',raw)
            data['archive']={'count':payload['to'],'head':head};data['transactions']=data['transactions'][len(records):]
