
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.schemas.recommendation import RecommendationRequest
from app.services.data_loader import load_spaces
from app.services.hard_filter import apply_hard_filters
from app.services.availability import filter_spaces_by_period


router = APIRouter(
    prefix="/recommendations",
    tags=["Recommendations"],
)


def run_recommendation(request: RecommendationRequest):
    """
    POPCAST 추천 API - Hard Filter 단계

    1. CSV 데이터 로딩
    2. 최대 예산 + 지역 필터
    3. 사용 기간 필터
    4. 추천 후보 반환

    Soft Filter 및 랭킹은 추후 연결.
    """

    # 1. 공간 데이터 로딩
    spaces = load_spaces()

    # 2. 최대 예산 + 지역 필터
    candidates = apply_hard_filters(
        spaces,
        budget_max=request.hard_filters.max_budget_krw,
        regions=request.hard_filters.region_ids,
    )

    hard_filter_count = len(candidates)

    # 3. 사용 기간 필터
    candidates = filter_spaces_by_period(
        spaces=candidates,
        start_date=request.hard_filters.start_date.isoformat(),
        end_date=request.hard_filters.end_date.isoformat(),
    )

    # 4. 응답 공간 정보 생성
    recommendations = []

    for _, row in candidates.iterrows():

        # CSV photos: "URL1 | URL2 | ..."
        photos = str(row["photos"]).split(" | ")

        image_url = photos[0] if photos else None

        recommendations.append({
            "space_id": str(row["seq"]),
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
        })

    # 5. 결과 반환
    return {
        "recommendation_id": f"rec_{uuid4().hex[:12]}",
        "total_candidates": len(recommendations),
        "hard_filter_count_before_availability": hard_filter_count,
        "recommendations": recommendations,
    }


@router.post("")
async def recommend_spaces(request: RecommendationRequest):

    try:
        # Shareit API는 동기 호출이므로
        # 별도 스레드에서 실행
        result = await run_in_threadpool(
            run_recommendation,
            request,
        )

        return result

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
