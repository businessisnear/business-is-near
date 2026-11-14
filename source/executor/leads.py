"""Read-only public business contact discovery from exact approved directories.

No search provider, model, credential, message, enrichment or contact-permission
inference is hidden in extraction. A public address is not outreach consent.
"""
import datetime
import hashlib
import ipaddress
from html.parser import HTMLParser
import json
import re
from urllib.parse import unquote,urlsplit
from executor.gmail_delivery import address
from executor.research import target
from executor.localization import validate_locale

PROFILE='public-business-lead-discovery-v1'
NOTICE='Read-only literal public directory candidates. Identity and outreach consent are not established; no message, model request or external action occurred.'
MAX_BYTES=262144
ID=re.compile(r'^[a-z][a-z0-9_]{0,23}$')
EMAIL=re.compile(r"(?<![A-Za-z0-9.!#$%&'*+/=?^_`{|}~-])[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9.-]{1,300}(?![A-Za-z0-9.-])")
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True)
def digest(value):return hashlib.sha256(value.encode() if isinstance(value,str) else value).hexdigest()
def exact(value,fields):
    if not isinstance(value,dict) or set(value)!=set(fields):raise ValueError('Exact public lead fields required')
def bounded(value,limit):
    if not isinstance(value,str) or not value.strip() or len(value)>limit or any(ord(c)<32 or ord(c)==127 for c in value):raise ValueError('Bounded public discovery text required')
    value.encode('utf-8');return value

def validate_policy(policy):
    exact(policy,('profile','terms','contact_domains','max_leads'))
    if policy['profile']!=PROFILE or type(policy['max_leads']) is not int or not 1<=policy['max_leads']<=4:raise ValueError('Bounded public discovery policy required')
    for key,maximum in [('terms',4),('contact_domains',8)]:
        if not isinstance(policy[key],list) or not 1<=len(policy[key])<=maximum or any(type(value) is not str for value in policy[key]) or len(set(policy[key]))!=len(policy[key]):raise ValueError('Distinct public discovery filters required')
    for term in policy['terms']:bounded(term,40)
    for domain in policy['contact_domains']:
        bounded(domain,253)
        if address('candidate@'+domain).split('@',1)[1]!=domain or domain!=domain.lower():raise ValueError('Exact canonical approved contact domains required')
    return policy

def validate_scope(scope):
    from executor.operations import validate_scope as ordinary_scope
    if not isinstance(scope,dict) or 'leads' not in scope:raise ValueError('Explicit public discovery policy required')
    base={key:value for key,value in scope.items() if key!='leads'}
    # Validate the exact legacy base, then deny every unrelated authority path.
    if set(base)-{'profile','operation','brief','context','sources','use_ai','locale'}:raise ValueError('Public discovery requires a separate ordinary owner operation')
    ordinary_scope(base,'research_summary');validate_policy(scope['leads'])
    if base['use_ai'] is not False or any(set(source)!= {'id','url'} for source in base['sources']):raise ValueError('Public discovery is read-only exact URL retrieval without inference')
    for source in base['sources']:_approved_source(source,True)
    if len(json.dumps(scope,ensure_ascii=True).encode())>2700:raise ValueError('Public discovery exceeds scope limit')
    return scope

def _approved_source(source,sandbox):
    exact(source,('id','url'))
    if not isinstance(source['id'],str) or not ID.fullmatch(source['id']):raise ValueError('Approved source ID required')
    checker,path=target(source['url'],sandbox)
    if not (sandbox and checker.local):
        parsed=urlsplit(source['url']);host=parsed.hostname
        if parsed.port is not None:raise ValueError('Use a public directory URL without an explicit port')
        if not host or '.' not in host or host.endswith(('.local','.localhost','.internal')):raise ValueError('Public directory hostname required')
        try:ipaddress.ip_address(host)
        except ValueError:pass
        else:raise ValueError('Public directory hostname required')
    return checker,path

def timestamp(value):
    if not isinstance(value,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)',value):raise ValueError('Explicit observed UTC time required')
    if datetime.datetime.fromisoformat(value.replace('Z','+00:00')).utcoffset()!=datetime.timedelta(0):raise ValueError('Explicit observed UTC time required')
    return value

