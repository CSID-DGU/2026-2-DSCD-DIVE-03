
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
    # 소프트 필터 최소 1개 선택 필수
    # 배열 순서는 중요도 순위
    selected: list[str] = Field(min_length=1)

    # 사용자가 직접 입력한 가중치 (%)
    weights: dict[str, float]

    @model_validator(mode="after")
    def validate_soft_filters(self):
        if len(set(self.selected)) != len(self.selected):
            raise ValueError("같은 평가요소를 중복 선택할 수 없습니다.")

        if set(self.selected) != set(self.weights):
            raise ValueError(
                "선택한 평가요소와 가중치 항목이 일치해야 합니다."
            )

        if any(
            not isfinite(weight) or weight < 0 or weight > 100
            for weight in self.weights.values()
        ):
            raise ValueError("가중치는 0~100 사이여야 합니다.")

        if not isclose(
            sum(self.weights.values()),
            100.0,
            rel_tol=0,
            abs_tol=0.001,
        ):
            raise ValueError("가중치 합계는 100%여야 합니다.")

        ordered_weights = [
            self.weights[factor] for factor in self.selected
        ]

        if any(
            ordered_weights[i] < ordered_weights[i + 1]
            for i in range(len(ordered_weights) - 1)
        ):
            raise ValueError(
                "가중치는 중요도 순위에 따라 내림차순이어야 합니다."
            )

        return self



# ============================================================
# 3. 추천 API 요청 스키마
# ============================================================

class RecommendationRequest(BaseModel):
    
    hard_filters: HardFilters
    soft_filters: SoftFilters
