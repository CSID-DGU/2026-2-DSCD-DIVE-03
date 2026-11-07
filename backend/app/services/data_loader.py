
from pathlib import Path

import pandas as pd


# 프로젝트 최상위 폴더
PROJECT_ROOT = Path(__file__).resolve().parents[3]

# 공간 데이터 위치
DATA_PATH = PROJECT_ROOT / "data" / "popup_spaces.csv"


def load_spaces() -> pd.DataFrame:
    """
    POPCAST 공간 CSV를 불러오고
    Hard Filter에 사용할 데이터 타입을 정리한다.
    """

    # 1. CSV 로딩
    df = pd.read_csv(DATA_PATH, encoding="cp949")

    # 2. 가격을 숫자형으로 변환
    df["price"] = pd.to_numeric(
        df["price"].astype(str).str.replace(",", "", regex=False),
        errors="coerce"
    )

    # 3. 면적을 숫자형으로 변환
    df["area_pyeong"] = pd.to_numeric(
        df["area_pyeong"],
        errors="coerce"
    )

    # 4. 공간 ID를 문자열로 변환
    df["seq"] = df["seq"].astype(str)

    # 5. 지역 앞뒤 공백 제거
    df["region_group"] = df["region_group"].astype(str).str.strip()

    # 6. 필수 컬럼 결측치가 있는 공간 제거
    required_columns = [
        "seq",
        "name",
        "region_group",
        "price",
        "area_pyeong"
    ]

    df = df.dropna(subset=required_columns)

    return df
