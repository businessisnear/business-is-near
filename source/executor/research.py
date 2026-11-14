"""Retrieve only owner-supplied URLs through the existing pinned fetch boundary."""
import datetime
import hashlib
from html.parser import HTMLParser
from urllib.parse import urlsplit, urlunsplit
from executor.qa import ScopedQA


class DocumentText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ignored = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'template', 'noscript'):
            self.ignored += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'template', 'noscript') and self.ignored:
            self.ignored -= 1

    def handle_data(self, value):
        if not self.ignored:
            self.parts.append(value)


def target(url, sandbox=False):
    if (not isinstance(url, str) or len(url) > 500 or
            any(ord(c) < 33 or ord(c) > 126 for c in url) or '%' in url or '\\' in url):
        raise ValueError('Invalid explicit research URL')
    parsed = urlsplit(url)
    if parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise ValueError('Research URLs cannot contain query, fragment or credentials')
    directory = parsed.path.rsplit('/', 1)[0] + '/'
    base = urlunsplit((parsed.scheme, parsed.netloc, directory, '', ''))
    checker = ScopedQA(base, sandbox=sandbox)
    path = parsed.path or '/'
    if checker._path(path) != path:
        raise ValueError('Research URL escapes approved path')
    return checker, path


def materialize(scope, sandbox=False, fetcher=None):
    resolved = {**scope, 'sources': []}
    observations = []
    for source in scope['sources']:
        if 'url' not in source:
            resolved['sources'].append(dict(source))
            observations.append({'id': source['id'], 'kind': 'supplied_text',
                                 'sha256': hashlib.sha256(source['text'].encode()).hexdigest()})
            continue
        checker, path = target(source['url'], sandbox)
        status, body = fetcher(source['url']) if fetcher else checker._get(path)
        if status != 200 or not isinstance(body, bytes) or len(body) > 262144:
            raise ValueError('Research source not successfully retrieved')
        parser = DocumentText()
        parser.feed(body.decode('utf-8', 'replace'))
        fragment = ' '.join(' '.join(parser.parts).split())[:350]
        if not fragment:
            raise ValueError('Research source has no readable text')
        resolved['sources'].append({'id': source['id'], 'text': fragment})
        observations.append({'id': source['id'], 'kind': 'retrieved_document', 'url': source['url'],
                             'status': status, 'body_sha256': hashlib.sha256(body).hexdigest(),
                             'text_sha256': hashlib.sha256(fragment.encode()).hexdigest(),
                             'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                             'truncated': len(' '.join(' '.join(parser.parts).split())) > 350})
    return resolved, observations
