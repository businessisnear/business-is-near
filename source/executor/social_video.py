"""Single bounded MP4 TikTok Direct Post and YouTube resumable-upload protocols.

No chunk retry or write resubmission exists. YouTube video is never called Shorts.
"""
from executor.social_protocol import *
TT='open.tiktokapis.com';YT='www.googleapis.com'
def account(intent):
    if intent['provider']=='tiktok':return json_request('tiktok','account','GET',TT,'/v2/user/info/?fields=open_id')
    return json_request('youtube','account','GET',YT,'/youtube/v3/channels?part=id&mine=true&maxResults=2')
def account_id(provider,data):
    if provider=='tiktok':
        tiktok_ok(data);return opaque(data['data']['user']['open_id'],provider)
    if not isinstance(data.get('items'),list) or len(data['items'])!=1 or data.get('nextPageToken'):raise SocialError('One exact authenticated YouTube channel required')
    return opaque(data['items'][0]['id'],provider)
def tiktok_ok(data):
    if data.get('error',{}).get('code')!='ok':raise SocialError('TikTok explicit error.code=ok required')
def tiktok_capabilities(intent):return json_request('tiktok','capabilities','POST',TT,'/v2/post/publish/creator_info/query/')
def check_capabilities(intent,data):
    tiktok_ok(data);v=data.get('data',{});c=intent['content'];options=v.get('privacy_level_options')
    if v.get('creator_username')!=c['creator_username'] or not isinstance(options,list) or len(options)>4 or c['privacy_level'] not in options or type(v.get('max_video_post_duration_sec')) is not int or v['max_video_post_duration_sec']<60:raise SocialError('Current approved creator/privacy/capability check failed')
def tiktok_stage(intent):
    c=intent['content'];size=intent['media']['bytes'];return json_request('tiktok','stage','POST',TT,'/v2/post/publish/video/init/',{'post_info':{k:c[k] for k in ('title','privacy_level','disable_duet','disable_stitch','disable_comment')},'source_info':{'source':'FILE_UPLOAD','video_size':size,'chunk_size':size,'total_chunk_count':1}})
def tiktok_created(data):
    tiktok_ok(data);v=data['data'];ident=opaque(v['publish_id'],'tiktok',stage=True);known_url(v['upload_url'],'tiktok');return ident,v['upload_url']
def tiktok_upload(intent,raw,url):
    host,path=known_url(url,'tiktok');size=len(raw);return SocialRequest('tiktok','upload','PUT',host,path,raw,(('Content-Type','video/mp4'),('Content-Range',f'bytes 0-{size-1}/{size}')),False).validate()
def tiktok_verify(intent,publish_id,kind='verify'):
    opaque(publish_id,'tiktok',stage=True);return json_request('tiktok',kind,'POST',TT,'/v2/post/publish/status/fetch/',{'publish_id':publish_id})
def tiktok_verified(intent,data,publish_id):
    tiktok_ok(data);v=data.get('data',{});status=v.get('status')
    if status!='PUBLISH_COMPLETE':raise ProviderPending('TikTok processing, inbox handoff or failure is not verified publication')
    posts=v.get('publicaly_available_post_id',[])
    if not isinstance(posts,list) or len(posts)>1:raise SocialError('One exact Direct Post result required')
    post=''
    if posts:
        raw=posts[0]
        if type(raw) is int and 0<raw<2**63:raw=str(raw)
        post=opaque(raw,'x')
    public=intent['content']['privacy_level']=='PUBLIC_TO_EVERYONE'
    if public and not post:raise ProviderPending('Public TikTok post is not yet available')
    return {'post_id':post,'stage_id':publish_id,'publication_state':'public' if public else 'private'}
def youtube_stage(intent):
    c=intent['content'];return json_request('youtube','stage','POST',YT,'/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus',{'snippet':{'title':c['title'],'description':c['description'],'categoryId':c['category_id']},'status':{'privacyStatus':c['privacy_status'],'selfDeclaredMadeForKids':c['made_for_kids']}},(('X-Upload-Content-Length',str(intent['media']['bytes'])),('X-Upload-Content-Type','video/mp4')))
def youtube_created(response):
    url=(response.headers or {}).get('location');known_url(url,'youtube');return url
def youtube_upload(intent,raw,url):
    host,path=known_url(url,'youtube');return SocialRequest('youtube','upload','PUT',host,path,raw,(('Content-Type','video/mp4'),)).validate()
def youtube_upload_status(intent,url):
    host,path=known_url(url,'youtube');return SocialRequest('youtube','upload_status','PUT',host,path,b'',(('Content-Range','bytes */'+str(intent['media']['bytes'])),)).validate()
