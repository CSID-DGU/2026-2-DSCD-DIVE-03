
"""What-if 및 Trade-off 공용 추천 결과 저장소.

- recommendation_id 기준으로 추천 결과 저장
- What-if: 기존 추천 조건 및 추천 결과 재사용
- Trade-off: 추천 점수와 가중치 재사용
- 최대 100개 저장
- 1시간 후 자동 만료

주의:
- 서버 재시작 시 저장 데이터 초기화
- 여러 서버 프로세스 간 데이터 공유 불가
- 운영 환경에서는 Redis 또는 DB 사용 권장
"""

from copy import deepcopy
from threading import RLock
from time import monotonic

_TTL_SECONDS = 60 * 60
_MAX_ENTRIES = 100

_lock = RLock()
_entries: dict[str, tuple[float, dict]] = {}


def _prune(now: float) -> None:
    """만료된 추천 결과 및 초과 항목 제거."""
    expired = [
        key
        for key, (expires, _) in _entries.items()
        if expires <= now
    ]

    for key in expired:
        _entries.pop(key, None)

    while len(_entries) > _MAX_ENTRIES:
        oldest_key = next(iter(_entries))
        _entries.pop(oldest_key, None)


def save_recommendation(result: dict) -> None:
    """What-if 및 Trade-off가 사용할 추천 결과 저장."""

    recommendation_id = result.get("recommendation_id")

    if not isinstance(recommendation_id, str) or not recommendation_id:
        raise ValueError("recommendation_id가 필요합니다.")

    with _lock:
        now = monotonic()
        _prune(now)

        # 기존 저장 결과 제거 후 최신 데이터 저장
        _entries.pop(recommendation_id, None)
        _entries[recommendation_id] = (
            now + _TTL_SECONDS,
            deepcopy(result)
        )

        _prune(now)


def put_recommendation(result: dict) -> None:
    """기존 Trade-off 저장 함수와의 호환성 유지."""
    save_recommendation(result)


def get_recommendation(recommendation_id: str) -> dict | None:
    """What-if 및 Trade-off 공용 추천 결과 조회."""

    with _lock:
        now = monotonic()
        _prune(now)

        item = _entries.get(recommendation_id)

        if item is None:
            return None

        return deepcopy(item[1])


def clear_recommendations() -> None:
    """테스트용 저장소 초기화."""
    with _lock:
        _entries.clear()
