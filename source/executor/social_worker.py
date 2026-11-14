"""Explicit NEAR-authorized social worker; disabled by default, no model routing.

Every write stage has a durable private intent and fresh FINAL reservation before
transport. Unknown writes never repeat. Provider verification is an operator
attestation about a specific pipeline, not a TEE proof or an engagement claim.
"""
from __future__ import annotations
import json
from pathlib import Path
from cryptography.hazmat.primitives import serialization
from executor.delivery import EncryptedJournal,NearOutboxAuthority,private_directory,private_read
from executor.crypto import open_record_key
from executor.social_protocol import *
from executor.social_protocol import _SOCIAL_LIVE_SEAL
from executor.social_providers import validate_intent,commitments,profile_hash,account_request,check_account,known_post_request,verify_result
from executor.social_media import SocialMedia
from executor import social_x,social_meta,social_pinterest,social_video

ROOT=Path(__file__).resolve().parents[1]
FILES=('contract/onchain/social_outbox.ts','executor/social_protocol.py','executor/social_media.py','executor/social_x.py','executor/social_meta.py','executor/social_pinterest.py','executor/social_video.py','executor/social_providers.py','executor/social_worker.py','executor/delivery.py','executor/gmail_delivery.py','executor/delivery_rpc.mjs','executor/crypto.py','executor/journal.mjs','executor/outcome.mjs','executor/media_analysis.py','executor/media.py','app/worker_crypto.py','executor/package-lock.json')

def execution_manifest(vault):
    pem=vault.private.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode('ascii');files=[[f,sha((ROOT/f).read_bytes())] for f in FILES]
    return {'worker_public_key':pem,'worker_key_id':sha(pem),'source_hash':sha(canonical(files)),'worker_hash':sha((ROOT/'executor/social_worker.py').read_bytes()),'source_files':dict(files)}

class SocialCredentials:
    synthetic=False
    def __init__(self,path):self.path=Path(path)
    def credential(self,alias):
        v=json.loads(private_read(self.path));exact(v,('schema','profiles'))
        if v['schema']!=1 or not isinstance(v['profiles'],dict):raise SocialError('Protected social credential registry required')
        p=v['profiles'].get(alias);exact(p,('provider','account_id','access_token','scopes','media_origin'));provider=p['provider']
        if provider not in PROVIDERS or not isinstance(p['scopes'],list) or len(p['scopes'])!=len(SCOPES[provider]) or set(p['scopes'])!=SCOPES[provider]:raise SocialError('Exact provider scope registry required')
        opaque(p['account_id'],provider)
        token=p['access_token']
        if not isinstance(token,str) or not 8<=len(token)<=8192 or any(ord(c)<33 or ord(c)>126 for c in token):raise SocialError('Protected OAuth access token required')
        if provider!='instagram' and p['media_origin'] is not None:raise SocialError('Only Instagram accepts an owner media-origin registry field')
        return dict(p)
    def __repr__(self):return '<SocialCredentials protected>'

class SocialFixtureCredentials:
    synthetic=True
    def __init__(self,provider,account_id,*,origin=None):self.provider=provider;self.account_id=account_id;self.origin=origin
    def credential(self,alias):
        if alias!='owner':raise SocialError('Unapproved synthetic credential alias')
        return {'provider':self.provider,'account_id':self.account_id,'access_token':'synthetic','scopes':sorted(SCOPES[self.provider]),'media_origin':self.origin}

class SocialPublicationPolicy:
    synthetic=False
    def __init__(self,path):self.path=Path(path)
    def allows(self,provider,account):
        v=json.loads(private_read(self.path));exact(v,('schema','blocked_accounts'))
        if v['schema']!=1 or not isinstance(v['blocked_accounts'],list) or len(v['blocked_accounts'])>256:raise SocialError('Valid protected publication policy required')
        for p in v['blocked_accounts']:exact(p,('provider','account_id'))
        return {'provider':provider,'account_id':account} not in v['blocked_accounts']

class SocialFixturePolicy:
    synthetic=True
    def __init__(self,enabled=True):self.enabled=enabled
    def allows(self,*args):return self.enabled

class _Rejected(SocialError):pass
class _LocallyBlocked(SocialError):pass

