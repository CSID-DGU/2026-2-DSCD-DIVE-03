
"""What-if 지역별 동종 팝업 개최 이력 분석."""

import os
from pathlib import Path
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[3]


def analyze_popup_history(category, regions, reference_date):
    csv_path = Path(os.getenv(
        "POPCAST_HISTORY_CSV",
        str(PROJECT_ROOT / "data" / "popup_history.csv")
    ))

    if not csv_path.is_absolute():
        csv_path = PROJECT_ROOT / csv_path

    try:
        df = pd.read_csv(csv_path, encoding="utf-8-sig")
    except UnicodeDecodeError:
        df = pd.read_csv(csv_path, encoding="cp949")

    df["close_date"] = pd.to_datetime(
        df["close_date"], errors="coerce"
    )
    cutoff = pd.Timestamp(reference_date)

    # 동일 카테고리의 출점 예정일 이전 종료 기록
    df = df[
        (df["category"] == category)
        & (df["close_date"] < cutoff)
        & (df["mapped_region_group"].notna())
    ].copy()

    # '기타'는 비교 지역 및 분모에서 제외
    df = df[df["mapped_region_group"] != "기타"]

    counts = (
        df.groupby("mapped_region_group")
        .size()
        .sort_values(ascending=False)
    )

    total = int(counts.sum())
    region_count = len(counts)

    selected_regions = []

    for region in regions:
        # 실제 지역 그룹명으로 전달된 경우 집계
        count = int(counts.get(region, 0))

        # 0건인 지역은 공동 최하위로 처리
        rank = (
            1 + int((counts > count).sum())
            if region_count > 0 else None
        )

        selected_regions.append({
            "region": region,
            "popup_count": count,
            "share_percent": (
                round(count / total * 100, 1)
                if total else None
            ),
            "region_rank": rank,
            "total_regions": region_count,
        })

    return {
        "category": category,
        "reference_date": reference_date,
        "total_category_popups": total,
        "metric_definition": (
            "출점 예정일 이전 종료된 동일 카테고리 팝업 기록. "
            "'기타' 지역은 집계에서 제외"
        ),
        "selected_regions": selected_regions,
    }
