"""Bounded copy-risk labels, never a semantic fact checker or receipt oracle.

Every artifact remains unverified. Source hashes identify supplied bytes, not
independent evidence that their claims happened. Only a future typed adapter
for exact FINAL receipts may compute verified business metrics.
"""
import hashlib
import json
import re


FORMAT = 'claim-review-v1'
COPY_LABEL = 'Unverified copy. Source IDs show provenance only; independent fact proof is absent.'
RISK_LABEL = 'Unverified copy. Flagged business claims are unsupported; source IDs show provenance only.'
AUDIO_LABEL = 'Uncertain local audio transcript. Spoken claims are not verified business facts or sales.'
IMAGE_LABEL = 'Uncertain local image observations. Visible text is not verified business facts or sales.'
CLOUD_MEDIA_LABEL = 'Unverified provider media observations. Check the original approved asset; provider billing and TEE are unverified.'
LEGACY_LABEL = 'Legacy unreviewed copy. No claim-review receipt; source IDs show provenance only.'
FINDINGS = ('testimonial', 'interview', 'revenue', 'customers', 'outreach', 'completion')
_SHA = re.compile(r'[0-9a-f]{64}\Z')
_ID = re.compile(r'[a-z][a-z0-9_]{0,23}\Z')
_BUSINESS_WORK = r'(?:orders|sales|campaigns|client projects|customer projects|business tasks|milestones|contracts|company goals|customer outreach)'
_PATTERNS = (
    ('testimonial', r'\btestimonials?\b|\b[a-z][a-z]{1,24}\s+(?:said|says|reported|shared)\s*[:,"“]'),
    ('interview', r'\b(?:interviewed|spoke with|talked to)\b|\b(?:customer|client|user)\s+interviews?\s+(?:completed|conducted)\b|\bconducted\s+\d+\s+interviews?\b'),
    ('revenue', r'\b(?:revenue|sales)\b|\b(?:earned|generated|collected|made|booked|received)\s+(?:usd\s*)?\$\s*\d|\b(?:earned|generated|collected|made|booked|received)\b.{0,35}\b(?:dollars|usd|near)\b'),
    ('customers', r'\b(?:\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand)\s+(?:paying\s+)?(?:customers|clients|subscribers|users)\b|\b(?:we|our company|our business)\s+(?:have|has|serve|serves|gained|won|onboarded)\b.{0,30}\b(?:customers|clients|subscribers|users)\b'),
    ('outreach', r'\b(?:sent|delivered)\b.{0,45}\b(?:emails?|messages|outreach|campaigns)\b|\b(?:emails?|messages|outreach|campaigns)\b.{0,35}\b(?:sent|delivered)\b|\b(?:contacted|messaged|emailed|reached)\b.{0,45}\b(?:prospects|leads|customers|clients|people)\b'),
    ('completion', r'\b(?:completed|finished|delivered|fulfilled|closed|launched|published)\b.{0,65}\b' + _BUSINESS_WORK + r'\b|\b(?:daily progress|today[’\x27]?s progress|business progress|company progress)\b.{0,90}\b(?:completed|finished|delivered|success|done|launched|published)\b|\b' + _BUSINESS_WORK + r'\b.{0,45}\b(?:completed|finished|delivered|closed)\b'),
)
_NEGATIVE = re.compile(r"\b(?:no|none|zero|without|not|never|haven[’']t|hasn[’']t|didn[’']t|isn[’']t|aren[’']t)\b|\b0\s+(?:paying\s+)?(?:customers|clients|subscribers|users|revenue|sales)\b", re.I)
_FUTURE = re.compile(r'\b(?:should|could|would|will|proposed|hypothetical|aim to|intend to|plan to|seek|ask for|goal|target)\b', re.I)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)