class SocialWorker:
    def __init__(self,authority,vault,data_dir,credentials,media,policy,transport=None):
        self.authority=authority;self.vault=vault;self.credentials=credentials;self.media=media;self.policy=policy;self.transport=transport or SocialDisabledTransport();self.journal=EncryptedJournal(data_dir,vault);self.manifest=execution_manifest(vault)
        if type(self.transport) not in (SocialRecordingTransport,SocialDisabledTransport,SocialHTTPSTransport):raise SocialDisabled('Only explicit recording, disabled or gated fixed HTTPS social transports are allowed')
    def _snapshot(self,ident):
        s=self.authority.snapshot(ident)
        if not isinstance(s,dict) or s.get('finality')!='final' or not isinstance(s.get('state'),dict) or not isinstance(s.get('intent'),dict):raise SocialError('Actual FINAL NEAR social authority required')
        state,g=s['state'],s['intent']
        if s.get('code_hash')!=state.get('contract_code_hash'):raise SocialError('Social contract code pin mismatch')
        for k in ('source_hash','worker_hash','worker_key_id'):
            if state.get(k)!=self.manifest[k] or g.get(k)!=self.manifest[k]:raise SocialError('Actual local social source/key pin mismatch')
        if g.get('id')!=ident or g.get('schema')!='near-social-v1' or g.get('provider')!=state.get('provider') or g.get('account_hash')!=state.get('account_hash') or g.get('profile_hash')!=state.get('profile_hash'):raise SocialError('Exact immutable social provider/account profile required')
        if type(self.transport) is SocialHTTPSTransport and (type(self.authority) is not NearOutboxAuthority or self.authority.config['network'] not in ('mainnet','testnet') or state.get('live_enabled') is not True or state['provider'] in ('instagram','tiktok')):raise SocialDisabled('Owner live flag, actual production NEAR and provider prerequisites required')
        return s
    def _checked_response(self,j,r,response):
        response.validate()
        if 400<=response.status<500 and response.status not in (408,409,429):
            if r.write or not j['write_reserved']:raise _Rejected('Provider definitively rejected this request')
            raise SocialUnknown('A verification read rejection does not prove that publication failed')
        if response.status not in (200,201):raise SocialUnknown('Provider request did not establish a successful result')
        return response
    def _request(self,j,r,credential):
        r.validate();old=j['requests'].get(r.kind)
        if old:
            if old['hash']!=r.digest:raise SocialError('Durable social request hash conflict')
            if old['state']=='done':return self._checked_response(j,r,SocialResponse(old['status'],old['data'],old['headers']))
            raise SocialUnknown('A previously reserved request cannot be sent again')
        j['requests'][r.kind]={'hash':r.digest,'state':'reserving','write':r.write};self.journal.save(j)
        try:permit=self.authority.reserve_request({'id':j['id'],'intent_hash':j['intent_hash'],'kind':r.kind,'request_id':r.kind,'request_hash':r.digest,'live':not self.transport.network_disabled})
        except Exception:
            j['requests'][r.kind]['state']='unknown';self.journal.save(j);raise
        if permit.get('duplicate') is not False or permit.get('network_authorized') is not True or permit.get('request_hash')!=r.digest:
            j['requests'][r.kind]['state']='unknown';self.journal.save(j);raise SocialUnknown('Duplicate chain reservation never authorizes transport')
        j['requests'][r.kind]['state']='inflight'
        if r.write:j['write_reserved']=True
        self.journal.save(j)
        live=None
        if type(self.transport) is SocialHTTPSTransport:
            if type(self.authority) is not NearOutboxAuthority or not permit.get('_final_near_reservation'):raise SocialDisabled('Fresh actual FINAL NEAR permit required')
            live=SocialLivePermit(_SOCIAL_LIVE_SEAL,r.digest,self.authority.identity,True)
        if r.write and not self.policy.allows(j['intent']['provider'],j['intent']['account_id']):
            j['requests'][r.kind]['state']='not_sent_policy_blocked';self.journal.save(j);raise _LocallyBlocked('Owner publication policy blocked transport')
        try:response=self.transport.request(r,credential['access_token'],live).validate()
        except Exception:
            j['requests'][r.kind]['state']='unknown';self.journal.save(j);raise SocialUnknown('Social provider request outcome unknown')
        j['requests'][r.kind]={'hash':r.digest,'state':'done','status':response.status,'data':response.data,'headers':response.headers or {},'write':r.write};self.journal.save(j)
        return self._checked_response(j,r,response)
    def _receipt(self,j,status,reason,result=None):
        result=result or {};ids=j['identifiers'];p={'status':status,'provider_post_id':result.get('post_id',ids.get('post_id','')),'provider_stage_id':result.get('stage_id',ids.get('stage_id','')),'publication_state':result.get('publication_state','unknown' if status=='unknown' else 'not_published'),'reason':reason,**{k:j['commitments'][k] for k in ('account_hash','destination_hash','content_hash','media_hash')}}
        p['receipt_hash']=sha(canonical(['near-social-receipt-v1',j['intent_hash'],p]));j['receipt']=p;j['receipt_synced']=False;self.journal.save(j);return self._sync(j)
    def _sync(self,j):
        if not j['receipt_synced']:
            self.authority.record_receipt({'id':j['id'],'intent_hash':j['intent_hash'],'receipt':j['receipt']});j['receipt_synced']=True;self.journal.save(j)
        return dict(j['receipt'],provider=j['intent']['provider'],operator_attestation=True,provider_proof=False,engagement_proven=False,synthetic=self.transport.network_disabled,manual_review=j['receipt']['status']=='unknown')
    def run(self,ident):
        if type(self.transport) is SocialDisabledTransport:raise SocialDisabled('Social network is disabled before any chain/provider work')
        with self.journal.lease(ident):return self._run(ident)
    def _run(self,ident):
        snap=self._snapshot(ident);g=snap['intent'];state=snap['state'];j=self.journal.read(ident)
        if j and j['intent_hash']!=g['intent_hash']:raise SocialError('Durable social intent hash conflict')
        if j and j.get('receipt'):
            result=self._sync(j)
            if j['receipt']['status']!='unknown':return result
        elif g.get('status') in ('confirmed','failed'):
            return dict(g['receipt'],provider=g['provider'],operator_attestation=True,provider_proof=False,engagement_proven=False,synthetic=self.transport.network_disabled,manual_review=False)
        if state.get('frozen') or g.get('status')=='cancelled' or int(state['observed_at'])>=int(g['expires_at']):
            if j and j.get('receipt'):return self._sync(j)
            raise SocialError('Social authority frozen, cancelled or expired')
        if sha(g['encrypted_intent'])!=g['intent_hash']:raise SocialError('Exact social ciphertext commitment required')
        key=open_record_key(self.vault,g['sealed_record_key'],g['worker_key_id']);intent=validate_intent(json.loads(self.vault.decrypt(g['encrypted_intent'],key)));cm=commitments(intent)
        if intent['intent_id']!=ident or any(g.get(k)!=v for k,v in cm.items()):raise SocialError('Exact private social intent commitments required')
        credential=self.credentials.credential(intent['account_profile'])
        if credential['provider']!=intent['provider'] or credential['account_id']!=intent['account_id'] or set(credential['scopes'])!=SCOPES[intent['provider']]:raise SocialError('Approved protected provider/account credential binding required')
        if intent['provider']=='instagram':
            from urllib.parse import urlsplit
            u=urlsplit(intent['content']['image_url'])
            if credential['media_origin']!='https://'+u.netloc:raise SocialError('Owner-approved Instagram media origin required')
        binding=sha(canonical([intent['provider'],intent['account_profile'],credential['account_id'],credential['access_token']]))
        raw=b'' if intent['media'] is None else self.media.read(intent['media'],intent['provider'])
        if not j:
            j={'schema':1,'id':ident,'intent_hash':g['intent_hash'],'intent':intent,'commitments':cm,'requests':{},'identifiers':{},'credential_binding':binding,'write_reserved':False,'receipt':None,'receipt_synced':False};self.journal.save(j)
        if j['credential_binding']!=binding:raise SocialError('Credential changed; original-account manual review required')
        lost=any(k in WRITES[intent['provider']] and (k not in j['requests'] or j['requests'][k]['state']!='done') for k in g.get('requests',[]))
        if not j.get('receipt') and (g.get('status')=='unknown' or lost):
            if g.get('receipt'):
                j['receipt']=g['receipt'];j['receipt_synced']=True;j['identifiers']={'post_id':g['receipt']['provider_post_id'],'stage_id':g['receipt']['provider_stage_id']};self.journal.save(j)
            else:self._receipt(j,'unknown','reserved_write_result_unknown')
        if j.get('receipt') and j['receipt']['status']=='unknown':return self._reconcile(j,credential)
        self.authority.claim({'id':ident,'intent_hash':g['intent_hash'],**{k:self.manifest[k] for k in ('source_hash','worker_hash','worker_key_id')},'profile_hash':cm['profile_hash']})
        if not self.policy.allows(intent['provider'],intent['account_id']):return self._receipt(j,'failed','owner_publication_policy_blocked')
        try:
            profile=self._request(j,account_request(intent),credential);check_account(intent,profile.data)
            result=self._publish(j,credential,raw,profile.data)
        except _LocallyBlocked:return self._receipt(j,'failed','owner_publication_policy_blocked')
        except _Rejected:return self._receipt(j,'failed','provider_rejected_request')
        except Exception:
            # A reservation may have failed before any provider write existed.
            try:reserved=self._snapshot(ident)['intent']['write_reserved']
            except Exception:raise SocialUnknown('NEAR admission outcome unknown; provider work stopped')
            return self._receipt(j,'unknown' if reserved else 'failed','provider_outcome_unknown' if reserved else 'account_or_admission_not_verified')
        return self._receipt(j,'confirmed','provider_publication_verified',result)
    def _publish(self,j,credential,raw,profile):
        v=j['intent'];p=v['provider'];ids=j['identifiers']
        if p=='x':
            response=self._request(j,social_x.publish(v),credential);ids['post_id']=social_x.created(response.data)
        elif p=='facebook_pages':
            response=self._request(j,social_meta.facebook_publish(v),credential);ids['post_id']=opaque(response.data['id'],p)
        elif p=='pinterest':
            board=self._request(j,social_pinterest.destination(v),credential);social_pinterest.check_destination(v,board.data,profile)
            response=self._request(j,social_pinterest.publish(v,raw),credential);ids['post_id']=social_pinterest.created(response.data)
        elif p=='instagram':
            response=self._request(j,social_meta.instagram_stage(v),credential);ids['stage_id']=opaque(response.data['id'],p);self.journal.save(j)
            status=self._request(j,social_meta.instagram_processing(ids['stage_id']),credential)
            if status.data.get('id')!=ids['stage_id'] or status.data.get('status_code')!='FINISHED':raise ProviderPending('Exact Instagram container is not ready; no publication attempted')
            response=self._request(j,social_meta.instagram_publish(v,ids['stage_id']),credential);ids['post_id']=opaque(response.data['id'],p)
        elif p=='tiktok':
            caps=self._request(j,social_video.tiktok_capabilities(v),credential);social_video.check_capabilities(v,caps.data)
            response=self._request(j,social_video.tiktok_stage(v),credential);ids['stage_id'],ids['session']=social_video.tiktok_created(response.data);self.journal.save(j)
            self._request(j,social_video.tiktok_upload(v,raw,ids['session']),credential)
        else:
            response=self._request(j,social_video.youtube_stage(v),credential);ids['session']=social_video.youtube_created(response);self.journal.save(j)
            response=self._request(j,social_video.youtube_upload(v,raw,ids['session']),credential);ids['post_id']=social_video.youtube_video_id(response.data)
        self.journal.save(j)
        ident=ids['stage_id'] if p=='tiktok' else ids['post_id'];response=self._request(j,known_post_request(v,ident),credential)
        return verify_result(v,response.data,ident,ids.get('stage_id',''))
    def _reconcile(self,j,credential):
        # No path from this method reaches a publication/staging/upload write.
        v=j['intent'];p=v['provider'];ids=j['identifiers']
        try:
            if p=='youtube' and not ids.get('post_id') and ids.get('session'):
                response=self._request(j,social_video.youtube_upload_status(v,ids['session']),credential)
                if response.status!=201:return self._sync(j)
                ids['post_id']=social_video.youtube_video_id(response.data);self.journal.save(j)
            ident=ids.get('stage_id') if p=='tiktok' else ids.get('post_id')
            if not ident:return self._sync(j) # No guessed timeline/search matching.
            response=self._request(j,known_post_request(v,ident,'reconcile'),credential)
            result=verify_result(v,response.data,ident,ids.get('stage_id',''))
        except Exception:return self._sync(j)
        return self._receipt(j,'confirmed','provider_publication_verified',result)


def production_social_worker(*,provider,authority,vault,data_dir,credentials,media,policy,owner_live_enable=False):
    """Dormant explicit live factory; never invoked successfully in this session."""
    if provider in ('instagram','tiktok'):raise SocialDisabled('Instagram immutable hosting and TikTok creator consent/audit UX are not provisioned')
    if provider not in PROVIDERS or owner_live_enable is not True or type(authority) is not NearOutboxAuthority or authority.config['network'] not in ('mainnet','testnet') or type(credentials) is not SocialCredentials or type(policy) is not SocialPublicationPolicy or type(media) is not SocialMedia:raise SocialDisabled('Explicit owner live configuration and actual FINAL NEAR authority required')
    return SocialWorker(authority,vault,data_dir,credentials,media,policy,SocialHTTPSTransport(_SOCIAL_LIVE_SEAL,authority.identity))
