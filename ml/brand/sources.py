"""Validate collected documents before using official text and images."""

import json
from pathlib import Path
from urllib.parse import urlparse

from ml.brand.images import is_public_host


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


def _validate_document(page, requested_url, domains):
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
    return final_url, None


def collect_page(firecrawl, brand_url):
    entry = official_source(brand_url)
    primary_domain = _domain(brand_url)
    domains = [primary_domain]
    if entry:
        domains.append(_domain(entry["url"]))
    page = firecrawl.scrape(
        url=brand_url, formats=["markdown", "images"], only_main_content=False,
    )
    final_url, failure = _validate_document(page, brand_url, domains)
    block = blocked_reason(page)
    info = {"requested_url": brand_url, "blocked": bool(block), "block_reason": block,
            "image_page_url": final_url, "fallback_used": False,
            "fallback_evidence_url": None, "fallback_scope": None,
            "collection_failed": bool(failure), "original_failure_reason": failure,
            "fallback_failure_reason": None}
    warnings = []
    if not failure:
        if _within_domains(final_url, [primary_domain]):
            return page, page.markdown or "", info, warnings
        # A direct redirect to a registered alternate also uses image-only evidence.
        info.update(fallback_used=True, fallback_evidence_url=entry["evidence_url"],
                    fallback_scope=entry["scope"])
        warnings.append(f"대체 공식몰 이미지 사용: {final_url} ({entry['scope']})")
        return page, "", info, warnings
    warnings.append(f"공식 홈페이지 수집 실패: {failure}")
    if not entry:
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
        )
        alternate_url, alternate_failure = _validate_document(alternate, entry["url"], domains)
        if alternate_failure:
            info["fallback_failure_reason"] = alternate_failure
            warnings.append(f"대체 공식몰 수집 실패: {alternate_failure}")
            return None, "", info, warnings
    except Exception:
        info["fallback_failure_reason"] = "대체 공식몰 요청 실패"
        warnings.append("확인된 대체 공식몰 이미지 수집에도 실패했습니다.")
        return None, "", info, warnings
    info.update(image_page_url=alternate_url, fallback_used=True, collection_failed=False,
                fallback_evidence_url=entry["evidence_url"], fallback_scope=entry["scope"])
    warnings.append(f"대체 공식몰 이미지 사용: {alternate_url} ({entry['scope']})")
    return alternate, "", info, warnings
