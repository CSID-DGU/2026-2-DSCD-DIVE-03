
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.recommendations import router as recommendations_router
from app.api.what_if import router as what_if_router
from app.api.trade_off import router as trade_off_router
from app.api.benchmark import router as benchmark_router
from app.api.benchmark_map import router as benchmark_map_router
from app.api.benchmark_spaces import router as benchmark_spaces_router
from app.api.benchmark_population import router as benchmark_population_router
from app.api.benchmark_popup_grid import router as benchmark_popup_grid_router

app = FastAPI(
    title="POPCAST API",
    description="POPCAST 팝업스토어 공간 추천 서비스 API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 추천 API 등록
app.include_router(recommendations_router)
app.include_router(what_if_router)
app.include_router(trade_off_router)

# Trade-off 분석 API 등록
app.include_router(trade_off_router)

@app.get("/health")
def health_check():
    return {"status": "ok"}

# 벤치마크 API 등록
app.include_router(benchmark_router)

# 벤치마크 지도 API 등록
app.include_router(benchmark_map_router)

# 벤치마크 대관 공간 API
app.include_router(benchmark_spaces_router)

# 벤치마크 인구 통계 API
app.include_router(benchmark_population_router)

# 벤치마크 팝업 모달
app.include_router(benchmark_popup_grid_router)