def youtube_video_id(data):return opaque(data['id'],'youtube')
def youtube_verify(intent,ident,kind='verify'):
    opaque(ident,'youtube');return json_request('youtube',kind,'GET',YT,'/youtube/v3/videos?part=snippet%2Cstatus%2CprocessingDetails&id='+ident)
def youtube_verified(intent,data,ident):
    items=data.get('items')
    if not isinstance(items,list) or len(items)!=1:raise SocialError('One exact YouTube result required')
    v=items[0];s=v.get('snippet',{});state=v.get('status',{});c=intent['content']
    if v.get('id')!=ident or s.get('channelId')!=intent['account_id'] or s.get('title')!=c['title'] or s.get('description','')!=c['description'] or s.get('categoryId')!=c['category_id'] or state.get('privacyStatus')!=c['privacy_status'] or state.get('selfDeclaredMadeForKids') is not c['made_for_kids']:raise SocialError('Exact YouTube channel/content/privacy required')
    if state.get('uploadStatus')!='processed' or v.get('processingDetails',{}).get('processingStatus')!='succeeded':raise ProviderPending('YouTube upload/processing is not completed publication')
    return {'post_id':ident,'stage_id':'','publication_state':c['privacy_status']}
def validate(r):
    if r.provider=='tiktok':
        if r.kind=='account':ok=r.method=='GET' and r.host==TT and r.path=='/v2/user/info/?fields=open_id' and not r.body
        elif r.kind=='capabilities':ok=r.method=='POST' and r.host==TT and r.path=='/v2/post/publish/creator_info/query/' and not r.body
        elif r.kind=='stage':
            v=json.loads(r.body);exact(v,('post_info','source_info'));exact(v['post_info'],('title','privacy_level','disable_duet','disable_stitch','disable_comment'));exact(v['source_info'],('source','video_size','chunk_size','total_chunk_count'));s=v['source_info'];p=v['post_info'];bounded_text(p['title'],2200,empty=True)
            ok=r.method=='POST' and r.host==TT and r.path=='/v2/post/publish/video/init/' and s['source']=='FILE_UPLOAD' and type(s['video_size']) is int and 1<=s['video_size']<=8*1024*1024 and s['chunk_size']==s['video_size'] and s['total_chunk_count']==1 and p['privacy_level'] in ('PUBLIC_TO_EVERYONE','SELF_ONLY') and all(p[x] is True for x in ('disable_duet','disable_stitch','disable_comment'))
        elif r.kind=='upload':
            known_url('https://'+r.host+r.path,'tiktok');h=dict(r.headers);n=len(r.body);ok=r.method=='PUT' and not r.auth and h=={'Content-Type':'video/mp4','Content-Range':f'bytes 0-{n-1}/{n}'} and 1<=n<=8*1024*1024
        else:
            v=json.loads(r.body);exact(v,('publish_id',));opaque(v['publish_id'],'tiktok',stage=True);ok=r.kind in ('verify','reconcile') and r.method=='POST' and r.host==TT and r.path=='/v2/post/publish/status/fetch/'
    else:
        if r.kind=='account':ok=r.method=='GET' and r.path=='/youtube/v3/channels?part=id&mine=true&maxResults=2' and not r.body
        elif r.kind=='stage':
            v=json.loads(r.body);exact(v,('snippet','status'));exact(v['snippet'],('title','description','categoryId'));exact(v['status'],('privacyStatus','selfDeclaredMadeForKids'));s=v['snippet'];p=v['status'];bounded_text(s['title'],100);bounded_text(s['description'],3000,empty=True)
            ok=r.method=='POST' and r.path=='/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus' and p['privacyStatus'] in ('private','public','unlisted') and type(p['selfDeclaredMadeForKids']) is bool and re.fullmatch(r'[0-9]{1,3}',s['categoryId']) is not None and dict(r.headers).get('X-Upload-Content-Type')=='video/mp4' and re.fullmatch(r'[1-9][0-9]{0,7}',dict(r.headers).get('X-Upload-Content-Length','')) is not None
        elif r.kind in ('upload','upload_status'):
            known_url('https://'+r.host+r.path,'youtube');h=dict(r.headers)
            ok=r.method=='PUT' and (r.kind=='upload' and h=={'Content-Type':'video/mp4'} and 1<=len(r.body)<=8*1024*1024 or r.kind=='upload_status' and not r.body and set(h)=={'Content-Range'} and re.fullmatch(r'bytes \*/[1-9][0-9]{0,7}',h['Content-Range']) is not None)
        else:ok=r.kind in ('verify','reconcile') and r.method=='GET' and re.fullmatch(r'/youtube/v3/videos\?part=snippet%2Cstatus%2CprocessingDetails&id=[A-Za-z0-9_-]{1,128}',r.path) is not None and not r.body
    if not ok:raise SocialError('Fixed supported single-MP4 provider route required')
