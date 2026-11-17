from app.services.recommendation_store import (
    clear_recommendations,
    get_recommendation,
    put_recommendation,
)


def sample():
    return {
        "recommendation_id": "rec_test",
        "weights": {"target_ratio": 0.6, "area_fit": 0.4},
        "recommendations": [{"space_id": "A", "final_score": 86.0}],
        "brand_analysis": {"description": "Must not be persisted"},
    }


def test_save_and_get_snapshot_without_brand_analysis():
    clear_recommendations()
    result = sample()
    put_recommendation(result)
    result["recommendations"][0]["final_score"] = 0
    saved = get_recommendation("rec_test")
    assert saved["recommendations"][0]["final_score"] == 86.0
    assert "brand_analysis" not in saved
    saved["weights"]["target_ratio"] = 0
    assert get_recommendation("rec_test")["weights"]["target_ratio"] == 0.6


def test_unknown_snapshot():
    clear_recommendations()
    assert get_recommendation("missing") is None
