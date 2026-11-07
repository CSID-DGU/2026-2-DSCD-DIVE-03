
import json

from ml.recommendation.scoring import (
    area_fit_scores,
    subway_accessibility_scores,
    rental_price_fit_scores,
    target_ratio_scores,
    brand_space_fit_scores,
)


SUPPORTED_FACTORS = {
    "area_fit",
    "subway_accessibility",
    "rental_price_fit",
    "target_ratio",
    "brand_space_fit",
}


def calculate_soft_scores(candidates, hard_filters, selected, brand_analysis_out=None):
    """
    Hard Filter 통과 공간의 Soft Filter 점수를 계산한다.

    - 사용자가 선택한 평가요소만 계산
    - 면적 조건을 입력해도 area_fit 자동 활성화 없음
    - 점수는 0~1 범위
    """

    # 선택한 평가요소가 현재 지원되는지 확인
    unsupported = set(selected) - SUPPORTED_FACTORS

    if unsupported:
        raise ValueError(
            f"아직 지원하지 않는 평가요소입니다: {sorted(unsupported)}"
        )

    scores_by_space = {
        str(row["seq"]): {}
        for _, row in candidates.iterrows()
    }

    if candidates.empty:
        return scores_by_space

    # 1. 면적 적합도
    if "area_fit" in selected:
        min_area = hard_filters.area_min_pyeong
        max_area = hard_filters.area_max_pyeong

        if min_area is None or max_area is None:
            raise ValueError(
                "면적 적합도를 선택하려면 최소·최대 면적을 입력해야 합니다."
            )

        scores = area_fit_scores(
            candidates["area_pyeong"].tolist(),
            min_area,
            max_area,
        )

        for space_id, score in zip(scores_by_space, scores):
            scores_by_space[space_id]["area_fit"] = score

    # 2. 지하철 접근성
    if "subway_accessibility" in selected:
        scores = subway_accessibility_scores(
            candidates["station_distance_m"].tolist()
        )

        for space_id, score in zip(scores_by_space, scores):
            scores_by_space[space_id]["subway_accessibility"] = score

    # 3. 대관료 적합도
    if "rental_price_fit" in selected:
        if hard_filters.max_budget_krw <= 0:
            raise ValueError(
                "대관료 적합도를 계산하려면 최대 예산이 0보다 커야 합니다."
            )

        scores = rental_price_fit_scores(
            candidates["price"].tolist(),
            hard_filters.max_budget_krw,
        )

        for space_id, score in zip(scores_by_space, scores):
            scores_by_space[space_id]["rental_price_fit"] = score

    # 4. 타깃 고객 비율
    if "target_ratio" in selected:
        target_groups = hard_filters.target_customers

        if not target_groups:
            raise ValueError(
                "타깃 고객 비율을 선택하려면 타깃 고객층을 입력해야 합니다."
            )

        ratios_by_candidate = [
            {
                group: float(row[f"{group}_ratio"])
                for group in target_groups
            }
            for _, row in candidates.iterrows()
        ]

        scores = target_ratio_scores(
            ratios_by_candidate,
            target_groups,
        )

        for space_id, score in zip(scores_by_space, scores):
            scores_by_space[space_id]["target_ratio"] = score

    if "brand_space_fit" in selected:
        if not hard_filters.brand_url:
            raise ValueError("브랜드 분위기 평가에는 공식 홈페이지 URL이 필요합니다.")
        from ml.brand.analyzer import get_brand_analyzer

        profiles = []
        for value in candidates["trait_scores"]:
            profile = json.loads(value) if isinstance(value, str) else value
            brand_space_fit_scores(profile, [profile])
            profiles.append(profile)
        try:
            analysis = get_brand_analyzer().analyze(hard_filters.brand_url)
        except Exception as exc:
            raise ValueError("브랜드 분석에 실패했습니다. URL과 API 설정을 확인하세요.") from exc
        scores = brand_space_fit_scores(analysis["trait_scores"], profiles)
        if brand_analysis_out is not None:
            brand_analysis_out.update(analysis)
        for space_id, score in zip(scores_by_space, scores, strict=True):
            scores_by_space[space_id]["brand_space_fit"] = score

    return scores_by_space
