
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.schemas.recommendation import RecommendationRequest
from app.services.data_loader import load_spaces
from app.services.hard_filter import apply_hard_filters
from app.services.availability import filter_spaces_by_period
from app.services.recommendation_service import calculate_soft_scores

# B 담당자가 구현한 Ranking 함수
from ml.recommendation.ranking import rank_candidates
from ml.recommendation.weighting import csr_weights

router = APIRouter(
    prefix="/recommendations",
    tags=["Recommendations"],
)


def run_recommendation(request: RecommendationRequest):

    hard = request.hard_filters
    soft = request.soft_filters

    # 1. 전체 공간 데이터 로딩
    spaces = load_spaces()

    # 2. Hard Filter - 예산 및 지역
    candidates = apply_hard_filters(
        spaces,
        budget_max=hard.max_budget_krw,
        regions=hard.region_ids,
    )

    hard_filter_count = len(candidates)

    # 3. Hard Filter - 운영 기간
    candidates = filter_spaces_by_period(
        spaces=candidates,
        start_date=hard.start_date.isoformat(),
        end_date=hard.end_date.isoformat(),
    )

    # 4. 사용자가 선택한 Soft Filter만 점수 계산
    brand_analysis = {}
    scores_by_space = calculate_soft_scores(
        candidates,
        hard,
        soft.selected,
        brand_analysis_out=brand_analysis,
    )

    # 5. 사용자가 지정한 중요도 순위와 차이로 CSR 가중치 계산
    weights = csr_weights(
        selected=soft.selected,
        importance_gaps=soft.importance_gaps,
    )

    # 6. B 담당자의 Ranking 함수 사용
    ranked = rank_candidates(
        scores_by_space,
        weights,
    )

    # 7. 공간 원본 데이터와 랭킹 결과 연결
    space_by_id = {
        str(row["seq"]): row
        for _, row in candidates.iterrows()
    }

    recommendations = []

    for result in ranked:

        space_id = result["space_id"]
        row = space_by_id[space_id]

        photos = str(row["photos"]).split(" | ")
        image_url = photos[0] if photos and photos[0] else None

        recommendations.append({
            "space_id": space_id,
            "rank": result["rank"],

            "name": str(row["name"]),
            "address": str(row["address"]),

            "latitude": float(row["latitude"]),
            "longitude": float(row["longitude"]),

            "image_url": image_url,
            "price_krw": int(row["price"]),
            "area_pyeong": float(row["area_pyeong"]),
            "region": str(row["region_group"]),

            "availability_status": str(
                row["availability_status"]
            ),

            # B 모델에서 계산한 종합점수 및 평가요소
            "final_score": round(
                result["final_score"], 4
            ),

            # 프론트에서 사용하기 편하도록 0~100점으로 변환
            "factor_scores": {
                factor: round(score * 100, 4)
                for factor, score
                in result["factor_scores"].items()
            },

            "contributions": {
                factor: round(value, 4)
                for factor, value
                in result["contributions"].items()
            },
        })

    # 8. 최종 API 응답
    return {
        "recommendation_id": f"rec_{uuid4().hex[:12]}",
        "total_candidates": len(recommendations),
        "hard_filter_count_before_availability": hard_filter_count,
        "weights": weights,
        "recommendations": recommendations,
        "brand_analysis": brand_analysis or None,
    }


@router.post("")
async def recommend_spaces(request: RecommendationRequest):
    try:
        return await run_in_threadpool(
            run_recommendation,
            request,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
