"""Bounded alternate-store discovery; never guess a foreign brand domain."""
from urllib.parse import urlparse

from ml.brand.images import is_public_host
from ml.brand.errors import collection_failure_message


def discover_alternates(firecrawl, brand_url):
    domain = (urlparse(brand_url).hostname or '').removeprefix('www.')
    try:
        result = firecrawl.map(brand_url, include_subdomains=True, search='global store',
                               limit=12, timeout=15000)
        links = getattr(result, 'links', None)
        if not isinstance(links, list):
            return [], '대체 공식몰 후보를 확인할 수 없습니다.'
    except Exception as exc:
        return [], collection_failure_message(exc, '대체 공식몰 탐색')
    candidates = []
    for link in links:
        url = link.get('url') if isinstance(link, dict) else getattr(link, 'url', None)
        if not isinstance(url, str):
            continue
        try:
            p = urlparse(url)
            host = p.hostname or ''
            prefix = host[:-len('.' + domain)] if host.endswith('.' + domain) else ''
            if (p.scheme != 'https' or p.username is not None or p.password is not None
                    or p.port not in (None, 443) or prefix not in
                    {'global', 'en', 'english', 'international', 'shop', 'store'}
                    or p.query or p.fragment or not is_public_host(host)):
                continue
        except ValueError:
            continue
        if url not in candidates:
            candidates.append(url)
    # Prefer an actual mapped store homepage, then a mapped brand/about page.
    candidates.sort(key=lambda u: (bool(urlparse(u).path.strip('/')),
                                   'brand' not in urlparse(u).path.lower(), len(u)))
    return candidates[:2], None if candidates else '검증 가능한 동일 도메인 스토어 후보가 없습니다.'


def has_official_return_link(page, original_url):
    original = (urlparse(original_url).hostname or '').removeprefix('www.')
    links = getattr(page, 'links', None) or []
    if not isinstance(links, list):
        return False
    for url in links:
        if not isinstance(url, str):
            continue
        try:
            p = urlparse(url)
            if (p.scheme in {'http', 'https'} and p.username is None and p.password is None
                    and p.port in (None, 80, 443)
                    and (p.hostname or '').removeprefix('www.') == original):
                return True
        except ValueError:
            pass
    return False
