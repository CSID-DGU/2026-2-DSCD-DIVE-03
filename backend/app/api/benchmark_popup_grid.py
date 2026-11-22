"""지도 격자 내 과거 팝업 상세 목록 (읽기 전용)."""
from datetime import date
from fastapi import APIRouter, HTTPException, Query
from app.services.benchmark_popup_grid_service import popup_grid_history

router = APIRouter(prefix='/api/benchmark', tags=['benchmark'])


@router.get('/popup-grid-history')
def get_popup_grid_history(
    region: str, district: str, latitude: float, longitude: float,
    page: int = Query(1, ge=1), page_size: int = Query(10, ge=1, le=30),
    start_date: date | None = None, end_date: date | None = None,
    as_of: date | None = None,
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(status_code=422, detail='조회 시작일은 종료일보다 늦을 수 없습니다.')
    try:
        return popup_grid_history(region, district, latitude, longitude, page, page_size,
                                  start_date, end_date, as_of)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
