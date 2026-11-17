import json
import sys
from copy import deepcopy
from types import SimpleNamespace

from app.services import trade_off_llm


def example():
    return {
        "recommendation_id": "rec_test_llm",
        "spaces": [
            {"space_id": "A", "name": "공간 A", "price_krw": 100000, "area_pyeong": 30, "nearest_station": "A역", "final_score": 70},
            {"space_id": "B", "name": "공간 B", "price_krw": 150000, "area_pyeong": 35, "nearest_station": "B역", "final_score": 60},
        ],
        "score_comparison": {"difference": 10},
        "factor_comparison": [{
            "factor": "target_ratio", "weight": 1,
            "scores": {"A": 70, "B": 60},
            "contributions": {"A": 70, "B": 60},
            "contribution_difference": 10,
        }],
        "summary": "기본 수치 설명입니다.",
        "additional_considerations": "기본 고려사항입니다.",
        "summary_source": "rules",
        "llm_status": "not_requested",
    }


def test_llm_failure_keeps_verified_quantitative_result(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-key")
    trade_off_llm._narrative_cache.clear()

    class BrokenClient:
        def __init__(self, **kwargs):
            pass
        @property
        def chat(self):
            raise RuntimeError("Service error")

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=BrokenClient))
    original = example()
    result = trade_off_llm.add_llm_explanation(deepcopy(original))
    assert result["summary"] == original["summary"]
    assert result["summary_source"] == "rules"
    assert result["llm_status"] == "unavailable"
    assert result["factor_comparison"] == original["factor_comparison"]


def test_success_does_not_change_scores(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "dummy-key")
    trade_off_llm._narrative_cache.clear()
    payload = {
        "summary": "공간 A가 타깃 고객 점수에서 더 유리하며 공간 B도 다른 조건을 검토할 수 있습니다.",
        "additional_considerations": "공간 A와 B는 등록 대관료와 면적이 다르므로 계약 조건을 확인해야 합니다.",
    }

    class FakeClient:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=lambda **kwargs: SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))],
            )))

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=FakeClient))
    original = example()
    result = trade_off_llm.add_llm_explanation(deepcopy(original))
    assert result["summary_source"] == "llm"
    assert result["llm_status"] == "success"
    assert result["factor_comparison"] == original["factor_comparison"]
    assert result["score_comparison"] == original["score_comparison"]
