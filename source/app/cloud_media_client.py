"""Explicit owner-authorized Cloud media with shared on-chain AI caps.

No text-token aliases for Whisper. Reservations are conservative authorizations,
not invoices. Completed provider responses are encrypted before commitment;
unknown inference/completion outcomes never trigger another provider request.
"""
import base64
from contextlib import contextmanager
import datetime
import fcntl
import hashlib
import hmac
import json
import math
import os
from pathlib import Path
import re
import secrets
import stat
import tempfile

FORMAT='near-ai-cloud-media-v1'
CONSENT='EXACT_ASSET_TO_NEAR_AI'
VISION_INPUT=16384
VISION_RATE=(150,550)
# Public catalogue + official gateway audio-meter snapshot, 2026-11-12.
# Only an estimate; the whole owner-approved audio allowance stays reserved.
AUDIO_RATE_PER_SECOND=10
MAX_LEDGER=8*1024*1024


def canonical(value):return json.dumps(value,ensure_ascii=False,allow_nan=False,separators=(',',':'))
def digest(raw):return hashlib.sha256(raw if isinstance(raw,bytes) else raw.encode()).hexdigest()
def paths(base_path):
    p=Path(base_path).with_name(Path(base_path).name+'.cloud-media.json')
    return p,p.with_name(p.name+'.identity'),p.with_name(p.name+'.lock')


def read_private(path,limit=MAX_LEDGER):
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        s=os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_uid!=os.getuid() or s.st_mode&0o077 or s.st_size>limit:
            raise ValueError('Unsafe media ledger')
        with os.fdopen(fd,'rb',closefd=False) as stream:return stream.read(limit+1)
    finally:os.close(fd)


