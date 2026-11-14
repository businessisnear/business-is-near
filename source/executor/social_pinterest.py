"""Pinterest v5: one image_base64 Pin on one approved public owned board."""
import base64
from executor.social_protocol import *
HOST='api.pinterest.com'
def account(intent):return json_request('pinterest','account','GET',HOST,'/v5/user_account')
def destination(intent):return json_request('pinterest','destination','GET',HOST,'/v5/boards/'+opaque(intent['destination'],'pinterest'))
def account_id(data):return opaque(data['id'],'pinterest')
def check_destination(intent,data,profile):
    if data.get('id')!=intent['destination'] or data.get('privacy')!='PUBLIC' or data.get('is_ads_only') is True or data.get('owner',{}).get('username')!=profile.get('username'):raise SocialError('Exact approved public owned Pinterest board required')
def publish(intent,raw):
    c=intent['content'];return json_request('pinterest','publish','POST',HOST,'/v5/pins',{'board_id':intent['destination'],'title':c['title'],'description':c['description'],'alt_text':c['alt_text'],'media_source':{'source_type':'image_base64','content_type':intent['media']['mime_type'],'data':base64.b64encode(raw).decode()}})
def verify(intent,ident,kind='verify'):
    opaque(ident,'pinterest');return json_request('pinterest',kind,'GET',HOST,'/v5/pins/'+ident)
def created(data):return opaque(data['id'],'pinterest')
def verified(intent,data,ident):
    c=intent['content'];media=data.get('media',{})
    if data.get('id')!=ident or data.get('board_id')!=intent['destination'] or data.get('title')!=c['title'] or data.get('description','')!=c['description'] or data.get('alt_text','')!=c['alt_text'] or media.get('media_type')!='image' or data.get('parent_pin_id'):raise SocialError('Exact original image Pin destination/content required')
    return {'post_id':ident,'stage_id':'','publication_state':'provider_complete'}
def validate(r):
    if r.kind=='account':ok=r.method=='GET' and r.path=='/v5/user_account' and not r.body
    elif r.kind=='destination':ok=r.method=='GET' and re.fullmatch(r'/v5/boards/[0-9]{1,32}',r.path) is not None and not r.body
    elif r.kind=='publish':
        v=json.loads(r.body);exact(v,('board_id','title','description','alt_text','media_source'));opaque(v['board_id'],'pinterest');exact(v['media_source'],('source_type','content_type','data'))
        bounded_text(v['title'],100,empty=True);bounded_text(v['description'],800,empty=True);bounded_text(v['alt_text'],500,empty=True)
        m=v['media_source'];ok=r.method=='POST' and r.path=='/v5/pins' and m['source_type']=='image_base64' and m['content_type'] in ('image/jpeg','image/png') and isinstance(m['data'],str) and len(m['data'])<=350000
        if ok:
            try:base64.b64decode(m['data'],validate=True)
            except Exception as e:raise SocialError('Invalid image_base64') from e
    else:ok=r.kind in ('verify','reconcile') and r.method=='GET' and re.fullmatch(r'/v5/pins/[0-9]{1,32}',r.path) is not None and not r.body
    if not ok:raise SocialError('Fixed supported Pinterest image route required')