def _digest(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _text(value, maximum):
    if (not isinstance(value, str) or not value.strip() or len(value) > maximum or
            any((ord(c) < 32 and c not in '\n\r\t') or 0xd800 <= ord(c) <= 0xdfff for c in value)):
        raise ValueError('Invalid bounded claim-review text')
    return value


def _artifact(value):
    if not isinstance(value, dict) or set(value) != {'title', 'summary', 'items'}:
        raise ValueError('Typed claim-review artifact required')
    _text(value['title'], 160); _text(value['summary'], 600)
    if not isinstance(value['items'], list) or not 1 <= len(value['items']) <= 4:
        raise ValueError('Bounded claim-review items required')
    for item in value['items']:
        if not isinstance(item, dict) or set(item) != {'text', 'source_ids'}:
            raise ValueError('Typed claim-review item required')
        _text(item['text'], 300)
        refs = item['source_ids']
        if (not isinstance(refs, list) or not 1 <= len(refs) <= 4 or
                any(not isinstance(ref, str) or not _ID.fullmatch(ref) for ref in refs) or len(set(refs)) != len(refs)):
            raise ValueError('Bounded claim-review source IDs required')
    return value


def _scope_commitment(scope):
    if not isinstance(scope, dict):
        raise ValueError('Typed claim-review scope required')
    value = {'profile': _text(scope.get('profile'), 64), 'operation': _text(scope.get('operation'), 64)}
    sources = scope.get('sources')
    if not isinstance(sources, list) or not 1 <= len(sources) <= 4:
        raise ValueError('Claim-review source commitments required')
    committed = []
    for source in sources:
        if not isinstance(source, dict) or not isinstance(source.get('id'), str) or not _ID.fullmatch(source['id']):
            raise ValueError('Invalid claim-review source identity')
        if 'url' in source:
            item = {'id': source['id'], 'url': _text(source['url'], 2048)}
        elif 'text' in source:
            item = {'id': source['id'], 'sha256': _digest(_text(source['text'], 600))}
        elif isinstance(source.get('sha256'), str) and _SHA.fullmatch(source['sha256']):
            item = {'id': source['id'], 'sha256': source['sha256']}
        else:
            raise ValueError('Exact claim-review source commitment required')
        committed.append(item)
    if len({source['id'] for source in committed}) != len(committed):
        raise ValueError('Duplicate claim-review source identity')
    value['sources'] = sorted(committed, key=lambda source: source['id'])
    if 'media' in scope:
        media = scope['media']
        if (not isinstance(media, dict) or set(media) not in ({'asset_id', 'import_id', 'task'},
                {'asset_id','import_id','task','backend','upload_consent'}) or
                ('backend' in media and (media['backend']!='near_ai_cloud' or media['upload_consent']!='EXACT_ASSET_TO_NEAR_AI')) or
                not isinstance(media['asset_id'], str) or not _SHA.fullmatch(media['asset_id']) or
                not isinstance(media['import_id'], str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,63}', media['import_id']) or
                media['import_id'] in ('constructor', 'prototype', '__proto__') or media['task'] not in ('caption_visible_text_v1','transcribe_short_audio_v1') or
                value['operation'] != 'research_summary' or committed != [
                    {'id': 'audio_source' if media['task']=='transcribe_short_audio_v1' else 'image_source', 'sha256': _digest(('Approved audio SHA-256: ' if media['task']=='transcribe_short_audio_v1' else 'Approved image SHA-256: ') + media['asset_id'])}]):
            raise ValueError('Exact approved image claim-review scope required')
        value['media'] = media
    return value


def claim_scope(payload, scope):
    """Use already validated result provenance, including private inbox policy IDs.

    Research URLs retain their owner-approved URL identity. Existing retrieval
    validators separately bind their observed document hashes and response data.
    This descriptor commits type/source identity, not owner instructions.
    """
    value = {key: payload[key] for key in ('profile', 'operation', 'sources')}
    if 'media' in scope:
        value['media'] = scope['media']
    return value


def _findings(artifact):
    found = set()
    # Each field/short clause is independently inspected. These patterns are
    # intentionally bounded heuristics; unrecognized language stays unverified.
    fields = [artifact['title'], artifact['summary'], *(item['text'] for item in artifact['items'])]
    for field in fields:
        # Normalize only heuristic input, never the exact artifact commitment.
        # Both runtimes inspect identical ASCII words and code-point distances.
        field = re.sub(r'[^\x00-\x7f]', ' ', field.replace('’', "'").replace('“', '"').replace('”', '"'))
        if re.search(r'\b(?:daily progress|business progress|company progress)\b', artifact['title'], re.I):
            field = 'Daily progress: ' + field
        for clause in re.split(r'[.!?;\n]+|\b(?:and|but|however|although)\b', field, flags=re.I):
            for category, pattern in _PATTERNS:
                for match in re.finditer(pattern, clause, flags=re.I):
                    before = clause[max(0, match.start() - 55):match.start()]
                    matched = match.group()
                    after = clause[match.end():match.end() + 24]
                    if _NEGATIVE.search(before + ' ' + matched) or re.match(r'\s*[:=]?\s*(?:is|are|was|were|remains?)?\s*(?:none|zero|\$?0)\b', after, re.I):
                        continue
                    if _FUTURE.search(before) or re.match(r'\s+(?:goal|target|proposal|plan)\b', after, re.I):
                        continue
                    found.add(category)
    return [category for category in FINDINGS if category in found]


def review_artifact(artifact, scope, generation):
    """Return a compact deterministic label; never return a verified claim state."""
    _artifact(artifact)
    committed_scope = _scope_commitment(scope)
    ids = {source['id'] for source in committed_scope['sources']}
    if any(not set(item['source_ids']) <= ids for item in artifact['items']):
        raise ValueError('Unknown claim-review source reference')
    if (not isinstance(generation, dict) or generation.get('mode') not in (
            'source_extract', 'near_ai_unattested', 'near_ai_cloud_unattested', 'local_ollama', 'deterministic_planner', 'verified_no_change') or
            len(canonical(generation).encode()) > 1200):
        raise ValueError('Typed bounded generation commitment required')
    image = 'media' in committed_scope
    cloud = image and committed_scope['media'].get('backend')=='near_ai_cloud'
    if image and generation['mode'] != ('near_ai_cloud_unattested' if cloud else 'local_ollama'):
        raise ValueError('Image claims require the approved local observation pipeline')
    findings = _findings(artifact)
    receipt = {'format': FORMAT, 'artifact_sha256': _digest(canonical(artifact)),
               'scope_sha256': _digest(canonical(committed_scope)), 'generation_sha256': _digest(canonical(generation)),
               'state': 'needs_review' if findings else 'local_observation' if image and not cloud else 'unverified',
               'findings': findings, 'label': CLOUD_MEDIA_LABEL if cloud else AUDIO_LABEL if image and committed_scope['media']['task']=='transcribe_short_audio_v1' else IMAGE_LABEL if image else RISK_LABEL if findings else COPY_LABEL}
    if len(canonical(receipt).encode()) > 600:
        raise ValueError('Claim-review receipt exceeds encrypted payload budget')
    return receipt


def validate_claim_review(receipt, artifact, scope, generation):
    """Reject relabeling, omitted findings, fabricated evidence or changed bytes."""
    expected = review_artifact(artifact, scope, generation)
    if not isinstance(receipt, dict) or canonical(receipt) != canonical(expected):
        raise ValueError('Claim-review receipt differs from exact unverified artifact review')
    return receipt
