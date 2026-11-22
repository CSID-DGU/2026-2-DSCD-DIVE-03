"""Deterministic quantitative Trade-off analysis of two *saved* recommendations.

Use existing 0-100 factor scores, CSR weights and weighted contributions; no
recomputation, normalization, artificial scores or Mock values are allowed.
"""

from math import isfinite

FACTOR_LABELS = {
    "target_ratio": "타깃 고객 규모",
    "brand_space_fit": "브랜드-공간 분위기 일치도",
    "popup_history": "동종 팝업 개최 이력",
    "subway_accessibility": "지하철 접근성",
    "rental_price_fit": "대관료 적합도",
    "area_fit": "공간 면적 적합도",
}


def _num(value, label: str) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not isfinite(value):
        raise ValueError(f"유효하지 않은 {label} 값입니다.")
    return float(value)


def _rounded(value: float) -> float:
    return round(float(value), 4)


def _main_arguments(space, rival, comparisons, popup_history_direction="frequent"):
    space_id, rival_id = space["space_id"], rival["space_id"]
    differences = [
        (
            row["factor"],
            row["scores"][space_id] - row["scores"][rival_id],
            row["contributions"][space_id] - row["contributions"][rival_id],
        )
        for row in comparisons
    ]
    positives = sorted((item for item in differences if item[1] > 1e-6), key=lambda x: (-x[2], -x[1]))[:3]
    negatives = sorted((item for item in differences if item[1] < -1e-6), key=lambda x: (x[2], x[1]))[:3]

    def describe(item, positive):
        factor, score_delta, contribution_delta = item
        label = FACTOR_LABELS.get(factor, factor)
        if factor == "popup_history":
            label += " (적게 개최된 지역 선호)" if popup_history_direction == "rare" else " (많이 개최된 지역 선호)"
        verb = "높음" if positive else "낮음"
        return (
            f"{label} 적합도가 상대 공간보다 "
            f"{abs(score_delta):.1f}점 {verb} "
            f"(가중 기여도 차이 {abs(contribution_delta):.1f}점)"
        )

    return {
        "strength": [describe(item, True) for item in positives],
        "weakness": [describe(item, False) for item in negatives],
    }


def _considerations(a, b):
    remarks = []
    for key, label, unit in (
        ("price_krw", "등록 대관료", "원"),
        ("area_pyeong", "면적", "평"),
    ):
        a_val, b_val = a.get(key), b.get(key)
        if a_val is not None and b_val is not None:
            a_val = _num(a_val, label)
            b_val = _num(b_val, label)
            fmt = ",.0f" if key == "price_krw" else ",.1f"
            remarks.append(f"{label}: A {format(a_val, fmt)}{unit} / B {format(b_val, fmt)}{unit}")
    stations = [space.get("nearest_station") or "정보 없음" for space in (a, b)]
    remarks.append(f"인근 역: A {stations[0]} / B {stations[1]}")
    remarks.append("등록 가격은 실제 운영 기간의 총 대관료와 다를 수 있으므로 예약 가능 여부 및 상세 견적을 별도로 확인해 주세요.")
    return " · ".join(remarks)