class LeadFetchError(ValueError):
    """Known retrieval failure; the durable intent still forbids a second fetch."""

def worker_suppression(worker_dir):
    # Fixed private location, never a path supplied in an encrypted request.
    from pathlib import Path
    from executor.delivery import SuppressionList
    path=Path(worker_dir)/'leads-suppression.json'
    if not path.exists() and not path.is_symlink():return None
    value=SuppressionList(path)
    value.allows('boundary-check@example.test')  # validate even with no matches
    return value

class ContactPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.ignore=0;self.in_title=False;self.parts=[];self.title=[];self.mailto=[];self.limited=False
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','template','noscript'):self.ignore+=1
        if self.ignore:return
        if tag=='title':self.in_title=True
        if tag=='a':
            hrefs=[value for key,value in attrs if key=='href']
            if len(hrefs)==1 and isinstance(hrefs[0],str) and hrefs[0].lower().startswith('mailto:'):
                if len(self.mailto)<256:self.mailto.append(hrefs[0])
                else:self.limited=True
    def handle_endtag(self,tag):
        if tag in ('script','style','template','noscript') and self.ignore:self.ignore-=1
        if tag=='title':self.in_title=False
    def handle_data(self,text):
        if not self.ignore:
            self.parts.append(text)
            if self.in_title:self.title.append(text)

def _mailbox(value):
    try:return address(value)
    except (ValueError,UnicodeError):return None

def artifact_for(records,source_id,locale):
    validate_locale(locale)
    items=[{'text':('Uncontacted candidate: ' if locale=='en' else 'Candidato sin contactar: ')+record['email'],'source_ids':record['source_ids']} for record in records]
    if not items:items=[{'text':'No matching unsuppressed contact candidate was found.' if locale=='en' else 'No se encontró ningún candidato de contacto permitido que coincida.','source_ids':[source_id]}]
    return {'title':'Public contact candidates for review' if locale=='en' else 'Candidatos de contacto públicos para revisión','summary':'Literal directory matches only. Public availability does not establish business identity or outreach consent.' if locale=='en' else 'Solo coincidencias literales del directorio. La disponibilidad pública no prueba identidad comercial ni consentimiento para contactar.','items':items}

