
"""What-if 요청 스키마. 변경 조건을 기존 추천 조건에 병합하여 검증합니다."""

from typing import Any

from pydantic import BaseModel, Field


class WhatIfRequest(BaseModel):
    recommendation_id: str = Field(min_length=1)

    modified_hard_filters: dict[str, Any] | None = None

    modified_soft_filters: dict[str, Any] | None = None
