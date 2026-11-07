
import time
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

import pandas as pd
from curl_cffi import requests


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

def is_shareit_space(page_url: str) -> bool:
    """공간 URL을 통해 Shareit 데이터인지 확인."""
    hostname = urlparse(str(page_url)).hostname or ""
    return hostname in {"shareit.kr", "www.shareit.kr"}


def get_date_range(start_date: str, end_date: str):
    """시작일 ~ 종료일 날짜 생성."""
    start = date.fromisoformat(start_date)
    end = date.fromisoformat(end_date)

    if end < start:
        raise ValueError("종료일은 시작일보다 빠를 수 없습니다.")

    current = start
    while current <= end:
        yield current.isoformat()
        current += timedelta(days=1)


def get_shareit_timelines(space_id: int, target_date: str):
    """Shareit API에서 해당 날짜의 시간대 정보 조회."""
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
    timelines = (
        (data.get("content") or {})
        .get("resource") or {}
    ).get("timelines")

    if not isinstance(timelines, list) or not timelines:
        raise ValueError("시간대 정보가 없거나 응답 형식이 올바르지 않습니다.")

    return timelines


def check_shareit_period(
    space_id: int,
    start_date: str,
    end_date: str,
) -> str:
    """
    요청 기간의 모든 날짜, 모든 슬롯 확인

    - api_slots_available: 모든 슬롯 sale=True
    - api_slots_unavailable: 하나라도 sale=False
    - assumed_available: API 조회 불가
    """

    has_unknown = False

    for target_date in get_date_range(start_date, end_date):
        try:
            timelines = get_shareit_timelines(
                space_id,
                target_date,
            )

            # 하루 중 하나라도 예약 불가능한 슬롯이 있으면 제외
            if any(
                item.get("sale") is False
                for item in timelines
            ):
                return "api_slots_unavailable"

            # sale 값이 없는 슬롯도 확인 불가로 처리
            if any(
                item.get("sale") is not True
                for item in timelines
            ):
                has_unknown = True

        except Exception as exc:
            print(
                f"[예약 조회 실패] {space_id}, "
                f"{target_date}: {exc}"
            )
            has_unknown = True

        time.sleep(0.15)

    if has_unknown:
        return "assumed_available"

    return "api_slots_available"


def filter_spaces_by_period(
    spaces: pd.DataFrame,
    start_date: str,
    end_date: str,
) -> pd.DataFrame:
    """
    사용 기간 기준 후보 공간 필터.

    Shareit: API에서 슬롯 부족이 확인된 공간만 제외
    기타 플랫폼: 확인 불가 상태로 후보 유지
    """

    # 날짜 및 시간 입력값 검증
    dates = list(get_date_range(start_date, end_date))
    if len(dates) > 31:
        raise ValueError("한 번에 조회 가능한 기간은 최대 31일입니다.")


    results = []

    for _, row in spaces.iterrows():
        item = row.copy()

        if is_shareit_space(row["page_url"]):
            try:
                space_id = int(row["seq"])

                status = check_shareit_period(
                    space_id,
                    start_date,
                    end_date,
                )

            except (TypeError, ValueError):
                status = "assumed_available"

            source = "shareit_api"

        else:
            status = "assumed_available"
            source = "not_supported"

        # 명확하게 슬롯 부족이 확인된 공간만 제외
        if status == "api_slots_unavailable":
            continue

        item["availability_status"] = status
        item["availability_source"] = source
        results.append(item)

    if not results:
        return spaces.iloc[0:0].copy().assign(
            availability_status=pd.Series(dtype="str"),
            availability_source=pd.Series(dtype="str"),
        )

    return pd.DataFrame(results).reset_index(drop=True)
