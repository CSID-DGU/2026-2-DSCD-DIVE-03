"""Bounded in-memory recommendation snapshots for the Trade-off demo.

The recommendation response is saved only after a successful calculation. The
snapshot is keyed by its unpredictable recommendation_id; do not accept scores
supplied by a Trade-off client as authoritative.

For multi-worker deployment replace this module with Redis/PostgreSQL storage.
"""

from copy import deepcopy
from threading import RLock
from time import monotonic

_TTL_SECONDS = 60 * 60
_MAX_ENTRIES = 64
_lock = RLock()
_entries: dict[str, tuple[float, dict]] = {}


def _prune(now: float) -> None:
    expired = [key for key, (expires, _) in _entries.items() if expires <= now]
    for key in expired:
        _entries.pop(key, None)
    if len(_entries) > _MAX_ENTRIES:
        for key in list(_entries)[: len(_entries) - _MAX_ENTRIES]:
            _entries.pop(key, None)


def put_recommendation(result: dict) -> None:
    """Keep the exact returned recommendation and CSR results for an hour."""
    recommendation_id = result.get("recommendation_id")
    if not isinstance(recommendation_id, str) or not recommendation_id:
        raise ValueError("recommendation_id가 필요합니다.")
    # Store only fields the comparison needs; brand_analysis can contain URLs,
    # text, and other external brand research that should not be cached here.
    snapshot = {
        "recommendation_id": recommendation_id,
        "weights": deepcopy(result["weights"]),
        "recommendations": deepcopy(result["recommendations"]),
    }
    with _lock:
        now = monotonic()
        _prune(now)
        _entries.pop(recommendation_id, None)
        _entries[recommendation_id] = (now + _TTL_SECONDS, snapshot)
        _prune(now)


def get_recommendation(recommendation_id: str) -> dict | None:
    with _lock:
        now = monotonic()
        _prune(now)
        item = _entries.get(recommendation_id)
        return deepcopy(item[1]) if item is not None else None


def clear_recommendations() -> None:
    """Clear snapshots for isolated tests."""
    with _lock:
        _entries.clear()
