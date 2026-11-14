"""Graph v26 Page text posts and Instagram single-JPEG container publication.

Instagram live use is blocked pending immutable hosting and consent provisioning.
"""
from urllib.parse import urlsplit,urlencode,parse_qsl
from executor.social_protocol import *
HOST='graph.facebook.com'
def form_request(provider,kind,path,payload):
    body=urlencode({k:('true' if v is True else 'false' if v is False else v) for k,v in payload.items()}).encode()
    return SocialRequest(provider,kind,'POST',HOST,path,body,(('Content-Type','application/x-www-form-urlencoded'),)).validate()
def form_body(r):
    pairs=parse_qsl(r.body.decode(),keep_blank_values=True,strict_parsing=True)
    if len(dict(pairs))!=len(pairs) or dict(r.headers)!={'Content-Type':'application/x-www-form-urlencoded'}:raise SocialError('Exact Graph form body required')
    return dict(pairs)
def account(intent):
    p=intent['provider'];path='/'+GRAPH+('/me?fields=id,name' if p=='facebook_pages' else '/'+opaque(intent['account_id'],p)+'?fields=id,username')
    return json_request(p,'account','GET',HOST,path)
def account_id(provider,data):return opaque(data['id'],provider)
def facebook_publish(intent):return form_request('facebook_pages','publish','/'+GRAPH+'/'+intent['destination']+'/feed',{'message':intent['content']['text'],'published':True})
def facebook_verify(intent,ident,kind='verify'):
    opaque(ident,'facebook_pages');return json_request('facebook_pages',kind,'GET',HOST,'/'+GRAPH+'/'+ident+'?fields=id,from,message,is_published')
def facebook_verified(intent,data,ident):
    if data.get('id')!=ident or data.get('from',{}).get('id')!=intent['account_id'] or data.get('message')!=intent['content']['text'] or data.get('is_published') is not True or 'error' in data:raise SocialError('Exact published Facebook Page/content required')
    return {'post_id':ident,'stage_id':'','publication_state':'provider_complete'}
def instagram_stage(intent):return form_request('instagram','stage','/'+GRAPH+'/'+intent['account_id']+'/media',{'image_url':intent['content']['image_url'],'caption':intent['content']['caption'],'alt_text':intent['content']['alt_text']})
def instagram_processing(ident):
    opaque(ident,'instagram');return json_request('instagram','processing','GET',HOST,'/'+GRAPH+'/'+ident+'?fields=status_code,status')
def instagram_publish(intent,ident):
    opaque(ident,'instagram');return form_request('instagram','publish','/'+GRAPH+'/'+intent['account_id']+'/media_publish',{'creation_id':ident})
def instagram_verify(intent,ident,kind='verify'):
    opaque(ident,'instagram');return json_request('instagram',kind,'GET',HOST,'/'+GRAPH+'/'+ident+'?fields=id,owner,caption,alt_text,media_type')
def instagram_verified(intent,data,ident,container):
    owner=data.get('owner',{});owner=owner.get('id') if isinstance(owner,dict) else owner
    if data.get('id')!=ident or owner!=intent['account_id'] or data.get('caption','')!=intent['content']['caption'] or data.get('alt_text','')!=intent['content']['alt_text'] or data.get('media_type')!='IMAGE' or 'error' in data:raise SocialError('Exact original Instagram owner/caption/image required')
    return {'post_id':ident,'stage_id':container,'publication_state':'provider_complete'}
def validate(r):
    graph='/'+GRAPH
    if r.provider=='facebook_pages':
        if r.kind=='account':ok=r.method=='GET' and r.path==graph+'/me?fields=id,name' and not r.body
        elif r.kind=='publish':
            v=form_body(r);exact(v,('message','published'));bounded_text(v['message'],2000);ok=r.method=='POST' and re.fullmatch(re.escape(graph)+r'/[0-9]{1,32}/feed',r.path) is not None and v['published']=='true'
        else:ok=r.kind in ('verify','reconcile') and r.method=='GET' and re.fullmatch(re.escape(graph)+r'/[0-9_]{1,64}\?fields=id,from,message,is_published',r.path) is not None and not r.body
    else:
        if r.kind=='account':ok=r.method=='GET' and re.fullmatch(re.escape(graph)+r'/[0-9]{1,32}\?fields=id,username',r.path) is not None and not r.body
        elif r.kind=='stage':
            v=form_body(r);exact(v,('image_url','caption','alt_text'));bounded_text(v['caption'],2200,empty=True);bounded_text(v['alt_text'],500,empty=True);p=urlsplit(v['image_url']);ok=r.method=='POST' and re.fullmatch(re.escape(graph)+r'/[0-9]{1,32}/media',r.path) is not None and p.scheme=='https' and not p.username and not p.password and not p.query and not p.fragment
        elif r.kind=='processing':ok=r.method=='GET' and re.fullmatch(re.escape(graph)+r'/[0-9]{1,32}\?fields=status_code,status',r.path) is not None and not r.body
        elif r.kind=='publish':
            v=form_body(r);exact(v,('creation_id',));opaque(v['creation_id'],'instagram');ok=r.method=='POST' and re.fullmatch(re.escape(graph)+r'/[0-9]{1,32}/media_publish',r.path) is not None
        else:ok=r.kind in ('verify','reconcile') and r.method=='GET' and re.fullmatch(re.escape(graph)+r'/[0-9]{1,32}\?fields=id,owner,caption,alt_text,media_type',r.path) is not None and not r.body
    if not ok:raise SocialError('Fixed supported Meta route required')
