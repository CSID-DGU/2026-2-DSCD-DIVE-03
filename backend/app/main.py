
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.recommendations import router as recommendations_router


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


@app.get("/health")
def health_check():
    return {"status": "ok"}
