"""Validate collected documents before using official text and images."""

import json
from pathlib import Path
from urllib.parse import urlparse

from ml.brand.images import is_public_host
from ml.brand.discovery import discover_alternates, has_official_return_link
from ml.brand.errors import collection_failure_message


def official_source(brand_url):
    registry = json.loads(Path(__file__).with_name("official_sources.json").read_text())
    return registry.get(urlparse(brand_url).hostname)


def _metadata(page):
    metadata = getattr(page, "metadata", None) or {}
    return metadata.model_dump() if hasattr(metadata, "model_dump") else metadata


def _domain(url):
    return (urlparse(url).hostname or "").removeprefix("www.")


def _within_domains(url, domains):
    try:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        return (parsed.scheme in ("http", "https")
                and parsed.username is None and parsed.password is None
                and any(host == domain or host.endswith("." + domain) for domain in domains))
    except (TypeError, ValueError):
        return False


def blocked_reason(page):
    metadata = _metadata(page)
    status = metadata.get("status_code", metadata.get("statusCode"))
    if str(status) in {"401", "403", "429"}:
        return f"HTTP {status}"
    try:
        parsed = urlparse(metadata.get("url") or "")
        if parsed.hostname == "veritas-hub.cafe24.com" and parsed.path.startswith("/challenge"):
            return "Cafe24 브라우저 보안 확인"
    except (TypeError, ValueError):
        pass  # The document validator rejects malformed final URLs.
    text = (getattr(page, "markdown", None) or "").lower()
    markers = ("잠시 접속이 제한되었습니다", "checking your browser", "please check your access",
               "verify you are human", "just a moment...")
    if any(marker in text for marker in markers):
        return "접속 제한 또는 브라우저 보안 확인"
    return None


def _validate_document(page, requested_url, domains, *, require_secure=False):
    metadata = _metadata(page)
    final_url = metadata.get("url") or requested_url
    status = metadata.get("status_code", metadata.get("statusCode"))
    if status is not None:
        try:
            if not 200 <= int(status) < 300:
                return None, f"HTTP {status}"
        except (TypeError, ValueError):
            return None, "HTTP 상태를 확인할 수 없습니다."
    reason = blocked_reason(page)
    if reason:
        return None, reason
    if not _within_domains(final_url, domains):
        return None, "최종 문서 URL이 확인된 공식 도메인에 속하지 않습니다."
    if require_secure:
        try:
            parsed = urlparse(final_url)
            if parsed.scheme != 'https' or parsed.port not in (None, 443):
                return None, '대체 공식몰 최종 URL은 기본 HTTPS 주소여야 합니다.'
            if not is_public_host(parsed.hostname):
                return None, '대체 공식몰 최종 호스트가 공개 주소로 확인되지 않습니다.'
        except ValueError:
            return None, '대체 공식몰 최종 URL 형식이 올바르지 않습니다.'
    return final_url, None


def collect_page(firecrawl, brand_url):
    entry = official_source(brand_url)
    primary_domain = _domain(brand_url)
    domains = [primary_domain]
    if entry:
        domains.append(_domain(entry["url"]))
    page = firecrawl.scrape(
        url=brand_url, formats=["markdown", "images"], only_main_content=False,
        timeout=30000,
    )
    final_url, failure = _validate_document(page, brand_url, domains)
    if not failure and entry and not _within_domains(final_url, [primary_domain]):
        final_url, failure = _validate_document(page, brand_url, domains, require_secure=True)
    block = blocked_reason(page)
    info = {"requested_url": brand_url, "blocked": bool(block), "block_reason": block,
            "image_page_url": final_url, "fallback_used": False,
            "fallback_evidence_url": None, "fallback_scope": None,
            "collection_failed": bool(failure), "original_failure_reason": failure,
            "fallback_failure_reason": None, "fallback_attempts": [],
            "discovery_failure_reason": None, "fallback_verification": None}
    warnings = []
    if not failure:
        if _within_domains(final_url, [primary_domain]):
            return page, page.markdown or "", info, warnings
        # A verified alternate supplies official text as well as images.
        info.update(fallback_used=True, fallback_evidence_url=entry["evidence_url"],
                    fallback_scope=entry["scope"])
        return page, page.markdown or "", info, warnings
    warnings.append(f"공식 홈페이지 수집 실패: {failure}")
    if not entry:
        if block:
            candidates, discovery_failure = discover_alternates(firecrawl, brand_url)
            info['discovery_failure_reason'] = discovery_failure
            for target_url in candidates:
                attempt = {'url': target_url, 'failure_reason': None}
                info['fallback_attempts'].append(attempt)
                try:
                    alternate = firecrawl.scrape(
                        url=target_url, formats=['markdown', 'images', 'links'],
                        only_main_content=False, timeout=30000,
                    )
                    final_url, alternate_failure = _validate_document(
                        alternate, target_url, [_domain(target_url)], require_secure=True)
                    if not alternate_failure and not has_official_return_link(alternate, brand_url):
                        alternate_failure = '원본 공식몰로 연결되는 링크를 확인하지 못했습니다.'
                    if not alternate_failure:
                        has_text = bool((getattr(alternate, 'markdown', None) or '').strip())
                        has_image_url = any(
                            isinstance(url, str) and url.strip()
                            for url in (getattr(alternate, 'images', None) or [])
                        )
                        if not has_text and not has_image_url:
                            alternate_failure = '분석 가능한 텍스트·이미지 URL이 없습니다.'
                except Exception as exc:
                    alternate_failure = collection_failure_message(exc, '대체 공식몰')
                if alternate_failure:
                    attempt['failure_reason'] = alternate_failure
                    info['fallback_failure_reason'] = alternate_failure
                    warnings.append(f'대체 공식몰 수집 실패: {alternate_failure}')
                    continue
                info.update(image_page_url=final_url, fallback_used=True,
                            collection_failed=False, fallback_failure_reason=None,
                            fallback_evidence_url=final_url,
                            fallback_scope='동일 공식 도메인의 해외/대체 스토어; 국내 구성과 다를 수 있음',
                            fallback_verification='same_domain_store_with_return_link')
                return alternate, alternate.markdown or '', info, warnings
        warnings.append("확인된 대체 공식몰이 없어 홈페이지 이미지 수집을 중단했습니다.")
        return None, "", info, warnings
    target = urlparse(entry["url"])
    if target.scheme != "https" or not is_public_host(target.hostname):
        info["fallback_failure_reason"] = "대체 공식몰 주소 검증 실패"
        warnings.append("대체 공식몰 주소 검증에 실패했습니다.")
        return None, "", info, warnings
    try:
        alternate = firecrawl.scrape(
            url=entry["url"], formats=["markdown", "images"], only_main_content=False,
            timeout=30000,
        )
        alternate_url, alternate_failure = _validate_document(
            alternate, entry["url"], domains, require_secure=True)
        if alternate_failure:
            info["fallback_failure_reason"] = alternate_failure
            warnings.append(f"대체 공식몰 수집 실패: {alternate_failure}")
            return None, "", info, warnings
    except Exception as exc:
        info["fallback_failure_reason"] = collection_failure_message(exc, '대체 공식몰')
        warnings.append("확인된 대체 공식몰 이미지 수집에도 실패했습니다.")
        return None, "", info, warnings
    info.update(image_page_url=alternate_url, fallback_used=True, collection_failed=False,
                fallback_evidence_url=entry["evidence_url"], fallback_scope=entry["scope"])
    return alternate, alternate.markdown or "", info, warnings
