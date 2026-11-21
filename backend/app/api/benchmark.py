"""벤치마크 통계 조회용 읽기 전용 API."""
from datetime import date
from fastapi import APIRouter, HTTPException, Query

from app.services.benchmark_service import build_district_summary, build_region_summary

router = APIRouter(prefix='/api/benchmark', tags=['benchmark'])


def _validate_dates(start_date, end_date):
    if start_date and end_date and end_date < start_date:
        raise HTTPException(status_code=422, detail='end_date는 start_date보다 빠를 수 없습니다.')


@router.get('/regions')
def get_regions(start_date: date | None = None, end_date: date | None = None,
                as_of: date | None = Query(default=None, description='재현 가능한 통계 기준일')):
    _validate_dates(start_date, end_date)
    return build_region_summary(start_date=start_date, end_date=end_date, as_of=as_of)


@router.get('/districts')
def get_districts(region: str, start_date: date | None = None, end_date: date | None = None,
                  as_of: date | None = None):
    _validate_dates(start_date, end_date)
    try:
        return build_district_summary(region=region, start_date=start_date, end_date=end_date, as_of=as_of)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