def discover(sources,policy,*,sandbox=False,fetcher=None,suppression=None,locale='en',clock=None):
    validate_policy(policy);validate_locale(locale)
    if type(sandbox) is not bool or not isinstance(sources,list) or not 1<=len(sources)<=4:raise ValueError('One to four exact approved directory sources required')
    ids=set();approved=[]
    for source in sources:
        exact(source,('id','url'))
        if not isinstance(source['id'],str) or not ID.fullmatch(source['id']) or source['id'] in ids:raise ValueError('Distinct approved source IDs required')
        ids.add(source['id']);checker,path=_approved_source(source,sandbox)
        approved.append((source,checker,path))
    observed_at=(clock or (lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()))()
    timestamp(observed_at)
    observations=[];resolved=[];candidates={};suppressed=set();seen=set();discarded=0;limits=False
    terms=[term.casefold() for term in policy['terms']];domains=set(policy['contact_domains'])
    for source,checker,path in approved:
        try:status,raw=fetcher(source['url']) if fetcher else checker._get(path)
        except (OSError,ValueError,TimeoutError) as exc:raise LeadFetchError('Directory fetch requires owner review; do not refetch this task') from exc
        if type(status) is not int or status!=200 or not isinstance(raw,bytes) or len(raw)>MAX_BYTES:raise LeadFetchError('Approved directory was not successfully retrieved within its bound')
        parser=ContactPage();parser.feed(raw.decode('utf-8','replace'));plain=' '.join(' '.join(parser.parts).split());title=' '.join(' '.join(parser.title).split())[:120];matches=[policy['terms'][i] for i,term in enumerate(terms) if term in plain.casefold()]
        found=[]
        if matches:
            for original in parser.mailto:
                if len(original)>280 or '?' in original or '#' in original:continue
                try:decoded=unquote(original[7:],encoding='utf-8',errors='strict')
                except UnicodeError:continue
                mailbox=_mailbox(decoded)
                if mailbox:found.append((mailbox,'mailto_uri',original))
            for match in EMAIL.finditer(plain):
                mailbox=_mailbox(match[0].rstrip('.'))
                if mailbox:found.append((mailbox,'document_text',match[0]))
                if len(found)>=512:limits=True;break
        selected_text=[]
        for mailbox,kind,quote in found:
            if mailbox.rsplit('@',1)[1] not in domains:discarded+=1;continue
            identity=mailbox.casefold();seen.add(identity)
            if suppression is not None:
                allowed=suppression.allows(mailbox)
                if type(allowed) is not bool:raise ValueError('Typed private suppression decision required')
                if not allowed:suppressed.add(identity);continue
            if identity in suppressed:continue
            if identity not in candidates:
                if len(candidates)>=policy['max_leads']:limits=True;continue
                candidates[identity]={'id':digest(identity)[:24],'email':mailbox,'page_title':title,'source_ids':[],'observations':[],'status':'uncontacted','consent':'not_established','business_identity_verified':False}
            record=candidates[identity]
            if source['id'] not in record['source_ids']:record['source_ids'].append(source['id'])
            observation={'source_id':source['id'],'kind':kind,'quote':quote[:360]}
            if not any(item['source_id']==source['id'] for item in record['observations']):record['observations'].append(observation)
            if mailbox not in selected_text:selected_text.append(mailbox)
        fragment=(('Page title: '+title+'. ' if title else '')+'Literal matching terms: '+', '.join(matches)+'. Observed contact candidates: '+', '.join(selected_text))[:600]
        resolved.append({'id':source['id'],'text':fragment})
        observations.append({'id':source['id'],'kind':'retrieved_document','url':source['url'],'status':status,'body_sha256':digest(raw),'text_sha256':digest(fragment),'observed_at':observed_at,'truncated':len(plain)>600 or parser.limited})
        limits=limits or parser.limited
    # Re-read suppression after all retrievals, before returning any contact.
    if suppression is not None:
        for identity,record in list(candidates.items()):
            if suppression.allows(record['email']) is not True:suppressed.add(identity);del candidates[identity]
    records=list(candidates.values())
    artifact=artifact_for(records,sources[0]['id'],locale)
    receipt={'profile':PROFILE,'policy_sha256':digest(canonical(policy)),'approved_sources_sha256':digest(canonical(sources)),'candidates':records,'counts':{'returned':len(records),'suppressed':len(suppressed),'domain_discarded':discarded},'bounded_or_truncated':limits,'suppression_applied':suppression is not None,'outreach_authorized':False,'messages_sent':0,'model_calls':0}
    if len(canonical(receipt).encode())>3500:raise ValueError('Public contact receipt exceeds encrypted result budget')
    return {'artifact':artifact,'resolved_sources':resolved,'sources':observations,'leads':receipt}

