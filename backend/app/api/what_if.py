
"""POST /analyses/what-if — 추천 재실행 및 변경 전후 결과 분석 API."""

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError

from app.schemas.what_if import WhatIfRequest
from app.services.what_if_service import analyze_what_if
from ml.brand.errors import BrandAnalysisError


router = APIRouter(
    prefix="/analyses",
    tags=["What-if"],
)


@router.post("/what-if")
async def create_what_if(request: WhatIfRequest):
    try:
        return await run_in_threadpool(
            analyze_what_if,
            request,
        )

    except LookupError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=exc.errors(include_context=False),
        ) from exc

    except BrandAnalysisError as exc:
        raise HTTPException(
            status_code=503,
            detail=exc.as_detail(),
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc
