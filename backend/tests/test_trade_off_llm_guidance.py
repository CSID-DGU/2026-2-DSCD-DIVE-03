"""Issue 5 — check grounded facts and priority-aware GPT instructions. Offline."""
import json
import sys
from copy import deepcopy
from types import SimpleNamespace

from app.services import trade_off_llm
from app.services.trade_off_service import FACTOR_LABELS


def fixture():
    return {
        "recommendation_id": "rec_guidance_v3",
        "spaces": [
            {"space_id": "a", "name": "성수 A 공간", "final_score": 80.9481,
             "price_krw": 2_000_000, "area_pyeong": 42, "nearest_station": "성수역"},
            {"space_id": "b", "name": "성수 B 공간", "final_score": 80,
             "price_krw": 800_000, "area_pyeong": 14, "nearest_station": "성수역"},
        ],
        "score_comparison": {"difference": .9481},
        "factor_comparison": [
            {"factor": "brand_space_fit", "weight": .25,
             "scores": {"a": 90, "b": 80}, "contributions": {"a": 22.5, "b": 20},
             "score_difference": 10, "contribution_difference": 2.5},
            {"factor": "rental_price_fit", "weight": .30,
             "scores": {"a": 75, "b": 85}, "contributions": {"a": 22.5, "b": 25.5},
             "score_difference": -10, "contribution_difference": -3},
            {"factor": "target_ratio", "weight": .45,
             "scores": {"a": 80, "b": 80}, "contributions": {"a": 36, "b": 36},
             "score_difference": 0, "contribution_difference": 0},
        ],
        "summary": "기존 정량 비교 요약입니다.",
        "additional_considerations": "기존 정량 비교 고려사항입니다.",
        "summary_source": "rules",
        "llm_status": "not_requested",
    }


def test_named_factors_use_backend_official_labels():
    result = trade_off_llm._facts(fixture())
    rows = result["factors_in_csr_weight_order"]
    assert [row["name"] for row in rows] == [
        "타깃 고객 규모", "대관료 적합도", "브랜드-공간 분위기 일치도"]
    assert [row["csr_weight_percent"] for row in rows] == [45, 30, 25]
    assert result["top_csr_weight_factors"] == [rows[0]]
    # 사용자에게 표시할 평가요소 명칭만 검사
    display_names = [
        row["name"]
        for row in result["factors_in_csr_weight_order"]
    ]

    assert all(name in FACTOR_LABELS.values() for name in display_names)

    assert not any(
        code in name
        for name in display_names
        for code in FACTOR_LABELS
    )


def test_exact_registered_price_and_score_difference():
    facts = trade_off_llm._facts(fixture())
    assert facts["overall_score_gap_points"] == .9481
    assert facts["overall_score_leader"] == "A"
    assert facts["registered_price_gap_krw"] == 1_200_000
    assert facts["cheaper_space"] == "B"
    assert facts["cheaper_percent_relative_to_more_expensive"] == 60
    assert facts["area_gap_pyeong"] == 28
    assert facts["same_nearest_station"] == "성수역"


def test_similarity_differences_and_top_preference():
    facts = trade_off_llm._facts(fixture())
    assert [r["name"] for r in facts["similar_factor_scores_within_0_1_points"]] == ["타깃 고객 규모"]
    assert [r["name"] for r in facts["main_differentiating_factors_by_weighted_gap"]] == [
        "대관료 적합도", "브랜드-공간 분위기 일치도"]
    assert facts["top_csr_weight_factors"][0]["score_winner"] == "동점"
    assert "추천을 다시 실행" in facts["available_follow_up"]


def test_equal_top_priority_not_falsely_ranked():
    payload = fixture()
    payload["factor_comparison"][0]["weight"] = .45
    facts = trade_off_llm._facts(payload)
    assert {r["name"] for r in facts["top_csr_weight_factors"]} == {
        "브랜드-공간 분위기 일치도", "타깃 고객 규모"}


def test_missing_price_or_common_data_not_invented():
    payload = fixture()
    payload["spaces"][1]["price_krw"] = None
    payload["spaces"][1]["nearest_station"] = None
    facts = trade_off_llm._facts(payload)
    assert facts["registered_price_gap_krw"] is None
    assert facts["cheaper_space"] is None
    assert facts["same_nearest_station"] is None


def test_known_code_names_in_llm_output_are_replaced():
    sentence = "rental_price_fit과 brand_space_fit을 확인하고 target_ratio를 보세요."
    result = trade_off_llm._replace_factor_codes(sentence)
    assert "대관료 적합도" in result
    assert "브랜드-공간 분위기 일치도" in result
    assert "타깃 고객 규모" in result
    assert not any(k in result for k in FACTOR_LABELS)


def test_openai_fake_request_contains_grounding_and_keeps_scores(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "fake-for-offline-test")
    trade_off_llm._narrative_cache.clear()
    seen = {}

    def respond(**kw):
        seen["messages"] = kw["messages"]
        response = {
            "summary": "적합도 우선이라면 공간 A를, 비용 우선이라면 공간 B를 비교하십시오. rental_price_fit은 비용 지표와 별개입니다.",
            "additional_considerations": "두 공간의 target_ratio가 같고 브랜드 간 차이가 있으니 중요도를 다시 설정해 보십시오.",
        }
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(response)))])

    class FakeClient:
        def __init__(self, **kwargs):
            self.chat = SimpleNamespace(completions=SimpleNamespace(create=respond))

    monkeypatch.setitem(sys.modules, "openai", SimpleNamespace(OpenAI=FakeClient))
    original = fixture()
    output = trade_off_llm.add_llm_explanation(deepcopy(original))
    assert output["summary_source"] == "llm"
    assert output["llm_status"] == "success"
    assert output["factor_comparison"] == original["factor_comparison"]
    assert output["score_comparison"] == original["score_comparison"]
    assert output["spaces"] == original["spaces"]
    assert "rental_price_fit" not in output["summary"]
    assert "target_ratio" not in output["additional_considerations"]
    sent_facts = json.loads(seen["messages"][1]["content"])
    assert sent_facts["registered_price_gap_krw"] == 1_200_000
    assert sent_facts["top_csr_weight_factors"][0]["name"] == "타깃 고객 규모"
    assert "similar_factor_scores_within_0_1_points" in sent_facts
    instructions = seen["messages"][0]["content"]
    assert "공통점과 차이" in instructions
    assert "중요도 차이" in instructions
