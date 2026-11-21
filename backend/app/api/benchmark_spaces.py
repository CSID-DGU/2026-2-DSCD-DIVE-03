"""행정동별 등록 대관 공간 조회 API."""
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query

from app.services.benchmark_spaces_service import build_space_list

router = APIRouter(prefix='/api/benchmark', tags=['benchmark'])


@router.get('/spaces')
def get_spaces(
    region: str,
    district: str = '전체',
    min_area: Annotated[float | None, Query(ge=0)] = None,
    max_area: Annotated[float | None, Query(ge=0)] = None,
    min_price: Annotated[float | None, Query(ge=0)] = None,
    max_price: Annotated[float | None, Query(ge=0)] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=30)] = 8,
):
    try:
        return build_space_list(region, district, min_area, max_area, min_price, max_price, page, page_size)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
