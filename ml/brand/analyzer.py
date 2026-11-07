"""ZIP prototype flow: web research, official images, description, NLI Traits."""

import json
from functools import lru_cache
from pathlib import Path
from urllib.parse import urljoin, urlparse

from ml.brand.images import is_public_host, prepare_image
from ml.brand.sources import collect_page, official_source
from ml.brand.duplicates import ImageDuplicates
from ml.brand.descriptions import build_description
from ml.recommendation.scoring import brand_space_fit_scores


_BAD_IMAGES = (
    "icon", "logo", "favicon", "payment", "cart", "delivery", "arrow",
    "sprite", "badge", "tracking", "pixel", "qr", "coupon",
)


class BrandAnalyzer:
    def __init__(self, openai_client, firecrawl_client, scorer, model="gpt-4o-mini"):
        self.openai = openai_client
        self.firecrawl = firecrawl_client
        self.scorer = scorer
        self.model = model
        self.prompts = json.loads(Path(__file__).with_name("prompts.json").read_text())

    def analyze(self, brand_url):
        parsed = urlparse(brand_url)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname or parsed.username or parsed.password
            or not is_public_host(parsed.hostname)
        ):
            raise ValueError("공개된 HTTP(S) 브랜드 홈페이지 URL을 입력하세요.")
        registered = official_source(brand_url)
        research_tool = {"type": "web_search", "search_context_size": "medium"}
        research_domains = [parsed.hostname.removeprefix("www.")]
        identity = ""
        if registered:
            alternate_host = urlparse(registered["url"]).hostname.removeprefix("www.")
            if alternate_host not in research_domains:
                research_domains.append(alternate_host)
            identity = f"브랜드: {registered['brand_name']}. 확인된 다른 공식몰: {registered['url']}. "
        domain_query = " 또는 ".join(f"site:{host}" for host in research_domains)
        identity += f"검색은 {domain_query} 안에서 이 URL의 브랜드만 조사하세요. "
        research = self.openai.responses.create(
            model=self.model,
            tools=[research_tool],
            tool_choice="required",
            include=["web_search_call.action.sources"],
            instructions=self.prompts["research"],
            input=identity + f"공식 홈페이지 URL: {brand_url}. 이 URL의 브랜드를 식별해 조사하세요. 다른 이름의 인물·작품·브랜드를 혼동하지 말고, 확인되지 않으면 정보가 없다고 하세요.",
            max_output_tokens=2000,
        )
        scraped, home_text, collection, warnings = collect_page(self.firecrawl, brand_url)
        images = []
        duplicates = ImageDuplicates()
        examined_count = 0
        # Bound candidate download attempts as well as accepted image count.
        candidates = [url for url in ((getattr(scraped, "images", None) or [])) if isinstance(url, str)]
        for candidate in list(dict.fromkeys(candidates))[:20]:
            url = urljoin(collection["image_page_url"], candidate)
            if any(word in url.lower() for word in _BAD_IMAGES):
                continue
            if duplicates.known_asset(url):
                continue
            examined_count += 1
            try:
                prepared, data_uri = prepare_image(url)
            except Exception:
                warnings.append(f"이미지 수집 제외: {url}")
                continue
            if not duplicates.add(url, prepared, data_uri):
                continue
            images.append({"url": url, "data_uri": data_uri})
            if len(images) == 5:
                break
        vision_text = ""
        if images:
            response = self.openai.responses.create(
                model=self.model,
                input=[{"role": "user", "content": [
                    {"type": "input_text", "text": self.prompts["vision"] + "\n이미지 출처: " + collection["image_page_url"] + "\n" + (collection["fallback_scope"] or "입력한 공식 홈페이지")},
                    *[{"type": "input_image", "image_url": item["data_uri"], "detail": "low"}
                      for item in images],
                ]}],
                max_output_tokens=1000,
            )
            vision_text = response.output_text
        else:
            warnings.append("분석 가능한 공식 이미지가 없어 텍스트 근거로 분석했습니다.")
        sources = []
        for item in research.output or []:
            if hasattr(item, "model_dump"):
                data = item.model_dump()
            elif isinstance(item, dict):
                data = item
            else:
                continue
            if data.get("type") == "web_search_call":
                for source in (data.get("action") or {}).get("sources") or []:
                    url = source.get("url")
                    if url and url not in sources:
                        sources.append(url)
            for content in data.get("content") or []:
                for annotation in content.get("annotations") or []:
                    url = annotation.get("url")
                    if url and url not in sources:
                        sources.append(url)
        research_text = research.output_text or ""
        def allowed(url):
            try:
                source = urlparse(url)
                host = source.hostname or ""
                return (
                    source.scheme in ("http", "https")
                    and source.username is None and source.password is None
                    and any(host == domain or host.endswith("." + domain)
                            for domain in research_domains)
                )
            except (TypeError, ValueError):
                return False
        rejected_sources = [url for url in sources if not allowed(url)]
        source_validation = {
            "checked_count": len(sources),
            "accepted_count": len(sources) - len(rejected_sources),
            "rejected_sources": rejected_sources,
            "policy": "all_sources_must_match_official_domains",
        }
        research_rejected = not sources or bool(rejected_sources)
        if research_rejected:
            research_text = ""
            sources = []
            warnings.append("공식 도메인 근거가 검증되지 않은 웹 검색 요약은 분석에서 제외했습니다.")
        if not research_text.strip() and not home_text.strip() and not vision_text.strip():
            raise ValueError("브랜드 특성을 분석할 근거를 수집하지 못했습니다.")
        task = {
            "brand_name": parsed.hostname,
            "official_url": brand_url,
            "official_research": research_text[:12000],
            "homepage_text": home_text[:6000],
            "visual_observations": vision_text[:4000],
            "image_collection": collection,
        }
        description, description_validation = build_description(
            self.openai, self.model, self.prompts["final"], task, len(images),
        )
        traits = self.scorer.score(description)
        # Apply existing validation to the seven Trait keys and score ranges.
        brand_space_fit_scores(traits, [traits])
        return {
            "brand_url": brand_url, "description": description, "trait_scores": traits,
            "research_sources": sources, "image_sources": [x["url"] for x in images],
            "warnings": warnings, "model": self.model,
            "image_collection": collection, "visual_observations": vision_text,
            "research_summary": research_text,
            "research_domains": research_domains, "research_rejected": research_rejected,
            "research_source_validation": source_validation,
            "description_validation": description_validation,
            "image_deduplication": {"examined_count": examined_count,
                                    "accepted_count": len(images), "duplicates": duplicates.rejected},
        }


@lru_cache(maxsize=1)
def get_brand_analyzer():
    import os
    from dotenv import load_dotenv
    from firecrawl import Firecrawl
    from openai import OpenAI
    from ml.brand.nli import TraitScorer

    root = Path(__file__).resolve().parents[2]
    load_dotenv(root / ".env", override=False)
    if not os.getenv("OPENAI_API_KEY") or not os.getenv("FIRECRAWL_API_KEY"):
        raise ValueError("OPENAI_API_KEY와 FIRECRAWL_API_KEY를 설정하세요.")
    return BrandAnalyzer(
        OpenAI(timeout=60, max_retries=1),
        Firecrawl(api_key=os.environ["FIRECRAWL_API_KEY"]),
        TraitScorer(device=os.getenv("POPCAST_NLI_DEVICE", "cpu")),
    )
