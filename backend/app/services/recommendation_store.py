
"""개발용 추천 결과 저장소.

추천 결과를 메모리에 임시 저장하여
What-if 분석 시 recommendation_id로 조회합니다.

주의:
- 서버 재시작 시 데이터 초기화
- 여러 서버 프로세스 간 데이터 공유 불가
- 운영 환경에서는 Redis 또는 DB로 교체 필요
"""

from collections import OrderedDict
from copy import deepcopy
from threading import Lock


# 최대 저장 가능한 추천 결과 수
_MAX_ITEMS = 100

# 추천 결과 저장소
_items = OrderedDict()

# 동시 접근 보호
_lock = Lock()


def save_recommendation(result: dict) -> None:
    """추천 결과를 recommendation_id 기준으로 저장합니다."""

    key = result["recommendation_id"]

    with _lock:
        _items[key] = deepcopy(result)

        # 최근 저장한 항목을 마지막으로 이동
        _items.move_to_end(key)

        # 저장 개수가 제한을 초과하면 가장 오래된 항목 삭제
        while len(_items) > _MAX_ITEMS:
            _items.popitem(last=False)


def get_recommendation(recommendation_id: str) -> dict | None:
    """recommendation_id로 기존 추천 결과를 조회합니다."""

    with _lock:
        result = _items.get(recommendation_id)

        if result is not None:
            # 최근 조회한 항목을 마지막으로 이동
            _items.move_to_end(recommendation_id)

            # 원본 데이터가 변경되지 않도록 복사본 반환
            return deepcopy(result)

    return None
