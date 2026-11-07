
from datetime import date
from math import isclose, isfinite

from pydantic import BaseModel, Field, model_validator


# ============================================================
# 1. Hard Filter 입력 스키마
# ============================================================

class HardFilters(BaseModel):

    max_budget_krw: int = Field(ge=0)

    start_date: date
    end_date: date

    region_ids: list[str] = Field(
        default_factory=lambda: ["all"]
    )

    area_min_pyeong: float | None = Field(
        default=None,
        ge=0
    )

    area_max_pyeong: float | None = Field(
        default=None,
        ge=0
    )

    category_id: str | None = None

    target_customers: list[str] = Field(
        default_factory=list
    )

    brand_url: str | None = None

    @model_validator(mode="after")
    def validate_hard_filters(self):

        # 날짜 범위 검증
        if self.end_date < self.start_date:
            raise ValueError(
                "종료일은 시작일보다 빠를 수 없습니다."
            )


        # 면적 범위 검증
        if (
            self.area_min_pyeong is not None
            and self.area_max_pyeong is not None
            and self.area_min_pyeong > self.area_max_pyeong
        ):
            raise ValueError(
                "최소 면적이 최대 면적보다 클 수 없습니다."
            )

        return self


# ============================================================
# 2. Soft Filter 입력 스키마
# ============================================================


class SoftFilters(BaseModel):
    # 선택한 평가요소 (중요도 높은 순서)
    selected: list[str] = Field(min_length=1)

    # 인접한 중요도 순위 사이의 차이
    # 0: 비슷함
    # 1: 조금 더 중요함
    # 2: 더 중요함
    # 3: 훨씬 더 중요함
    importance_gaps: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_soft_filters(self):
        if len(set(self.selected)) != len(self.selected):
            raise ValueError(
                "같은 평가요소를 중복 선택할 수 없습니다."
            )

        if len(self.importance_gaps) != len(self.selected) - 1:
            raise ValueError(
                "중요도 차이 개수는 선택한 평가요소 수보다 1개 적어야 합니다."
            )

        if any(
            type(gap) is not int or gap < 0 or gap > 3
            for gap in self.importance_gaps
        ):
            raise ValueError(
                "중요도 차이는 0~3 사이의 정수여야 합니다."
            )

        return self




# ============================================================
# 3. 추천 API 요청 스키마
# ============================================================

class RecommendationRequest(BaseModel):

    hard_filters: HardFilters
    soft_filters: SoftFilters
