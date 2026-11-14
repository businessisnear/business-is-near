"""Provider-specific typed intent and exact protocol selection, never model tools."""
from urllib.parse import urlsplit
from executor.social_protocol import *
from executor import social_x,social_meta,social_pinterest,social_video

def validate_request(r):
    if r.provider=='x':social_x.validate(r)
    elif r.provider in ('instagram','facebook_pages'):social_meta.validate(r)
    elif r.provider=='pinterest':social_pinterest.validate(r)
    elif r.provider in ('tiktok','youtube'):social_video.validate(r)
    else:raise SocialError('Unsupported immutable social provider')

def validate_intent(v):
    exact(v,('schema','provider','intent_id','account_profile','account_id','destination','content','media'))
    p=v['provider']
    if v['schema']!='near-social-v1' or p not in PROVIDERS or not isinstance(v['intent_id'],str) or re.fullmatch(r'[a-z][a-z0-9_-]{0,47}',v['intent_id']) is None or not isinstance(v['account_profile'],str) or re.fullmatch(r'[a-z][a-z0-9_-]{0,31}',v['account_profile']) is None:raise SocialError('Exact typed social identity required')
    opaque(v['account_id'],p);opaque(v['destination'],p if p=='pinterest' else p)
    if p in ('x','facebook_pages','instagram','pinterest') and (not v['account_id'].isdigit() or p=='pinterest' and not v['destination'].isdigit()):raise SocialError('Numeric exact account/board IDs required')
    if p!='pinterest' and v['destination']!=v['account_id']:raise SocialError('This provider publishes only to the exact approved account')
    c=v['content']
    if p in ('x','facebook_pages'):
        exact(c,('text',));bounded_text(c['text'],280 if p=='x' else 2000)
        if v['media'] is not None:raise SocialError('This implemented route is text-only')
    elif p=='pinterest':
        exact(c,('title','description','alt_text'));bounded_text(c['title'],100,empty=True);bounded_text(c['description'],800,empty=True);bounded_text(c['alt_text'],500,empty=True)
    elif p=='instagram':
        exact(c,('caption','alt_text','image_url'));bounded_text(c['caption'],2200,empty=True);bounded_text(c['alt_text'],500,empty=True)
        u=urlsplit(c['image_url'])
        if u.scheme!='https' or not u.hostname or u.username or u.password or u.port not in (None,443) or u.query or u.fragment or len(c['image_url'])>512 or any(ord(x)<33 or ord(x)>126 for x in c['image_url']):raise SocialError('Exact owner media URL required, never a worker fetch target')
    elif p=='tiktok':
        exact(c,('title','privacy_level','creator_username','disable_duet','disable_stitch','disable_comment'))
        bounded_text(c['title'],2200,empty=True)
        if len(c['title'].encode('utf-16-le'))//2>2200 or c['privacy_level'] not in ('SELF_ONLY','PUBLIC_TO_EVERYONE') or not isinstance(c['creator_username'],str) or re.fullmatch(r'[A-Za-z0-9_.]{1,64}',c['creator_username']) is None or any(c[x] is not True for x in ('disable_duet','disable_stitch','disable_comment')):raise SocialError('Exact creator-selected TikTok privacy and disabled interactions required')
    else:
        exact(c,('title','description','privacy_status','category_id','made_for_kids'));bounded_text(c['title'],100);bounded_text(c['description'],3000,empty=True)
        if c['privacy_status'] not in ('private','public','unlisted') or type(c['made_for_kids']) is not bool or not isinstance(c['category_id'],str) or re.fullmatch(r'[0-9]{1,3}',c['category_id']) is None:raise SocialError('Exact explicit YouTube privacy/category/kids selection required')
    if p not in ('x','facebook_pages'):
        exact(v['media'],('sha256','mime_type','bytes'))
        if not isinstance(v['media']['sha256'],str) or re.fullmatch(r'[0-9a-f]{64}',v['media']['sha256']) is None or type(v['media']['bytes']) is not int or not 1<=v['media']['bytes']<=8*1024*1024:raise SocialError('Exact bounded media commitment required')
        allowed=('image/jpeg',) if p=='instagram' else ('image/jpeg','image/png') if p=='pinterest' else ('video/mp4',)
        if v['media']['mime_type'] not in allowed:raise SocialError('Unsupported provider media format')
        if p=='instagram' and not urlsplit(c['image_url']).path.endswith('/'+v['media']['sha256']+'.jpg'):raise SocialError('Owner image URL must name the committed content hash')
    return dict(v)

def profile_hash(provider,alias,account):return sha(canonical(['social-account-profile-v1',provider,alias,account]))
def commitments(v):
    v=validate_intent(v);return {'account_hash':sha(v['account_id']),'destination_hash':sha(v['destination']),'content_hash':sha(canonical(v['content'])),'media_hash':sha(b'') if v['media'] is None else v['media']['sha256'],'profile_hash':profile_hash(v['provider'],v['account_profile'],v['account_id'])}
def account_request(v):
    p=v['provider']
    if p=='x':return social_x.account(v)
    if p in ('instagram','facebook_pages'):return social_meta.account(v)
    if p=='pinterest':return social_pinterest.account(v)
    return social_video.account(v)
def check_account(v,data):
    p=v['provider']
    if p=='x':ident=social_x.account_id(data)
    elif p in ('instagram','facebook_pages'):ident=social_meta.account_id(p,data)
    elif p=='pinterest':ident=social_pinterest.account_id(data)
    else:ident=social_video.account_id(p,data)
    if ident!=v['account_id']:raise SocialError('Actual authenticated account differs from immutable owner approval')
def known_post_request(v,ident,kind='verify'):
    p=v['provider']
    if p=='x':return social_x.verify(v,ident,kind)
    if p=='facebook_pages':return social_meta.facebook_verify(v,ident,kind)
    if p=='pinterest':return social_pinterest.verify(v,ident,kind)
    if p=='instagram':return social_meta.instagram_verify(v,ident,kind)
    if p=='youtube':return social_video.youtube_verify(v,ident,kind)
    return social_video.tiktok_verify(v,ident,kind)
def verify_result(v,data,ident,stage=''):
    p=v['provider']
    if p=='x':return social_x.verified(v,data,ident)
    if p=='facebook_pages':return social_meta.facebook_verified(v,data,ident)
    if p=='pinterest':return social_pinterest.verified(v,data,ident)
    if p=='instagram':return social_meta.instagram_verified(v,data,ident,stage)
    if p=='youtube':return social_video.youtube_verified(v,data,ident)
    return social_video.tiktok_verified(v,data,ident)
