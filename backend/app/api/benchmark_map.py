"""벤치마크 지도 좌표 조회 라우터: 기존 통계 API를 수정하지 않습니다."""
from datetime import date
from fastapi import APIRouter, HTTPException
from app.services.benchmark_map_service import build_map_points

router = APIRouter(prefix='/api/benchmark', tags=['benchmark'])

@router.get('/map-points')
def get_map_points(region: str = '전체', district: str = '전체',
                   start_date: date | None = None, end_date: date | None = None,
                   as_of: date | None = None):
    if start_date and end_date and end_date < start_date:
        raise HTTPException(status_code=422, detail='end_date는 start_date보다 빠를 수 없습니다.')
    try:
        return build_map_points(region=region, district=district, start_date=start_date,
                                end_date=end_date, as_of=as_of)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