def validate_evidence(payload,policy,sources,*,locale='en'):
    """Offline consistency, not independent refetch or contact authorization."""
    validate_policy(policy);validate_locale(locale)
    receipt=payload.get('leads') if isinstance(payload,dict) else None
    exact(receipt,('profile','policy_sha256','approved_sources_sha256','candidates','counts','bounded_or_truncated','suppression_applied','outreach_authorized','messages_sent','model_calls'))
    if (receipt['profile']!=PROFILE or receipt['policy_sha256']!=digest(canonical(policy)) or receipt['approved_sources_sha256']!=digest(canonical(sources)) or receipt['outreach_authorized'] is not False or type(receipt['messages_sent']) is not int or receipt['messages_sent']!=0 or type(receipt['model_calls']) is not int or receipt['model_calls']!=0 or type(receipt['bounded_or_truncated']) is not bool or type(receipt['suppression_applied']) is not bool):raise ValueError('Public discovery evidence changed its input or authority')
    if not isinstance(sources,list) or not 1<=len(sources)<=4:raise ValueError('Approved directory sources required')
    ids=[]
    for source in sources:
        _approved_source(source,True)
        if source['id'] in ids:raise ValueError('Distinct approved directory sources required')
        ids.append(source['id'])
    records=receipt['candidates'];seen=set()
    if not isinstance(records,list) or len(records)>policy['max_leads']:raise ValueError('Public contact count exceeds approved bound')
    for record in records:
        exact(record,('id','email','page_title','source_ids','observations','status','consent','business_identity_verified'))
        mailbox=address(record['email']);identity=mailbox.casefold()
        if mailbox!=record['email'] or mailbox.rsplit('@',1)[1] not in policy['contact_domains'] or identity in seen or record['id']!=digest(identity)[:24] or record['status']!='uncontacted' or record['consent']!='not_established' or record['business_identity_verified'] is not False:raise ValueError('Public contact identity/domain/consent changed')
        seen.add(identity)
        if not isinstance(record['page_title'],str) or len(record['page_title'])>120:raise ValueError('Invalid public page label')
        if not isinstance(record['source_ids'],list) or not record['source_ids'] or len(record['source_ids'])>4 or len(set(record['source_ids']))!=len(record['source_ids']) or any(source not in ids for source in record['source_ids']):raise ValueError('Unapproved public contact source')
        observations=record['observations']
        if not isinstance(observations,list) or not 1<=len(observations)<=4:raise ValueError('Contact source observation required')
        for observation in observations:
            exact(observation,('source_id','kind','quote'));quote=bounded(observation['quote'],360)
            if observation['source_id'] not in record['source_ids']:raise ValueError('Contact observation belongs to another source')
            if observation['kind']=='mailto_uri':
                if not quote.lower().startswith('mailto:') or '?' in quote or '#' in quote:raise ValueError('Invalid original mailto locator')
                original=unquote(quote[7:],encoding='utf-8',errors='strict')
            elif observation['kind']=='document_text':original=quote.rstrip('.')
            else:raise ValueError('Unrecognized contact observation')
            if address(original).casefold()!=identity:raise ValueError('Observed contact quote differs from its address')
        if set(record['source_ids'])!={observation['source_id'] for observation in observations} or len({canonical(item) for item in observations})!=len(observations):raise ValueError('Each candidate source requires a distinct literal observation')
    counts=receipt['counts'];exact(counts,('returned','suppressed','domain_discarded'))
    if any(type(value) is not int or not 0<=value<=2048 for value in counts.values()) or counts['returned']!=len(records):raise ValueError('Invalid contact discovery counts')
    observations=payload.get('sources')
    if not isinstance(observations,list) or len(observations)!=len(sources):raise ValueError('Public directory retrieval provenance required')
    for observation,approved in zip(observations,sources):
        exact(observation,('id','kind','url','status','body_sha256','text_sha256','observed_at','truncated'))
        if observation['id']!=approved['id'] or observation['url']!=approved['url'] or observation['kind']!='retrieved_document' or type(observation['status']) is not int or observation['status']!=200 or type(observation['truncated']) is not bool:raise ValueError('Retrieved directory differs from approved source')
        for key in ('body_sha256','text_sha256'):
            if not isinstance(observation[key],str) or not re.fullmatch(r'[0-9a-f]{64}',observation[key]):raise ValueError('Invalid directory provenance hash')
        timestamp(observation['observed_at'])
    if payload.get('artifact')!=artifact_for(records,ids[0],locale) or len(canonical(receipt).encode())>3500:raise ValueError('Displayed contacts differ from bounded original discovery evidence')
    return receipt

def validate_payload(payload,scope):
    validate_scope(scope)
    expected={'profile','operation','delivery','artifact','generation','sources','notice','leads','claim_review'}
    if 'locale' in scope:expected.add('locale')
    exact(payload,expected)
    from executor.localization import validate_payload_locale,scope_locale
    from executor.claims import claim_scope,validate_claim_review
    validate_payload_locale(payload,scope)
    generation=payload['generation'];exact(generation,('mode','model','cached'))
    if payload['profile']!=scope['profile'] or payload['operation']!='research_summary' or payload['delivery']!='private_artifact_only' or payload['notice']!=NOTICE or generation['mode']!='source_extract' or generation['model'] is not None or generation['cached'] is not False:raise ValueError('Public discovery evidence cannot claim inference or external authority')
    validate_evidence(payload,scope['leads'],scope['sources'],locale=scope_locale(scope))
    validate_claim_review(payload['claim_review'],payload['artifact'],claim_scope(payload,scope),payload['generation'])
    return payload
