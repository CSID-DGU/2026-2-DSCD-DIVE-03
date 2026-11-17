from copy import deepcopy

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.trade_off import router
from app.services.recommendation_store import clear_recommendations, put_recommendation
from app.services.trade_off_service import compare_recommendations


def recommendation():
    return {
        "recommendation_id": "rec_test_tradeoff",
        "weights": {"target_ratio": 0.6, "area_fit": 0.4},
        "recommendations": [
            {
                "space_id": "A", "rank": 1, "name": "공간 A", "address": "서울 A", "final_score": 86.0,
                "price_krw": 1_000_000, "area_pyeong": 50.0, "nearest_station": "A역",
                "factor_scores": {"target_ratio": 90.0, "area_fit": 80.0},
                "contributions": {"target_ratio": 54.0, "area_fit": 32.0},
            },
            {
                "space_id": "B", "rank": 2, "name": "공간 B", "address": "서울 B", "final_score": 80.0,
                "price_krw": 900_000, "area_pyeong": 70.0, "nearest_station": "B역",
                "factor_scores": {"target_ratio": 70.0, "area_fit": 95.0},
                "contributions": {"target_ratio": 42.0, "area_fit": 38.0},
            },
        ],
    }


def test_uses_real_recommendation_scores_and_csr_contributions():
    result = compare_recommendations(recommendation(), ["A", "B"])
    assert result["score_comparison"]["difference"] == 6.0
    assert result["score_comparison"]["leader_space_id"] == "A"
    assert result["factor_comparison"][0]["contribution_difference"] == 12.0
    assert result["factor_comparison"][1]["contribution_difference"] == -6.0
    assert result["factor_comparison"][1]["winner_space_id"] == "B"
    assert result["summary_source"] == "rules"
    assert any("타깃 고객" in item for item in result["strengths"][0]["items"])
    assert any("면적" in item for item in result["weaknesses"][0]["items"])


def test_reversed_order_preserves_score_gap():
    result = compare_recommendations(recommendation(), ["B", "A"])
    assert result["spaces"][0]["space_id"] == "B"
    assert result["score_comparison"]["difference"] == 6.0
    assert result["factor_comparison"][0]["contribution_difference"] == -12.0


def test_unregistered_space_or_bad_contribution_rejected():
    with pytest.raises(ValueError, match="속하지 않는"):
        compare_recommendations(recommendation(), ["A", "random"])
    invalid = deepcopy(recommendation())
    invalid["recommendations"][0]["contributions"]["target_ratio"] = 0
    with pytest.raises(ValueError, match="CSR"):
        compare_recommendations(invalid, ["A", "B"])


def test_api_validates_and_returns_snapshot(monkeypatch):
    # Never call the paid OpenAI API during automated tests.
    monkeypatch.setenv("OPENAI_API_KEY", "")
    clear_recommendations()
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    payload = {"recommendation_id": "rec_test_tradeoff", "space_ids": ["A", "B"]}
    assert client.post("/analyses/trade-off", json=payload).status_code == 404
    put_recommendation(recommendation())
    valid = client.post("/analyses/trade-off", json=payload)
    assert valid.status_code == 200
    assert valid.json()["score_comparison"]["difference"] == 6.0
    assert client.post("/analyses/trade-off", json={**payload, "space_ids": ["A", "A"]}).status_code == 422
    assert client.post("/analyses/trade-off", json={**payload, "space_ids": ["A", "C"]}).status_code == 400
