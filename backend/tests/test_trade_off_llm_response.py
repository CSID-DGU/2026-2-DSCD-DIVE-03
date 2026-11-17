"""Offline contract regression tests for GPT-4o trade-off narratives."""
import json
import sys
from copy import deepcopy
from types import SimpleNamespace

from app.services import trade_off_llm


def sample():
    return {
        "recommendation_id": "rec_contract_test",
        "spaces": [
            {"space_id": "a", "name": "공간 A", "final_score": 80, "price_krw": 2000000, "area_pyeong": 40},
            {"space_id": "b", "name": "공간 B", "final_score": 79, "price_krw": 800000, "area_pyeong": 14},
        ],
        "score_comparison": {"difference": 1},
        "factor_comparison": [
            {"factor": "rental_price_fit", "weight": 1,
             "scores": {"a": 80, "b": 79}, "contributions": {"a": 80, "b": 79}},
        ],
        "summary": "기존 정량 비교 설명입니다.",
        "additional_considerations": "기존 정량 비교 고려사항입니다.",
        "summary_source": "rules",
        "llm_status": "not_requested",
    }


def stub(monkeypatch, body, *, finish_reason="stop", refusal=None):
    monkeypatch.setenv("OPENAI_API_KEY", "offline-fake-key")
    trade_off_llm._narrative_cache.clear()
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        message = SimpleNamespace(content=json.dumps(body, ensure_ascii=False), refusal=refusal)
        return SimpleNamespace(choices=[SimpleNamespace(message=message, finish_reason=finish_reason)])

    class FakeOpenAI:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=create))

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=FakeOpenAI))
    return calls


def test_schema_and_existing_quantitative_values_preserved(monkeypatch):
    calls = stub(monkeypatch, {
        "summary": "적합도 우선이라면 공간 A는 80점, 공간 B는 79점으로 A가 1점 앞섭니다.",
        "additional_considerations": "현재 CSR 가중치가 높은 대관료 적합도를 비교하고 중요도를 조정해보세요.",
    })
    input_data = sample()
    output = trade_off_llm.add_llm_explanation(deepcopy(input_data))
    assert output["llm_status"] == "success"
    assert output["summary_source"] == "llm"
    assert output["spaces"] == input_data["spaces"]
    assert output["factor_comparison"] == input_data["factor_comparison"]
    fmt = calls[0]["response_format"]
    assert fmt["type"] == "json_schema"
    assert fmt["json_schema"]["strict"] is True
    assert set(fmt["json_schema"]["schema"]["required"]) == {"summary", "suitability_recommendation", "cost_recommendation", "overall_recommendation", "additional_considerations"}
    assert calls[0]["max_tokens"] >= 2000


def test_long_valid_explanation_is_not_needlessly_discarded(monkeypatch):
    long_summary = "비교 점수가 확인되었습니다. " * 105  # > 2000 chars, < 4000 chars
    stub(monkeypatch, {
        "summary": long_summary,
        "additional_considerations": "최우선 CSR 가중치를 확인하고 추천 조건을 다시 변경해 보세요.",
    })
    output = trade_off_llm.add_llm_explanation(sample())
    assert output["llm_status"] == "success"
    assert output["summary"] == long_summary.strip()


def test_missing_field_falls_back_without_changing_scores(monkeypatch, caplog):
    stub(monkeypatch, {"summary": "한쪽 공간이 더 높습니다. 두 공간을 비교합니다."})
    original = sample()
    output = trade_off_llm.add_llm_explanation(deepcopy(original))
    assert output["llm_status"] == "unavailable"
    assert output["summary_source"] == "rules"
    assert output["summary"] == original["summary"]
    assert output["spaces"] == original["spaces"]
    assert "field=additional_considerations" in caplog.text
    assert "offline-fake-key" not in caplog.text


def test_truncated_response_falls_back(monkeypatch):
    stub(monkeypatch, {
        "summary": "공간 A와 B를 비교해 설명하겠습니다.",
        "additional_considerations": "현재 CSR 가중치 우선순위를 확인해 보세요.",
    }, finish_reason="length")
    output = trade_off_llm.add_llm_explanation(sample())
    assert output["llm_status"] == "unavailable"
    assert output["summary_source"] == "rules"
