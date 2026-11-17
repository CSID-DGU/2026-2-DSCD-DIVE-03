
"""What-if LLM 설명용 임시 저장소."""

from copy import deepcopy
from threading import RLock
from time import monotonic

TTL = 60 * 60
MAX_ITEMS = 50

_lock = RLock()
_scenarios = {}


def _prune():
    now = monotonic()

    for sid, item in list(_scenarios.items()):
        if item["expires"] <= now:
            _scenarios.pop(sid, None)

    while len(_scenarios) > MAX_ITEMS:
        oldest = next(iter(_scenarios))
        _scenarios.pop(oldest, None)


def save_scenario(result: dict) -> None:
    """TOP 5의 정량 분석 데이터만 저장."""

    scenario_id = result["scenario_id"]
    updated = result["updated_recommendation"]

    top5 = sorted(
        updated.get("recommendations", []),
        key=lambda s: s["rank"],
    )[:5]

    space_ids = {
        str(space["space_id"])
        for space in top5
    }

    snapshot = {
        "baseline_recommendation_id":
            result["baseline_recommendation_id"],
        "changed_conditions":
            result["changed_conditions"],
        "factor_impacts":
            result["factor_impacts"],
        "weights":
            updated.get("weights", {}),
        "spaces": {
            str(space["space_id"]): {
                "space": space,
                "analysis": result["space_analyses"][
                    str(space["space_id"])
                ],
            }
            for space in top5
        },
        "rank_changes": {
            str(item["space_id"]): item
            for item in result["rank_changes"]
            if str(item["space_id"]) in space_ids
        },
        "summaries": {},
    }

    with _lock:
        _prune()
        _scenarios[scenario_id] = {
            "expires": monotonic() + TTL,
            "data": deepcopy(snapshot),
        }
        _prune()


def get_scenario(scenario_id: str) -> dict | None:
    with _lock:
        _prune()
        item = _scenarios.get(scenario_id)
        return deepcopy(item["data"]) if item else None


def get_cached_summary(
    scenario_id: str,
    space_id: str,
) -> str | None:
    with _lock:
        _prune()
        item = _scenarios.get(scenario_id)

        if item is None:
            return None

        return item["data"]["summaries"].get(space_id)


def cache_summary(
    scenario_id: str,
    space_id: str,
    summary: str,
) -> None:
    with _lock:
        _prune()
        item = _scenarios.get(scenario_id)

        if item is not None:
            item["data"]["summaries"][space_id] = summary
