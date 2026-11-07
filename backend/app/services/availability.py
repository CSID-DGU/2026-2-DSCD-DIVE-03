
import time
from datetime import date, timedelta
from urllib.parse import urlparse

import pandas as pd
from curl_cffi import requests


# ============================================================
# 1. Shareit API 설정
# ============================================================

API_BASE = "https://shareit-resource.shareit.kr"

session = requests.Session(impersonate="chrome")

session.headers.update({
    "Accept": "application/json",
    "Content-Type": "application/json;charset=UTF-8",
    "Origin": "https://shareit.kr",
    "Referer": (
        "https://shareit.kr/search/venue"
        "?showEventTypeHeader=true&eventTypes=29"
    ),
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
})


# ============================================================
# 2. Shareit 공간 판별
# ============================================================

def is_shareit_space(page_url: str) -> bool:
    """공간 URL을 통해 Shareit 데이터인지 확인."""

    hostname = urlparse(str(page_url)).hostname or ""

    return hostname in {
        "shareit.kr",
        "www.shareit.kr",
    }


# ============================================================
# 3. 운영 기간 날짜 생성
# ============================================================

def get_date_range(start_date: str, end_date: str):
    """
    시작일 ~ 종료일의 모든 날짜 생성.

    운영 기간 길이 제한 없음.
    시작일과 종료일 모두 포함.
    """

    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    if end < start:
        raise ValueError(
            "종료일은 시작일보다 빠를 수 없습니다."
        )

    current = start

    while current <= end:
        yield current.isoformat()
        current += timedelta(days=1)


# ============================================================
# 4. Shareit API 호출
# ============================================================

def get_shareit_timelines(
    space_id: int,
    target_date: str,
) -> list[dict]:
    """Shareit API에서 특정 날짜의 예약 슬롯 조회."""

    url = f"{API_BASE}/spaces/{space_id}/time"

    response = session.get(
        url,
        params={
            "searchDate": target_date,
            "work": "true",
            "life": "false",
        },
        timeout=10,
    )

    response.raise_for_status()

    data = response.json()

    # 실제 Shareit API 응답 구조
    # content → resource → timelines
    timelines = (
        (data.get("content") or {})
        .get("resource") or {}
    ).get("timelines")

    if not isinstance(timelines, list) or not timelines:
        raise ValueError(
            "시간대 정보가 없거나 응답 형식이 올바르지 않습니다."
        )

    return timelines


# ============================================================
# 5. Shareit 공간 전체 운영 기간 확인
# ============================================================

def check_shareit_period(
    space_id: int,
    start_date: str,
    end_date: str,
) -> str:
    """
    선택한 운영 기간의 모든 날짜 및 슬롯 확인.

    반환 상태:
        api_slots_available:
            조회한 모든 날짜의 슬롯이 sale=True

        api_slots_unavailable:
            하루라도 sale=False 슬롯이 있으면 제외

        assumed_available:
            API 조회 실패 또는 예약 정보 확인 불가
    """

    has_unknown = False

    for target_date in get_date_range(
        start_date,
        end_date,
    ):
        try:
            timelines = get_shareit_timelines(
                space_id,
                target_date,
            )

            # 모든 슬롯이 딕셔너리인지 확인
            if not all(
                isinstance(item, dict)
                for item in timelines
            ):
                has_unknown = True
                continue

            # 하루 중 하나라도 sale=False이면
            # 전체 운영 기간 사용 불가능
            if any(
                item.get("sale") is False
                for item in timelines
            ):
                return "api_slots_unavailable"

            # sale 값이 없거나 True/False가 아닌 경우
            if any(
                item.get("sale") is not True
                for item in timelines
            ):
                has_unknown = True

        except Exception as exc:
            print(
                f"[예약 조회 실패] "
                f"{space_id}, {target_date}: {exc}"
            )

            # 조회 실패한 날짜는 사용 가능으로 간주
            # 단, 다른 날짜의 sale=False는 계속 검사
            has_unknown = True

        time.sleep(0.15)

    if has_unknown:
        return "assumed_available"

    return "api_slots_available"


# ============================================================
# 6. 전체 공간 사용 기간 Hard Filter
# ============================================================

def filter_spaces_by_period(
    spaces: pd.DataFrame,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """
    사용 기간 기준 후보 공간 필터링.

    Shareit:
        sale=False 슬롯이 하나라도 확인되면 제외.

    Shareit 조회 실패:
        사용 가능으로 간주하여 통과.

    다른 플랫폼:
        사용 가능으로 간주하여 통과.
    """

    # 날짜 형식 및 시작일/종료일 검증
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    if end < start:
        raise ValueError(
            "종료일은 시작일보다 빠를 수 없습니다."
        )

    results = []

    for _, row in spaces.iterrows():

        item = row.copy()

        # ----------------------------------------
        # Shareit 공간
        # ----------------------------------------

        if is_shareit_space(row["page_url"]):

            try:
                space_id = int(row["seq"])

                status = check_shareit_period(
                    space_id=space_id,
                    start_date=start_date,
                    end_date=end_date,
                )

            except (TypeError, ValueError) as exc:
                print(
                    f"[공간 ID 오류] "
                    f"{row['name']}: {exc}"
                )
                status = "assumed_available"

            source = "shareit_api"

        # ----------------------------------------
        # 다른 플랫폼 공간
        # ----------------------------------------

        else:
            status = "assumed_available"
            source = "not_supported"

        # ----------------------------------------
        # 사용 불가능 공간 제외
        # ----------------------------------------

        if status == "api_slots_unavailable":
            continue

        # 통과 공간에 예약 상태 추가
        item["availability_status"] = status
        item["availability_source"] = source

        results.append(item)

    # ----------------------------------------
    # 결과 반환
    # ----------------------------------------

    if not results:
        return spaces.iloc[0:0].copy().assign(
            availability_status=pd.Series(dtype="str"),
            availability_source=pd.Series(dtype="str"),
        )

    return pd.DataFrame(
        results
    ).reset_index(drop=True)
