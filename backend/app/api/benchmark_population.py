"""권역별 성별·연령대 생활인구 수 조회 API."""
from fastapi import APIRouter
from app.services.benchmark_population_service import build_population_summary

router = APIRouter(prefix='/api/benchmark', tags=['benchmark'])


@router.get('/population')
def get_population():
    return build_population_summary()
