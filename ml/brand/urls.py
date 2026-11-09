"""Shared brand URL identity and input validation (no storage dependency)."""
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


class BrandInputError(ValueError):
    """A user URL validation error, distinct from analysis/configuration failures."""


def canonical_url(url):
    try:
        p = urlsplit(url)
        if p.scheme.lower() not in {'http', 'https'} or not p.hostname or p.username is not None or p.password is not None:
            raise ValueError('공식 HTTP(S) URL을 입력하세요.')
        host = p.hostname.lower().encode('idna').decode('ascii')
        if ':' in host:
            host = f'[{host}]'
        port = p.port
        if port and not ((p.scheme.lower() == 'https' and port == 443) or (p.scheme.lower() == 'http' and port == 80)):
            host += f':{port}'
        query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                 if not k.lower().startswith('utm_') and k.lower() not in {'gclid', 'fbclid'}]
        # Preserve path case, meaningful query order and country/locale differences.
        return urlunsplit((p.scheme.lower(), host, p.path or '/', urlencode(query), ''))
    except (ValueError, TypeError, UnicodeError) as exc:
        raise BrandInputError('공개된 HTTP(S) 브랜드 홈페이지 URL을 입력하세요.') from exc
