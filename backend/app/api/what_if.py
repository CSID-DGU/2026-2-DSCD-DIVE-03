
"""POPCAST What-if API 및 최적화된 LLM 설명."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ValidationError

from app.schemas.what_if import WhatIfRequest
from app.services.what_if_service import analyze_what_if
from app.services.whatif_region_analysis import (
    analyze_popup_history,
)
from app.services.whatif_llm_service import (
    generate_whatif_explanation,
)
from app.services.whatif_scenario_store import (
    save_scenario,
    get_scenario,
    get_cached_summary,
    cache_summary,
)
from app.services.recommendation_store import get_recommendation
from ml.brand.errors import BrandAnalysisError


logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "backend" / ".env")

router = APIRouter(
    prefix="/analyses",
    tags=["What-if"],
)


class SpaceExplanationRequest(BaseModel):
    scenario_id: str
    space_id: str


def llm_enabled():
    return (
        os.getenv(
            "POPCAST_WHATIF_LLM_ENABLED", "true"
        ).lower() == "true"
        and bool(os.getenv("OPENAI_API_KEY"))
    )


def run_what_if_with_llm(request):
    # 1. 기존 What-if 정량 분석
    result = analyze_what_if(request)

    # 2. TOP 5 분석 데이터 저장
    save_scenario(result)

    if not llm_enabled():
        return result

    updated = result["updated_recommendation"]

    # 3. 전체 요약에 필요한 정량 데이터
    baseline = get_recommendation(
        result["baseline_recommendation_id"]
    )

    before_top5 = sorted(
        (baseline or {}).get("recommendations", []),
        key=lambda x: x["rank"],
    )[:5]

    after_top5 = sorted(
        updated.get("recommendations", []),
        key=lambda x: x["rank"],
    )[:5]

    
    # 3. 전체 요약에 필요한 정량 데이터
    baseline = get_recommendation(
        result["baseline_recommendation_id"]
    )

    if baseline is None:
        logger.warning("기존 추천 결과를 조회할 수 없습니다.")
        return result

    updated = result["updated_recommendation"]

    before_list = baseline.get("recommendations", [])
    after_list = updated.get("recommendations", [])

    before_top5 = sorted(
        before_list, key=lambda x: x["rank"]
    )[:5]

    after_top5 = sorted(
        after_list, key=lambda x: x["rank"]
    )[:5]

    # 3-1. 변경 후 실제 출점 조건
    after_hard = {
        **baseline["hard_filters"],
        **(request.modified_hard_filters or {}),
    }

    after_soft = {
        **baseline["soft_filters"],
        **(request.modified_soft_filters or {}),
    }

    # 3-2. 후보 수 증감률
    comparison = result["candidate_comparison"]

    before_count = comparison["before"]
    after_count = comparison["after"]

    change_percent = (
        round(
            (after_count - before_count)
            / before_count * 100,
            1,
        )
        if before_count > 0
        else None
    )

    # 3-3. TOP 5 유지 / 신규 진입 / 이탈 계산
    before_top_ids = {
        str(x["space_id"]) for x in before_top5
    }

    after_top_ids = {
        str(x["space_id"]) for x in after_top5
    }

    top5_changes = {
        "retained": len(
            before_top_ids & after_top_ids
        ),
        "new_entries": len(
            after_top_ids - before_top_ids
        ),
        "exits": len(
            before_top_ids - after_top_ids
        ),
    }

    # 3-4. 변경 후 중요도 1~2순위 평가요소
    factor_labels = {
        "target_ratio": "타깃 고객 규모",
        "brand_space_fit": "브랜드-공간 분위기 일치도",
        "popup_history": "동종 팝업 개최 이력",
        "subway_accessibility": "지하철 접근성",
        "rental_price_fit": "대관료 적합도",
        "area_fit": "공간 면적 적합도",
    }

    selected = after_soft.get("selected", [])
    weights = updated.get("weights", {})

    top_factors = [
        {
            "rank": i + 1,
            "factor": factor,
            "label": factor_labels.get(factor, factor),
            "weight": weights.get(factor),
        }
        for i, factor in enumerate(selected[:2])
    ]

    # 3-5. 지역별 동종 팝업 개최 이력
    region_stats = None

    if (
        after_hard.get("category_id")
        and after_hard.get("region_ids")
        and after_hard.get("start_date")
    ):
        try:
            region_stats = analyze_popup_history(
                category=after_hard["category_id"],
                regions=after_hard["region_ids"],
                reference_date=after_hard["start_date"],
            )
        except Exception:
            logger.exception(
                "What-if 지역별 팝업 통계 분석 실패"
            )

    # 3-6. LLM에 전달할 최종 정량 분석 데이터
    data = {
        "candidate_changes": {
            **comparison,
            "change_percent": change_percent,
        },
        "changed_conditions": result["changed_conditions"],
        "hard_filter_impacts": [
            item
            for item in result["factor_impacts"]
            if item.get("changed")
        ],
        "top_priority_factors": top_factors,
        "top5_changes": top5_changes,
        "before_top5": [
            {
                "name": x["name"],
                "rank": x["rank"],
                "final_score": x["final_score"],
            }
            for x in before_top5
        ],
        "after_top5": [
            {
                "name": x["name"],
                "rank": x["rank"],
                "final_score": x["final_score"],
            }
            for x in after_top5
        ],
        "region_statistics": region_stats,
    }

    # 4. 전체 요약만 GPT-4o 호출
    

    try:
        summary = generate_whatif_explanation(
            data,
            analysis_type="overall",
        )

        if summary:
            result["overall_analysis"]["summary"] = summary
            result["overall_analysis"]["summary_type"] = "llm"
            result["analysis_meta"]["llm_generated"] = True

    except Exception:
        logger.exception("What-if 전체 LLM 설명 생성 실패")

    return result


def explain_selected_space(request):
    sid = str(request.space_id)

    scenario = get_scenario(request.scenario_id)

    if scenario is None:
        raise LookupError(
            "분석 결과가 만료되었습니다. 다시 분석해 주세요."
        )

    item = scenario["spaces"].get(sid)

    if item is None:
        raise LookupError(
            "선택한 공간의 분석 결과가 없습니다."
        )

    # 이미 생성한 설명 재사용
    cached = get_cached_summary(
        request.scenario_id, sid
    )

    if cached is not None:
        return {
            "space_id": sid,
            "summary": cached,
            "summary_type": "llm",
            "cached": True,
        }

    # 기존 정량 요약
    fallback = item["analysis"]["summary"]

    if not llm_enabled():
        return {
            "space_id": sid,
            "summary": fallback,
            "summary_type": "deterministic",
            "cached": False,
        }

    baseline = get_recommendation(
        scenario["baseline_recommendation_id"]
    )

    data = {
        "space": {
            "space_id": sid,
            "name": item["space"]["name"],
            "rank": item["space"]["rank"],
            "final_score":
                item["space"]["final_score"],
        },
        "analysis": item["analysis"],
        "rank_change":
            scenario["rank_changes"].get(sid),
        "changed_conditions":
            scenario["changed_conditions"],
        "factor_impacts":
            scenario["factor_impacts"],
        "before_weights":
            (baseline or {}).get("weights", {}),
        "after_weights":
            scenario["weights"],
    }

        # 선택 공간 LLM 입력 데이터 확인
    logger.info("선택 공간: %s", data["space"]["name"])
    logger.info("변경 후 가중치: %s", data["after_weights"])
    logger.info(
        "평가요소별 분석: %s",
        data["analysis"].get("factors", [])
    )
    
    try:
        summary = generate_whatif_explanation(
            data,
            analysis_type="space",
        )

        if summary:
            cache_summary(
                request.scenario_id,
                sid,
                summary,
            )

            return {
                "space_id": sid,
                "summary": summary,
                "summary_type": "llm",
                "cached": False,
            }

    except Exception:
        logger.exception(
            "What-if 선택 공간 LLM 설명 생성 실패"
        )

    return {
        "space_id": sid,
        "summary": fallback,
        "summary_type": "deterministic",
        "cached": False,
    }


@router.post("/what-if")
async def create_what_if(request: WhatIfRequest):
    try:
        return await run_in_threadpool(
            run_what_if_with_llm, request
        )

    except LookupError as exc:
        raise HTTPException(
            status_code=404, detail=str(exc)
        ) from exc

    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=exc.errors(include_context=False),
        ) from exc

    except BrandAnalysisError as exc:
        raise HTTPException(
            status_code=503,
            detail=exc.as_detail(),
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail=str(exc)
        ) from exc


@router.post("/what-if/explain-space")
async def explain_space(request: SpaceExplanationRequest):
    try:
        return await run_in_threadpool(
            explain_selected_space, request
        )

    except LookupError as exc:
        raise HTTPException(
            status_code=404, detail=str(exc)
        ) from exc
