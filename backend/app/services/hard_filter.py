
import pandas as pd


# 영문 지역 코드 → CSV 한글 지역명
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

    - 최대 예산을 초과하는 공간 제외
    - 영문 지역 코드와 한글 지역명 모두 지원
    - 운영 기간은 availability.py에서 별도 처리
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
        valid_region_names = set(REGION_MAP.values())

        selected_regions = []
        invalid_regions = []

        for region in regions:
            if region in valid_region_names:
                selected_regions.append(region)
            elif region in REGION_MAP:
                selected_regions.append(REGION_MAP[region])
            else:
                invalid_regions.append(region)

        if invalid_regions:
            raise ValueError(
                f"지원하지 않는 지역: {invalid_regions}"
            )

        filtered = filtered[
            filtered["region_group"].isin(selected_regions)
        ]

    # 중요: 지역 조건 유무와 관계없이 항상 DataFrame 반환
    return filtered.reset_index(drop=True)
