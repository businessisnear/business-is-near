"""Deterministic, constrained HTTP QA. No browser, model, or third-party calls.

This demonstration supports only the exact bundled fixture origin. No DNS,
proxy, redirects, arbitrary user targets, scripts, forms, or subresources run.
"""
import hashlib
import http.client
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

DEMO_URL = 'http://127.0.0.1:8788/'
MAX_BODY = 256 * 1024
MAX_LINKS = 20

class ScopeError(ValueError):
    pass

class _Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []
        self.images = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])
        if tag == 'img':
            self.images.append(attrs)


def _validate_target(url):
    # Literal allowlist avoids DNS rebinding, alternate IP notations, and ports.
    if url != DEMO_URL:
        raise ScopeError('Only the bundled, authorized demo target is in scope: ' + DEMO_URL)


def _local_path(base, href):
    # Reject redirects and any link outside the fixture origin before connection.
    if any(ord(c) < 32 or ord(c) == 127 for c in href) or '\\' in href:
        return None
    parsed = urlsplit(urljoin(base, href))
    if parsed.scheme != 'http' or parsed.netloc != '127.0.0.1:8788':
        return None
    if parsed.username or parsed.password:
        return None
    path = parsed.path or '/'
    return path + (('?' + parsed.query) if parsed.query else '')


def _get(path):
    conn = http.client.HTTPConnection('127.0.0.1', 8788, timeout=3)
    try:
        conn.request('GET', path, headers={'User-Agent': 'HarborQA-Demo/1.0', 'Accept': 'text/html'})
        response = conn.getresponse()
        body = response.read(MAX_BODY + 1)
        if len(body) > MAX_BODY:
            raise ValueError('Target response exceeded 256 KiB limit')
        return response.status, body
    finally:
        conn.close()


def run_check(url):
    """Inspect the controlled homepage and same-origin links; returns observations."""
    _validate_target(url)
    status, body = _get('/')
    if status != 200:
        raise RuntimeError(f'Target homepage returned HTTP {status}; no report issued')
    page = _Page()
    page.feed(body.decode('utf-8', errors='replace'))
    findings = []
    seen = set()
    checked = []
    skipped = []
    for href in page.links[:MAX_LINKS]:
        path = _local_path(url, href)
        if path is None:
            skipped.append(href)
            continue
        if path in seen:
            continue
        seen.add(path)
        code, _ = _get(path)
        checked.append({'path': path, 'status': code})
        if code >= 400:
            findings.append({'id': 'link:' + path, 'category': 'Broken link', 'severity': 'medium',
                'title': f'Link returns HTTP {code}', 'evidence': f'GET {path} returned HTTP {code}',
                'reproduction': f'Open {url} and follow the link to {path}.', 'path': path, 'status': code})
    for index, image in enumerate(page.images):
        if 'alt' not in image:
            src = image.get('src', '(no src)')
            findings.append({'id': f'image-alt:{index}', 'category': 'Accessibility', 'severity': 'medium',
                'title': 'Image has no alt attribute', 'evidence': f'Image {index + 1} in homepage HTML has src={src!r} and no alt attribute',
                'reproduction': f'Open {url}, inspect image {index + 1}, and observe its missing alt attribute.', 'src': src})
    return {'target': url, 'specialist': 'site-inspector.demo', 'method': 'Deterministic HTTP and HTML inspection; no browser or AI model',
            'checks': {'homepage_status': status, 'homepage_sha256': hashlib.sha256(body).hexdigest(),
                       'links_checked': checked, 'out_of_scope_links_skipped': skipped,
                       'links_truncated': len(page.links) > MAX_LINKS, 'images_inspected': len(page.images)},
            'findings': findings}


def verify_check(url, report):
    """Independently rerun checks and accept only findings reproduced verbatim."""
    current = run_check(url)
    observed = {f['id']: f for f in current['findings']}
    supplied = report.get('findings', []) if isinstance(report, dict) else []
    if not isinstance(supplied,list): supplied=[]; malformed=True
    else: malformed=False
    accepted = [f for f in supplied if isinstance(f, dict) and isinstance(f.get('id'),str) and f.get('id') in observed and f == observed[f['id']]]
    # Every delivered observation and metadata field must match the independent run.
    # Findings may be permuted, but omitted, fabricated, extra or duplicated data is rejected.
    valid = (not malformed and set(report)==set(current) and all(report.get(k)==current[k] for k in ('target','specialist','method','checks'))
             and isinstance(supplied,list) and len(accepted)==len(supplied)==len(observed)
             and len({f['id'] for f in accepted})==len(accepted)) if isinstance(report,dict) else False
    return {'verified': valid, 'findings': accepted, 'reason': 'Reproduced by an independent HTTP recheck' if valid else 'Output differed from independent observations', 'recheck': current['checks']}
