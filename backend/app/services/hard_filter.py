
import pandas as pd


# 프론트엔드 지역 코드 → CSV 지역명
REGION_MAP = {
    "seongsu": "성수",
    "gangnam_seocho": "강남·서초",
    "hongdae_sinchon": "홍대·신촌",
    "jongno_euljiro_myeongdong": "종로·을지로·명동",
    "yongsan": "용산",
    "jamsil": "잠실",
    "other": "기타",
}


def apply_hard_filters(
    spaces: pd.DataFrame,
    budget_max: int | None = None,
    regions: list[str] | None = None,
) -> pd.DataFrame:
    """
    POPCAST Hard Filter

    budget_max:
        최대 대관 예산(원)
        최대 예산 초과 공간 제외

    regions:
        None, [], ["all"] → 전체 지역
        ["seongsu"] → 성수
        ["seongsu", "hongdae_sinchon"] → 복수 지역

    사용 기간은 availability.py에서 별도 처리.
    """

    filtered = spaces.copy()

    # 1. 최대 예산 필터
    if budget_max is not None:
        if budget_max < 0:
            raise ValueError("최대 예산은 0 이상이어야 합니다.")

        filtered = filtered[
            filtered["price"] <= budget_max
        ]

    # 2. 희망 지역 필터
    if regions and "all" not in regions:
        invalid_regions = [
            region
            for region in regions
            if region not in REGION_MAP
        ]

        if invalid_regions:
            raise ValueError(
                f"지원하지 않는 지역 코드: {invalid_regions}"
            )

        selected_regions = [
            REGION_MAP[region]
            for region in regions
        ]

        filtered = filtered[
            filtered["region_group"].isin(selected_regions)
        ]

    return filtered.reset_index(drop=True)
