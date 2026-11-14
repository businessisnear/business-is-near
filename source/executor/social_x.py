"""X API v2: one original text-only Post. No replies, edits, media, or DMs."""
from executor.social_protocol import *
HOST='api.x.com'
def account(intent):return json_request('x','account','GET',HOST,'/2/users/me')
def publish(intent,media=None):return json_request('x','publish','POST',HOST,'/2/tweets',{'text':intent['content']['text']})
def verify(intent,ident,kind='verify'):
    opaque(ident,'x');return json_request('x',kind,'GET',HOST,'/2/tweets/'+ident+'?tweet.fields=author_id,text')
def account_id(data):return opaque(data['data']['id'],'x')
def created(data):return opaque(data['data']['id'],'x')
def verified(intent,data,ident):
    v=data.get('data',{})
    if v.get('id')!=ident or v.get('author_id')!=intent['account_id'] or v.get('text')!=intent['content']['text'] or data.get('errors'):raise SocialError('Exact original X author/content required')
    return {'post_id':ident,'stage_id':'','publication_state':'provider_complete'}
def validate(r):
    if r.kind=='account':ok=r.method=='GET' and r.path=='/2/users/me' and not r.body
    elif r.kind=='publish':
        v=json.loads(r.body);exact(v,('text',));bounded_text(v['text'],280);ok=r.method=='POST' and r.path=='/2/tweets'
    else:ok=r.kind in ('verify','reconcile') and r.method=='GET' and re.fullmatch(r'/2/tweets/[0-9]{1,25}\?tweet.fields=author_id,text',r.path) is not None and not r.body
    if not ok:raise SocialError('Fixed X text-post route required')
