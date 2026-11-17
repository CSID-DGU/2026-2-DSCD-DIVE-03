"""Trade-off API using saved recommendation results, never client-supplied scores."""

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.schemas.trade_off import TradeOffRequest
from app.services.recommendation_store import get_recommendation
from app.services.trade_off_service import compare_recommendations
from app.services.trade_off_llm import add_llm_explanation

router = APIRouter(prefix="/analyses", tags=["Analyses"])


@router.post("/trade-off")
async def analyze_trade_off(request: TradeOffRequest):
    snapshot = get_recommendation(request.recommendation_id)
    if snapshot is None:
        raise HTTPException(
            status_code=404,
            detail="추천 결과를 찾을 수 없거나 만료되었습니다. 추천을 다시 실행해 주세요.",
        )

    try:
        result = await run_in_threadpool(
            compare_recommendations, snapshot, request.space_ids
        )

        return await run_in_threadpool(
            add_llm_explanation, result
        )

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc