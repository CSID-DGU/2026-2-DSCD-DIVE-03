
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd


# 프로젝트 최상위 폴더의 데이터 경로
DATA_PATH = (
    Path(__file__).resolve().parents[3]
    / "data"
    / "popup_history.csv"
)

# 한국 시간 기준
KST = timezone(timedelta(hours=9))


def load_popup_history():
    """
    과거 팝업 개최 이력 CSV 로딩 및 전처리
    """
    history = pd.read_csv(
        DATA_PATH,
        encoding="cp949",
    )

    required_columns = [
        "category",
        "open_date",
        "mapped_region_group",
        "mapped_ADSTRD_NM",
    ]

    missing = [
        col for col in required_columns
        if col not in history.columns
    ]

    if missing:
        raise ValueError(
            f"팝업 이력 데이터에 필요한 컬럼이 없습니다: {missing}"
        )

    history["open_date"] = pd.to_datetime(
        history["open_date"],
        errors="coerce",
    )

    for col in [
        "category",
        "mapped_region_group",
        "mapped_ADSTRD_NM",
    ]:
        history[col] = history[col].astype("string").str.strip()

    return history


def count_popup_history(
    candidates: pd.DataFrame,
    category: str,
    today=None,
) -> list[int]:
    """
    각 후보 공간의 과거 동일 카테고리 팝업 개최 건수 계산

    조건:
    1. 사용자 카테고리와 동일
    2. 현재 날짜보다 이전에 시작
    3. 권역 + 행정동 일치

    반환:
    candidates의 행 순서와 동일한 개최 건수 리스트
    """
    if not category or not category.strip():
        raise ValueError(
            "동종 팝업 개최 이력을 계산하려면 카테고리가 필요합니다."
        )

    if candidates.empty:
        return []

    if today is None:
        today = datetime.now(KST).date()

    history = load_popup_history()

    # 1. 카테고리 필터링
    history = history[
        history["category"] == category.strip()
    ]

    # 2. 오늘 이전에 시작한 팝업만 사용
    history = history[
        history["open_date"].dt.date < today
    ]

    # 3. 권역 + 행정동별 개최 건수 집계
    counts = (
        history.groupby(
            ["mapped_region_group", "mapped_ADSTRD_NM"]
        )
        .size()
        .to_dict()
    )

    # 4. 각 후보 공간에 집계 결과 매핑
    result = []

    for _, row in candidates.iterrows():
        region = row["region_group"]
        dong = row["ADSTRD_NM"]

        if pd.isna(region) or pd.isna(dong):
            result.append(0)
            continue

        key = (str(region).strip(), str(dong).strip())

        count = counts.get(key, 0)
        result.append(int(count))

    return result