def load_media(base_path):
    from executor.cloud_media_transport import strict
    path,marker,_=paths(base_path)
    if not os.path.lexists(path) and not os.path.lexists(marker):return None
    value=strict(read_private(path));identity=read_private(marker,64).decode('ascii')
    if (not isinstance(value,dict) or set(value)!={'format','identity','calls'} or value['format']!=FORMAT
            or not re.fullmatch('[a-f0-9]{64}',identity) or value['identity']!=identity
            or not isinstance(value['calls'],dict) or len(value['calls'])>100):
        raise ValueError('Missing or invalid media ledger identity')
    for ident,row in value['calls'].items():
        if (not re.fullmatch('[a-f0-9]{64}',ident) or not isinstance(row,dict)
                or row.get('status') not in ('unknown','complete') or row.get('kind') not in ('vision','audio')
                or type(row.get('charge')) is not int or not 1<=row['charge']<=10000000
                or not isinstance(row.get('day'),str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',row['day'])
                or not isinstance(row.get('job_hash'),str) or not re.fullmatch('[a-f0-9]{64}',row['job_hash'])):
            raise ValueError('Invalid media budget entry')
    return value


def budget_entries(base_path):
    value=load_media(base_path)
    return [] if value is None else list(value['calls'].values())


class MediaAuthority:
    def __init__(self,base):
        if base is None or not hasattr(base,'gateway'):raise ValueError('On-chain media authority required')
        self.base,self.gateway=base,base.gateway
    def call(self,method,**args):
        out=self.gateway.call(method,**args)
        if not isinstance(out,dict) or out.get('ok') is not True:raise ValueError('Media chain authority unavailable')
        return out
    def check(self,policy,kind,expected=None):
        version=self.base.check(policy)
        media=self.call('ai_media_policy').get('ai_media_policy')
        if (not isinstance(media,dict) or type(media.get('version')) is not int or media['version']<=0
                or media.get('vision_model')!='Qwen/Qwen3-VL-30B-A3B-Instruct'
                or media.get('audio_model')!='openai/whisper-large-v3'
                or media.get('vision_input_limit')!=VISION_INPUT or media.get('audio_seconds_limit')!=6
                or media.get(kind+'_enabled') is not True):raise ValueError('Media not approved')
        versions=(version,media['version'])
        if expected is not None and versions!=expected:raise ValueError('Media policy changed')
        return versions,media
    def reserve(self,**args):
        self.base.check_job(args['job_id'])
        out=self.call('ai_reserve_media_call',**args)
        if out.get('duplicate'):raise ValueError('Original media reservation requires reconciliation')
        record=self.call('ai_media_call',id=args['id']).get('ai_media_call')
        if not isinstance(record,dict) or record.get('status')!='reserved' or any(record.get(k)!=v for k,v in args.items()):
            raise ValueError('Media reservation not confirmed')
        return out.get('tx')
    def check_cache(self,ident,cache):
        row=self.call('ai_media_call',id=ident).get('ai_media_call')
        if not isinstance(row,dict) or row.get('status')!='completed' or row.get('output_hash')!=digest(cache):
            raise ValueError('Media output commitment unavailable')
    def complete(self,ident,cache):
        out=self.call('ai_complete_media_call',id=ident,output_hash=digest(cache));self.check_cache(ident,cache)
        return out.get('tx')


class CloudMediaClient:
    def __init__(self,base_client,transport=None):
        from app.near_ai_client import NearAIClient
        from executor.cloud_media_transport import isolated_transport
        if not isinstance(base_client,NearAIClient):raise ValueError('The configured Cloud client is required')
        self.base=base_client;self.authority=MediaAuthority(base_client.authority)
        self.transport=transport or isolated_transport
        self.path,self.marker,self.lock_path=paths(self.base.path)
        with self.lock():
            if load_media(self.base.path) is None:
                identity=secrets.token_hex(32);self.save({'format':FORMAT,'identity':identity,'calls':{}})
                fd=os.open(self.marker,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
                with os.fdopen(fd,'w') as stream:stream.write(identity);stream.flush();os.fsync(stream.fileno())
                self.sync()
            load_media(self.base.path)
    @contextmanager
    def lock(self):
        parent=self.path.parent.lstat()
        if not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=os.getuid() or parent.st_mode&0o077:
            raise ValueError('Private media ledger directory required')
        fd=os.open(self.lock_path,os.O_RDWR|os.O_CREAT|getattr(os,'O_NOFOLLOW',0),0o600)
        try:
            s=os.fstat(fd)
            if not stat.S_ISREG(s.st_mode) or s.st_nlink!=1 or s.st_uid!=os.getuid() or s.st_mode&0o077:raise ValueError('Unsafe media lock')
            fcntl.flock(fd,fcntl.LOCK_EX);yield
        finally:os.close(fd)
    def sync(self):
        fd=os.open(self.path.parent,os.O_RDONLY)
        try:os.fsync(fd)
        finally:os.close(fd)
    def save(self,value):
        raw=canonical(value).encode()
        if len(raw)>MAX_LEDGER:raise ValueError('Media ledger full')
        fd,name=tempfile.mkstemp(dir=self.path.parent,prefix='.cloud-media-')
        try:
            with os.fdopen(fd,'wb') as stream:stream.write(raw);stream.flush();os.fsync(stream.fileno())
            if self.path.is_symlink():raise ValueError('Unsafe media ledger')
            os.replace(name,self.path);self.sync()
        finally:
            if os.path.exists(name):os.unlink(name)
    def protected(self,result):
        text=canonical(result);chunks=[]
        for start in range(0,len(text),1200):
            part=text[start:start+1200];cipher=self.base.protect(part)
            if not isinstance(cipher,str) or len(cipher)>8192 or self.base.unprotect(cipher)!=part:
                raise ValueError('Encrypted media cache failed')
            chunks.append(cipher)
        if not 1<=len(chunks)<=64:raise ValueError('Media cache bound')
        return canonical(chunks)
    def unprotected(self,cache):
        from executor.cloud_media_transport import strict
        chunks=strict(cache)
        if not isinstance(chunks,list) or not 1<=len(chunks)<=64 or any(not isinstance(c,str) or len(c)>8192 for c in chunks):
            raise ValueError('Invalid encrypted media cache')
        return strict(''.join(self.base.unprotect(c) for c in chunks))

    def validate_cached(self,cache,row,identity=None):
        result=self.unprotected(cache)
        if (not isinstance(result,dict) or result.get('format')!=FORMAT
                or not isinstance(result.get('identity'),dict)
                or result['identity'].get('kind')!=row['kind']
                or digest(canonical(result['identity']))!=row['intent_sha256']
                or (identity is not None and result['identity']!=identity)
                or result.get('reserved_nanos')!=str(row['charge'])):
            raise ValueError('Cached media identity changed')
        # Revalidate the exact raw provider bytes and all derived telemetry,
        # including responses recovered after a lost completion acknowledgement.
        output=row.get('max_output_tokens')
        if type(output) is not int or not 1<=output<=512:raise ValueError('Cached media allowance missing')
        expected=self.parse_reply({'raw_response_base64':result.get('raw_response_base64')},
                                  result['identity'],row['charge'],output)
        if canonical(expected)!=canonical(result):raise ValueError('Cached media result changed')
        return result

    @staticmethod
    def completed_fields(result):
        estimate=result['estimated_provider_nanos']
        return {'estimated_provider_nanos':estimate,'estimated_cost_nanos':0 if estimate is None else int(estimate),
                'provider_cost_unknown':estimate is None,'usage':result['usage']}

    @staticmethod
    def prepare(library,approval,job_id):
        from executor.media_analysis import _hash,_name
        from executor.audio_analysis import validate_audio
        from executor.cloud_media_transport import validate_cloud_image,VISION_MODEL,AUDIO_MODEL
        from executor.localization import validate_locale
        expected={'operation_id','scope_hash','asset_id','import_id','task','backend','upload_consent'}
        if isinstance(approval,dict) and 'requested_locale' in approval:expected.add('requested_locale')
        if (not isinstance(approval,dict) or set(approval)!=expected or approval['operation_id']!=job_id
                or approval['backend']!='near_ai_cloud' or approval['upload_consent']!=CONSENT
                or approval['task'] not in ('caption_visible_text_v1','transcribe_short_audio_v1')):
            raise ValueError('Exact separate asset-upload consent required')
        _name(job_id);_name(approval['import_id']);_hash(approval['scope_hash']);_hash(approval['asset_id'])
        locale=validate_locale(approval.get('requested_locale','en'))
        raw,meta=library.read_asset(approval['asset_id']);kind='vision' if approval['task']=='caption_visible_text_v1' else 'audio'
        media=validate_cloud_image(raw,meta['mime_type']) if kind=='vision' else validate_audio(raw,meta['mime_type'])
        library.reuse(approval['asset_id'],job_id,scope_hash=approval['scope_hash'],role='image_understanding' if kind=='vision' else 'audio_understanding',import_id=approval['import_id'])
        source=library.inventory()['imports'][approval['import_id']]
        identity={**approval,'requested_locale':locale,'format':FORMAT,'kind':kind,'media':media,
                  'model':VISION_MODEL if kind=='vision' else AUDIO_MODEL,'source_receipt_sha256':digest(canonical(source))}
        return identity,base64.b64encode(raw).decode('ascii')

    @staticmethod
    def parse_reply(response,identity,reserve,max_output):
        from executor.cloud_media_transport import strict,VISION_MODEL
        from app.near_ai_client import _cloud_response,_completion_text
        if not isinstance(response,dict) or set(response)!={'raw_response_base64'}:raise ValueError('Exact Cloud response envelope required')
        raw=base64.b64decode(response['raw_response_base64'],validate=True)
        if len(raw)>16384:raise ValueError('Cloud response bound')
        if identity['kind']=='vision':
            from executor.media_analysis import validate_observation
            provider=_cloud_response(raw,VISION_MODEL);text=_completion_text(provider,VISION_MODEL,cloud=True)
            observation=validate_observation(text,identity['asset_id']);u=provider['usage'];i,o,t=u['prompt_tokens'],u['completion_tokens'],u['total_tokens']
            if any(type(n) is not int or n<0 for n in (i,o,t)) or i>VISION_INPUT or o>max_output or t!=i+o:raise ValueError('Vision usage exceeds reservation')
            details=u.get('completion_tokens_details') or {};reasoning=details.get('reasoning_tokens',0)
            if type(reasoning) is not int or not 0<=reasoning<=o:raise ValueError('Invalid vision reasoning usage')
            usage={'billing_unit':'token','prompt_tokens':i,'completion_tokens':o,'reasoning_tokens':reasoning,'total_tokens':t}
            estimate=i*150+o*550
        else:
            provider=strict(raw)
            if not isinstance(provider,dict) or set(provider)-{'text','duration','language','segments','words','id'} or not isinstance(provider.get('text'),str) or len(provider['text'])>500:
                raise ValueError('Bounded transcription response required')
            text=provider['text']
            if any(ord(c)<32 and c not in '\n\t' for c in text):raise ValueError('Invalid transcription text')
            duration=provider.get('duration');units=None
            if duration is not None:
                if type(duration) not in (int,float) or not math.isfinite(duration) or not 0<duration<=6:raise ValueError('Transcription duration outside approval')
                units=math.ceil(duration)
            for key in ('segments','words'):
                values=provider.get(key,[])
                if not isinstance(values,list) or len(values)>64:raise ValueError('Transcription metadata bound')
                for item in values:
                    if not isinstance(item,dict):raise ValueError('Invalid transcription segment')
                    for field in ('start','end'):
                        if field in item and (type(item[field]) not in (int,float) or not math.isfinite(item[field]) or not 0<=item[field]<=6):raise ValueError('Transcription timestamp bound')
            for key in ('id','language'):
                if key in provider and (not isinstance(provider[key],str) or len(provider[key])>128):raise ValueError('Transcription metadata bound')
            usage={'billing_unit':'second','reported_duration_seconds':duration,'billable_seconds':units,'duration_reported':duration is not None}
            estimate=None if units is None else units*AUDIO_RATE_PER_SECOND
            observation={'source_asset_sha256':identity['asset_id'],'transcript':text,
                         'uncertainty':'Provider transcript is unverified; check the original approved audio.'}
        if estimate is not None and estimate>reserve:raise ValueError('Provider estimate exceeds owner reservation')
        return {'format':FORMAT,'identity':identity,'observation':observation,'usage':usage,
                'execution_backend':'near_ai_cloud_unattested','model':identity['model'],
                'reserved_nanos':str(reserve),'estimated_provider_nanos':None if estimate is None else str(estimate),
                'actual_provider_charge_nanos':None,'provider_billing_verified':False,'verified_attestation':False,
                'rate_snapshot':'2026-11-12; gateway/catalogue estimate, not a provider invoice',
                'raw_response_sha256':digest(raw),'raw_response_base64':response['raw_response_base64']}

    def analyze(self,library,approval,analysis_id,job_id):
        from executor.media_analysis import _name
        _name(analysis_id);_name(job_id)
        identity,data_b64=self.prepare(library,approval,job_id);kind=identity['kind'];intent_hash=digest(canonical(identity))
        base_data=self.base._read();secret=self.base.identity_key or base_data['identity']
        ident=hmac.new(hashlib.sha256(secret.encode()).digest(),('cloud-media\0'+kind+'\0'+analysis_id).encode(),hashlib.sha256).hexdigest()
        with self.lock():
            d=load_media(self.base.path);old=d['calls'].get(ident);p=base_data['policy']
            if old and (old.get('intent_sha256')!=intent_hash or old['job_hash']!=digest(job_id)):return {'ok':False,'reason':'idempotency_conflict'}
            if old and old['status']!='complete':return {'ok':False,'reason':'outcome_unknown'}
            if not p['enabled'] or not p['scope_consent']:return {'ok':False,'reason':'disabled'}
            try:versions,m=self.authority.check(p,kind)
            except Exception:return {'ok':False,'reason':'media_not_approved'}
            if old:
                try:
                    self.authority.check_cache(ident,old['cache']);result=self.validate_cached(old['cache'],old,identity)
                    return {'ok':True,'cached':True,'call_id':ident,**result}
                except Exception:return {'ok':False,'reason':'cached_commitment_unavailable'}
            try:key=self.base.key_provider()
            except Exception:key=None
            if (not isinstance(key,str) or not 16<=len(key)<=4096
                    or any(not 33<=ord(c)<=126 for c in key)):
                return {'ok':False,'reason':'key_unavailable'}
            reserve=VISION_INPUT*150+p['max_output_tokens']*550 if kind=='vision' else int(m['audio_reserve_nanos'])
            today=datetime.datetime.now(datetime.timezone.utc).date().isoformat();calls=list(base_data['calls'].values())+list(d['calls'].values())
            if (not 1<=reserve<=p['per_call_nanos'] or sum(c['charge'] for c in calls)+reserve>p['run_nanos']
                    or sum(c['charge'] for c in calls if c['day']==today)+reserve>p['daily_nanos']
                    or sum(c['day']==today for c in calls)>=p['max_calls_per_day']
                    or sum(c['job_hash']==digest(job_id) for c in calls)>=p['max_calls_per_job']):return {'ok':False,'reason':'budget_or_count_limit'}
            try:self.authority.base.check_job(job_id)
            except Exception:return {'ok':False,'reason':'job_not_authorized'}
            blind=hashlib.sha256(secret.encode()).digest();commit=lambda text:hmac.new(blind,text.encode(),hashlib.sha256).hexdigest()
            entry={'status':'unknown','kind':kind,'intent_sha256':intent_hash,'charge':reserve,'day':today,
                   'job_hash':digest(job_id),'max_output_tokens':p['max_output_tokens'],'provider_cost_unknown':True}
            d['calls'][ident]=entry;self.save(d)
            try:
                args={'id':ident,'job_id':job_id,'kind':kind,'policy_version':versions[0],'media_policy_version':versions[1],
                      'prompt_hash':commit(canonical(identity)),'asset_commitment':commit('asset\0'+identity['asset_id'])}
                from app.near_ai_client import _transaction
                entry['reserve_tx']=_transaction(self.authority.reserve(**args));self.save(d);self.authority.check(p,kind,versions)
                response=self.transport({'kind':kind,'asset_id':identity['asset_id'],'mime_type':identity['media']['mime_type'],
                    'data_base64':data_b64,'max_output_tokens':p['max_output_tokens'],'locale':identity['requested_locale'],'key':key})
                result=self.parse_reply(response,identity,reserve,p['max_output_tokens']);cache=self.protected(result)
                entry['staged_cache']=cache;entry['staged_cache_sha256']=digest(cache);self.save(d)
                entry['complete_tx']=_transaction(self.authority.complete(ident,cache));entry.update(status='complete',cache=cache,**self.completed_fields(result));entry.pop('staged_cache');entry.pop('staged_cache_sha256');self.save(d)
                return {'ok':True,'cached':False,'call_id':ident,**result}
            except Exception:return {'ok':False,'reason':'outcome_unknown'}

    def reconcile_staged(self,ident):
        if not isinstance(ident,str) or not re.fullmatch('[a-f0-9]{64}',ident):raise ValueError('Original media call ID required')
        with self.lock():
            d=load_media(self.base.path);row=d['calls'].get(ident)
            if not row or row['status']!='unknown' or not row.get('staged_cache'):return {'ok':False,'reason':'staged_cache_unavailable'}
            try:
                cache=row['staged_cache']
                if digest(cache)!=row['staged_cache_sha256']:raise ValueError('Staged media bytes changed')
                self.authority.check_cache(ident,cache);result=self.validate_cached(cache,row)
            except Exception:return {'ok':False,'reason':'staged_commitment_unconfirmed'}
            row.update(status='complete',cache=cache,**self.completed_fields(result));row.pop('staged_cache');row.pop('staged_cache_sha256');self.save(d)
            return {'ok':True,'recovered':True,'cached':True,'call_id':ident}