def compare_recommendations(recommendation: dict, space_ids: list[str]) -> dict:
    """Produce the exact response keys expected by TradeOffAnalysis.jsx."""
    if len(space_ids) != 2 or not all(space_ids) or space_ids[0] == space_ids[1]:
        raise ValueError("서로 다른 공간 두 개를 선택해 주세요.")
    by_id = {str(space["space_id"]): space for space in recommendation.get("recommendations", [])}
    if any(space_id not in by_id for space_id in space_ids):
        raise ValueError("선택한 공간 중 현재 추천 결과에 속하지 않는 공간이 있습니다.")
    a, b = (by_id[space_id] for space_id in space_ids)
    weights = recommendation.get("weights") or {}
    if not weights:
        raise ValueError("추천 기준의 CSR 가중치가 없습니다.")

    factor_comparison = []
    for factor, raw_weight in weights.items():
        weight = _num(raw_weight, f"{factor} 가중치")
        if not 0 <= weight <= 1:
            raise ValueError("CSR 가중치 범위가 잘못되었습니다.")
        if any(factor not in space.get("factor_scores", {}) or factor not in space.get("contributions", {}) for space in (a, b)):
            raise ValueError(f"{factor} 평가값이 누락되었습니다.")
        a_score = _num(a["factor_scores"][factor], f"{factor} 공간 A 적합도")
        b_score = _num(b["factor_scores"][factor], f"{factor} 공간 B 적합도")
        a_contrib = _num(a["contributions"][factor], f"{factor} 공간 A 기여도")
        b_contrib = _num(b["contributions"][factor], f"{factor} 공간 B 기여도")
        if not 0 <= a_score <= 100 or not 0 <= b_score <= 100:
            raise ValueError(f"{factor} 점수 범위가 잘못되었습니다.")
        # Values returned by the recommendation API have 4 decimal places.
        if abs(a_score * weight - a_contrib) > 0.02 or abs(b_score * weight - b_contrib) > 0.02:
            raise ValueError(f"{factor} 기여도와 CSR 가중치가 일치하지 않습니다.")
        factor_comparison.append({
            "factor": factor,
            "weight": _rounded(weight),
            "scores": {a["space_id"]: a_score, b["space_id"]: b_score},
            "contributions": {a["space_id"]: a_contrib, b["space_id"]: b_contrib},
            "score_difference": _rounded(a_score - b_score),
            "contribution_difference": _rounded(a_contrib - b_contrib),
            "winner_space_id": a["space_id"] if a_score > b_score else b["space_id"] if b_score > a_score else None,
        })

    a_final = _num(a["final_score"], "공간 A 종합점수")
    b_final = _num(b["final_score"], "공간 B 종합점수")
    if abs(sum(item["contributions"][a["space_id"]] for item in factor_comparison) - a_final) > 0.02:
        raise ValueError("공간 A의 종합점수와 기여도 합계가 일치하지 않습니다.")
    if abs(sum(item["contributions"][b["space_id"]] for item in factor_comparison) - b_final) > 0.02:
        raise ValueError("공간 B의 종합점수와 기여도 합계가 일치하지 않습니다.")

    popup_history_direction = recommendation.get("popup_history_direction", "frequent")
    a_arguments = _main_arguments(a, b, factor_comparison, popup_history_direction)
    b_arguments = _main_arguments(b, a, factor_comparison, popup_history_direction)
    ranked_factors = sorted(factor_comparison, key=lambda row: abs(row["contribution_difference"]), reverse=True)
    biggest = ranked_factors[0]
    leader = a if a_final > b_final else b if b_final > a_final else None
    headline = (
        f"{leader['name']}의 종합 적합도가 상대 공간보다 {abs(a_final - b_final):.1f}점 높습니다."
        if leader else "두 공간의 종합 적합도가 같습니다."
    )
    top_sentence = (
        f"점수 차이에 가장 크게 기여한 평가요소는 {FACTOR_LABELS.get(biggest['factor'], biggest['factor'])}이며, "
        f"두 공간의 기여도 차이는 {abs(biggest['contribution_difference']):.1f}점입니다."
    )
    summary = f"{headline} {top_sentence} 각 공간의 평가요소별 강점과 약점 및 등록 대관료·면적을 함께 비교해 주세요."

    displayed = [
        {field: space.get(field) for field in (
            "space_id", "rank", "name", "address", "image_url", "price_krw",
            "area_pyeong", "nearest_station", "station_distance_m", "latitude",
            "longitude", "final_score", "factor_scores", "contributions",
        )}
        for space in (a, b)
    ]
    return {
        "recommendation_id": recommendation["recommendation_id"],
        "popup_history_direction": popup_history_direction,
        "spaces": displayed,
        "weights": weights,
        "factor_comparison": factor_comparison,
        "score_comparison": {
            a["space_id"]: a_final,
            b["space_id"]: b_final,
            "difference": _rounded(abs(a_final - b_final)),
            "leader_space_id": leader["space_id"] if leader else None,
        },
        "strengths": [
            {"space_id": a["space_id"], "items": a_arguments["strength"]},
            {"space_id": b["space_id"], "items": b_arguments["strength"]},
        ],
        "weaknesses": [
            {"space_id": a["space_id"], "items": a_arguments["weakness"]},
            {"space_id": b["space_id"], "items": b_arguments["weakness"]},
        ],
        "summary": summary,
        "additional_considerations": _considerations(a, b),
        "summary_source": "rules",
        "llm_status": "not_requested",
    }
