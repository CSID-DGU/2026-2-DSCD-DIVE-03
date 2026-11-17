"""Issue 5 V4: real numeric rationale in three visible recommendation cards.

No OpenAI network calls. The existing V3 'additional_considerations' behavior
must be preserved, with no changes to audited numeric data.
"""
import json
import sys
from copy import deepcopy
from types import SimpleNamespace

from app.services import trade_off_llm


def sample():
    return {
        "recommendation_id": "rec_v4_sections",
        "spaces": [
            {"space_id": "A", "name": "성수 A", "final_score": 89.2157, "price_krw": 2_000_000, "area_pyeong": 42},
            {"space_id": "B", "name": "성수 B", "final_score": 89.0569, "price_krw": 800_000, "area_pyeong": 14},
        ],
        "score_comparison": {"difference": 0.1588},
        "factor_comparison": [
            {"factor": "rental_price_fit", "weight": .50,
             "scores": {"A": 95, "B": 90},
             "contributions": {"A": 47.5, "B": 45},
             "contribution_difference": 2.5},
            {"factor": "brand_space_fit", "weight": .50,
             "scores": {"A": 80, "B": 83},
             "contributions": {"A": 40, "B": 41.5},
             "contribution_difference": -1.5},
        ],
        "summary": "기존 정량 설명을 유지합니다.",
        "additional_considerations": "기존 정량 고려사항을 유지합니다.",
        "summary_source": "rules",
        "llm_status": "not_requested",
    }


def fake_client(monkeypatch, payload):
    monkeypatch.setenv("OPENAI_API_KEY", "offline-key")
    trade_off_llm._narrative_cache.clear()
    requests = []

    def create(**kwargs):
        requests.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(
            message=SimpleNamespace(content=json.dumps(payload, ensure_ascii=False), refusal=None),
            finish_reason="stop",
        )])

    class FakeClient:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=create))

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=FakeClient))
    return requests


def test_three_cards_and_additional_considerations_unchanged(monkeypatch):
    considerations = (
        "두 공간은 성수역과 인접해 있습니다. 대관료 적합도는 A가 95점, B가 90점으로 다릅니다. "
        "사용자가 중요하게 둔 기준을 조정해 다시 추천을 실행해 보세요."
    )
    requests = fake_client(monkeypatch, {
        "summary": "성수 A는 89.2157점, 성수 B는 89.0569점으로 0.1588점 차이가 납니다.",
        "suitability_recommendation": "A가 89.2157점으로 B의 89.0569점보다 0.1588점 앞서므로 A를 추천합니다. rental_price_fit도 A 95점 대 B 90점입니다.",
        "cost_recommendation": "B는 800,000원으로 A의 2,000,000원보다 1,200,000원 저렴하므로 B를 추천합니다.",
        "overall_recommendation": "A는 0.1588점 앞서고 B는 대관료가 1,200,000원 저렴하므로 적합도는 A, 비용은 B입니다.",
        "additional_considerations": considerations,
    })
    before = sample()
    after = trade_off_llm.add_llm_explanation(deepcopy(before))
    assert after["llm_status"] == "success"
    assert after["summary_source"] == "llm"
    for heading in ("적합도 우선이라면", "비용 우선이라면", "종합적으로는"):
        assert after["summary"].count(heading) == 1
    assert after["summary"].index("적합도 우선이라면") < after["summary"].index("비용 우선이라면") < after["summary"].index("종합적으로는")
    assert "대관료 적합도" in after["summary"]
    assert "rental_price_fit" not in after["summary"]
    assert "89.2157" in after["summary"] and "89.0569" in after["summary"]
    assert "2,000,000원" in after["summary"] and "800,000원" in after["summary"]
    assert "1,200,000원" in after["summary"]
    assert after["additional_considerations"] == considerations
    assert after["spaces"] == before["spaces"]
    assert after["factor_comparison"] == before["factor_comparison"]
    assert after["score_comparison"] == before["score_comparison"]
    schema = requests[0]["response_format"]["json_schema"]["schema"]
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == {
        "summary", "suitability_recommendation", "cost_recommendation",
        "overall_recommendation", "additional_considerations",
    }
    system_prompt = requests[0]["messages"][0]["content"]
    assert "추가" in system_prompt or "additional_considerations" in system_prompt
    assert "CSR 최우선" in system_prompt


def test_duplicate_heading_removed_and_numeric_data_kept(monkeypatch):
    fake_client(monkeypatch, {
        "summary": "공간 A의 적합도는 89.2점이고 공간 B는 89.0점입니다.",
        "suitability_recommendation": "적합도 우선이라면, A는 89.2점이고 B는 89.0점이어서 A를 추천합니다.",
        "cost_recommendation": "비용 우선이라면 B는 800,000원, A는 2,000,000원입니다. B가 더 저렴합니다.",
        "overall_recommendation": "종합적으로는 A가 종합점수 0.2점 높지만 B는 120만 원 저렴하므로 상황별로 추천합니다.",
        "additional_considerations": "CSR 최우선 기준의 공간별 점수를 다시 확인하고 추천 조건을 조정해 보세요.",
    })
    result = trade_off_llm.add_llm_explanation(sample())
    assert result["llm_status"] == "success"
    for heading in ("적합도 우선이라면", "비용 우선이라면", "종합적으로는"):
        assert result["summary"].count(heading) == 1


def test_missing_section_field_uses_rule_based_fallback(monkeypatch):
    fake_client(monkeypatch, {
        "summary": "공간 A는 89.2157점, 공간 B는 89.0569점으로 비교할 수 있습니다.",
        "suitability_recommendation": "A는 B보다 0.1588점 높아 A를 추천합니다.",
        "cost_recommendation": "B는 A보다 1,200,000원 더 저렴합니다.",
        "additional_considerations": "두 공간의 가중치 우선순위를 조정해 추천을 다시 실행할 수 있습니다.",
    })
    original = sample()
    result = trade_off_llm.add_llm_explanation(deepcopy(original))
    assert result["llm_status"] == "unavailable"
    assert result["summary_source"] == "rules"
    assert result["summary"] == original["summary"]
    assert result["additional_considerations"] == original["additional_considerations"]
    assert result["spaces"] == original["spaces"]


def test_repeated_heading_in_middle_does_not_create_duplicate_section(monkeypatch):
    """Regression: do not duplicate '적합도 우선이라면' within one response."""
    fake_client(monkeypatch, {
        "summary": "공간 A는 89.2157점이고 B는 89.0569점으로 비교할 수 있습니다.",
        "suitability_recommendation": (
            "공간 A가 89.2157점으로 B의 89.0569점보다 0.1588점 높아 "
            "적합도 우선이라면 공간 A를 추천합니다."
        ),
        "cost_recommendation": "비용 우선이라면 B는 800,000원으로 A보다 1,200,000원 저렴합니다.",
        "overall_recommendation": "종합적으로는 A가 0.1588점 높고 B가 1,200,000원 저렴합니다.",
        "additional_considerations": "현재 CSR 가중치를 고려하고 사용자 평가요소 중요도를 바꿔 비교할 수 있습니다.",
    })
    result = trade_off_llm.add_llm_explanation(sample())
    assert result["llm_status"] == "success"
    for heading in ("적합도 우선이라면", "비용 우선이라면", "종합적으로는"):
        assert result["summary"].count(heading) == 1
    assert "0.1588점 높아 공간 A를 추천합니다" in result["summary"]
    assert result["summary"].count("89.2157") >= 1
