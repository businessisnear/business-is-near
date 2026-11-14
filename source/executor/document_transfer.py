"""Explicit selected-document transfer. Data only; never keys or code execution.

Restore validates the entire deterministic, uncompressed ZIP before creating a
fresh fixed company store. Live worker validation still checks the current parser.
"""
import argparse
import csv
import io
import json
import os
from pathlib import Path
import re
import stat
import sys
import zipfile
from executor.document_store import (DocumentStore,FORMATS,MAX_RAW,MAX_TEXT,MAX_PAGES,
    canonical,digest,exact,sha,company,private_dir,read_private,write_immutable)
from executor.portability import strict_json,reject_private_material,_SECRET_KEYS

PROFILE='private-document-transfer-v1';MAX_DOCUMENTS=8;MAX_ARCHIVE=10*1024*1024;MAX_METADATA=16384
REF_FIELDS=('asset_sha256','format','parser_sha256')


def _safe(raw):
    reject_private_material(raw)
    if re.search(rb'(?:sk_|ghp_|github_pat_)[A-Za-z0-9_]{28,}',raw):raise ValueError('Provider key material cannot enter document transfer')
    try:text=raw.decode('utf-8','strict')
    except UnicodeError:return
    def credential_label(value):
        name=re.sub(r'[\s-]+','_',value.strip().lstrip('\ufeff').strip().strip('\"\x27').lower())
        return name in _SECRET_KEYS or name.endswith(('_api_key','_access_token','_refresh_token','_client_secret','_password'))
    try:header=next(csv.reader(io.StringIO(text,newline=''),strict=True),[])
    except csv.Error:header=[]
    if any(credential_label(value) for value in header):raise ValueError('Recognized credential CSV columns cannot enter document transfer')
    for line in text.splitlines():
        match=re.match(r'^\s*([A-Za-z][A-Za-z0-9_ -]{0,63})\s*[:=]\s*(\S.*)$',line.lstrip('\ufeff'))
        if match and credential_label(match[1]):raise ValueError('Recognized credential-labelled text cannot enter document transfer')


def _refs(values):
    if not isinstance(values,list) or not 1<=len(values)<=MAX_DOCUMENTS:raise ValueError('Select one to eight exact private documents')
    result=[];seen=set()
    for value in values:
        exact(value,REF_FIELDS);sha(value['asset_sha256']);sha(value['parser_sha256'])
        if value['format'] not in FORMATS:raise ValueError('Supported document format required')
        ident=DocumentStore.record_id(value['asset_sha256'],value['format'],value['parser_sha256'])
        if ident in seen:raise ValueError('Duplicate selected private document')
        seen.add(ident);result.append(dict(value))
    return result


def _parser(value,format):
    fields=('profile','implementation_sha256','python')+(('native_helper_sha256','limits','pdfinfo','pdftotext') if format=='pdf-native-v1' else ())
    exact(value,fields)
    if value['profile']!=format or not isinstance(value['python'],str) or not re.fullmatch(r'[a-z][a-z0-9_]{0,31} \d{1,2}\.\d{1,2}\.\d{1,3}',value['python']):raise ValueError('Typed observed document parser required')
    sha(value['implementation_sha256'])
    if format=='pdf-native-v1':
        sha(value['native_helper_sha256']);limits=exact(value['limits'],('cpu_seconds','wall_seconds','memory_bytes','memory_poll_milliseconds','memory_enforcement','file_bytes','open_files','output_bytes'))
        for key,minimum,maximum in [('cpu_seconds',1,30),('wall_seconds',1,60),('memory_bytes',1,2147483648),('memory_poll_milliseconds',1,1000),('file_bytes',1,10*1024*1024),('open_files',8,256),('output_bytes',1,MAX_TEXT)]:
            if type(limits[key]) is not int or not minimum<=limits[key]<=maximum:raise ValueError('Bounded observed native parser policy required')
        if limits['memory_enforcement']!='parent_rss_kill_macos_hard_address_space_linux':raise ValueError('Unsupported observed memory policy')
        for name in ('pdfinfo','pdftotext'):
            tool=exact(value[name],('sha256','version'));sha(tool['sha256'])
            if not isinstance(tool['version'],str) or not tool['version'].startswith(name+' version ') or len(tool['version'])>160 or any(ord(c)<32 for c in tool['version']):raise ValueError('Typed observed native PDF identity required')
    if len(canonical(value).encode())>4096:raise ValueError('Bounded document parser metadata required')


def _metadata(raw,ref,company_id,body,text_bytes):
    if len(raw)>MAX_METADATA:raise ValueError('Bounded document metadata required')
    _safe(raw);value=strict_json(raw);exact(value,('profile','company_id','asset_sha256','bytes','format','extraction_sha256','extracted_bytes','characters','pages','parser_sha256','parser'))
    if value['profile']!='owner-document-asset-v1' or value['company_id']!=company_id or any(value[key]!=ref[key] for key in REF_FIELDS):raise ValueError('Transferred document belongs to another company or reference')
    for key in ('asset_sha256','extraction_sha256','parser_sha256'):sha(value[key])
    for key,minimum,maximum in [('bytes',1,MAX_RAW),('extracted_bytes',1,MAX_TEXT),('characters',1,MAX_TEXT),('pages',1 if value['format']=='pdf-native-v1' else 0,MAX_PAGES if value['format']=='pdf-native-v1' else 0)]:
        if type(value[key]) is not int or not minimum<=value[key]<=maximum:raise ValueError('Bounded typed document metadata required')
    _parser(value['parser'],value['format'])
    if digest(canonical(value['parser']))!=value['parser_sha256'] or len(body)!=value['bytes'] or digest(body)!=value['asset_sha256'] or len(text_bytes)!=value['extracted_bytes'] or digest(text_bytes)!=value['extraction_sha256']:raise ValueError('Transferred raw bytes, extraction or parser hash changed')
    text=text_bytes.decode('utf-8','strict')
    if len(text)!=value['characters'] or not text.lstrip('\ufeff').strip() or any(ord(c)<32 and c not in '\n\r\t' or ord(c)==127 for c in text):raise ValueError('Exact bounded UTF-8 extraction required')
    if value['format']=='pdf-native-v1':
        if not body.startswith(b'%PDF-'):raise ValueError('Transferred PDF container mismatch')
    elif body!=text_bytes:raise ValueError('Original UTF-8/CSV raw bytes must equal exact extraction bytes')
    for content in (body,text_bytes):_safe(content)
    return value


def _zip(files):
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_STORED,allowZip64=False) as archive:
        for name,raw in sorted(files.items()):
            info=zipfile.ZipInfo(name,(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_STORED;info.create_system=3;info.external_attr=(stat.S_IFREG|0o600)<<16
            archive.writestr(info,raw)
    raw=output.getvalue()
    if len(raw)>MAX_ARCHIVE:raise ValueError('Selected document archive exceeds 10 MiB')
    return raw


def export_documents(worker_dir,company_id,refs):
    company(company_id);selected=_refs(refs);store=DocumentStore(worker_dir,company_id);files={};documents=[]
    binding=read_private(store.root/'binding.json',512)
    if binding!=canonical({'profile':'private-document-store-v1','company_id':company_id}).encode():raise ValueError('Exact company document binding required')
    _safe(binding);files['binding.json']=binding
    for ref in selected:
        # Live export verifies current native/text extraction once. Restore does
        # not execute this method, extract(), parser tools or any supplied code.
        verified=store.open(ref['asset_sha256'],ref['format'],ref['parser_sha256']);record_id=DocumentStore.record_id(ref['asset_sha256'],ref['format'],ref['parser_sha256'])
        metadata=read_private(store.root/'records'/(record_id+'.json'),MAX_METADATA);body=read_private(store.root/'assets'/(ref['asset_sha256']+'.bin'),MAX_RAW);text_bytes=read_private(store.root/'extractions'/(verified['metadata']['extraction_sha256']+'.txt'),MAX_TEXT)
        value=_metadata(metadata,ref,company_id,body,text_bytes)
        if canonical(value)!=canonical(verified['metadata']) or text_bytes.decode('utf-8')!=verified['text']:raise ValueError('Source changed during selected document export')
        files['records/'+record_id+'.json']=metadata;files['assets/'+ref['asset_sha256']+'.bin']=body;files['extractions/'+value['extraction_sha256']+'.txt']=text_bytes
        documents.append({**ref,'extraction_sha256':value['extraction_sha256'],'record_sha256':digest(metadata)})
    manifest={'profile':PROFILE,'company_id':company_id,'documents':documents,'binding_sha256':digest(binding),'source_bytes':sum(map(len,files.values()))}
    raw_manifest=canonical(manifest).encode();_safe(raw_manifest);files['manifest.json']=raw_manifest
    result=_zip(files);_validated_archive(result,company_id);return result


def _validated_archive(raw,company_id):
    company(company_id)
    if not isinstance(raw,bytes) or not 1<=len(raw)<=MAX_ARCHIVE:raise ValueError('Bounded private document ZIP bytes required')
    files={}
    with zipfile.ZipFile(io.BytesIO(raw),'r',allowZip64=False) as archive:
        infos=archive.infolist();names=[info.filename for info in infos]
        if archive.comment or not 5<=len(infos)<=26 or len(set(names))!=len(names) or 'manifest.json' not in names or 'binding.json' not in names:raise ValueError('Exact duplicate-free document archive required')
        for info in infos:
            mode=info.external_attr>>16
            if info.is_dir() or info.compress_type!=zipfile.ZIP_STORED or info.compress_size!=info.file_size or info.flag_bits&1 or info.extra or info.comment or not stat.S_ISREG(mode) or mode&0o077 or info.create_system!=3:raise ValueError('Only private regular uncompressed document members are supported')
            name=info.filename
            limit=16384 if name=='manifest.json' or re.fullmatch(r'records/[0-9a-f]{64}\.json',name) else 512 if name=='binding.json' else MAX_RAW if re.fullmatch(r'assets/[0-9a-f]{64}\.bin',name) else MAX_TEXT if re.fullmatch(r'extractions/[0-9a-f]{64}\.txt',name) else 0
            if not limit or not 1<=info.file_size<=limit:raise ValueError('Unapproved document archive member or size')
            with archive.open(info) as stream:content=stream.read(limit+1)
            if len(content)!=info.file_size or len(content)>limit:raise ValueError('Document member exceeded its declared bound')
            files[name]=content
    manifest=strict_json(files['manifest.json']);exact(manifest,('profile','company_id','documents','binding_sha256','source_bytes'))
    if manifest['profile']!=PROFILE or manifest['company_id']!=company_id:raise ValueError('Document archive belongs to another company')
    descriptors=manifest['documents']
    if not isinstance(descriptors,list):raise ValueError('Typed selected document descriptors required')
    refs=[]
    for item in descriptors:
        exact(item,(*REF_FIELDS,'extraction_sha256','record_sha256'));sha(item['extraction_sha256']);sha(item['record_sha256']);refs.append({key:item[key] for key in REF_FIELDS})
    _refs(refs);expected={'manifest.json','binding.json'}
    binding=canonical({'profile':'private-document-store-v1','company_id':company_id}).encode()
    if files['binding.json']!=binding or manifest['binding_sha256']!=digest(binding):raise ValueError('Exact transferred company binding required')
    for ref,item in zip(refs,descriptors):
        record='records/'+DocumentStore.record_id(ref['asset_sha256'],ref['format'],ref['parser_sha256'])+'.json';asset='assets/'+ref['asset_sha256']+'.bin';extraction='extractions/'+item['extraction_sha256']+'.txt';expected.update((record,asset,extraction))
        if any(name not in files for name in (record,asset,extraction)) or digest(files[record])!=item['record_sha256']:raise ValueError('Document transfer is missing exact selected bytes')
        value=_metadata(files[record],ref,company_id,files[asset],files[extraction])
        if value['extraction_sha256']!=item['extraction_sha256']:raise ValueError('Selected extraction commitment changed')
    if set(files)!=expected or type(manifest['source_bytes']) is not int or manifest['source_bytes']!=sum(len(value) for name,value in files.items() if name!='manifest.json'):raise ValueError('Only exact selected source files may be transferred')
    for value in files.values():_safe(value)
    # STORED deterministic ZIP makes this portable across zlib versions and
    # rejects hidden trailing data, local-header gaps, alternate names/metadata.
    if _zip(files)!=raw:raise ValueError('Noncanonical or hidden document ZIP data')
    return manifest,files


def inspect_documents_archive(raw,company_id):
    manifest,files=_validated_archive(raw,company_id)
    return {'profile':PROFILE,'company_id':company_id,'documents':manifest['documents'],'archive_sha256':digest(raw),'bytes':len(raw),'source_bytes':manifest['source_bytes'],'raw_files':sum(name.startswith('assets/') for name in files),'extraction_files':sum(name.startswith('extractions/') for name in files),'record_files':sum(name.startswith('records/') for name in files),'credentials_included':False,'native_parser_executed':False}


def restore_documents(worker_dir,company_id,raw):
    receipt=inspect_documents_archive(raw,company_id);manifest,files=_validated_archive(raw,company_id)
    base=private_dir(worker_dir);target=base/'documents'/digest(company_id)
    if os.path.lexists(target):raise ValueError('Restore requires a fresh private company document store; existing files are never overwritten')
    store=DocumentStore(base,company_id,create=True)
    for name,content in sorted(files.items()):
        if name in ('manifest.json','binding.json'):continue
        folder,filename=name.split('/');write_immutable(store.root/folder/filename,content)
    return {**receipt,'restored':True,'worker_provisioned':False,'execution_authority_restored':False,'current_parser_validation_required':True}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--worker-dir');parser.add_argument('--company-id',required=True);parser.add_argument('--output');parser.add_argument('--archive');parser.add_argument('action',choices=('export','inspect','restore'));args=parser.parse_args()
    if args.action=='export':
        request=sys.stdin.buffer.read(8193)
        if len(request)>8192:raise ValueError('Bounded selected document refs required')
        request=exact(strict_json(request),('documents',))
        if not args.worker_dir or not args.output or args.archive:raise ValueError('Trusted worker directory and fresh private output required')
        output=Path(args.output).absolute();private_dir(output.parent);raw=export_documents(args.worker_dir,args.company_id,request['documents']);write_immutable(output,raw);receipt={**inspect_documents_archive(raw,args.company_id),'native_parser_executed':any(ref['format']=='pdf-native-v1' for ref in request['documents'])}
    else:
        if not args.archive or args.output or args.action=='restore' and not args.worker_dir:raise ValueError('Explicit private document archive required')
        raw=read_private(Path(args.archive).absolute(),MAX_ARCHIVE);receipt=restore_documents(args.worker_dir,args.company_id,raw) if args.action=='restore' else inspect_documents_archive(raw,args.company_id)
    print(json.dumps(receipt,separators=(',',':')))
if __name__=='__main__':main()
