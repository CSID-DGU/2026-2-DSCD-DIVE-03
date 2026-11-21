
from app.services.recommendation_store import (
    clear_recommendations,
    get_recommendation,
    put_recommendation,
)


def sample():
    return {
        "recommendation_id": "rec_test",
        "weights": {
            "target_ratio": 0.6,
            "area_fit": 0.4,
        },
        "recommendations": [
            {
                "space_id": "A",
                "final_score": 86.0,
            }
        ],
        "brand_analysis": {
            "description": "Sample brand profile",
        },
    }


def test_save_and_get_snapshot_preserves_data():
    clear_recommendations()

    result = sample()
    put_recommendation(result)

    # 원본 데이터를 수정해도 저장된 값은 유지되어야 함
    result["recommendations"][0]["final_score"] = 0
    result["brand_analysis"]["description"] = "Changed"

    saved = get_recommendation("rec_test")

    assert saved["recommendations"][0]["final_score"] == 86.0

    # 현재 저장 구조는 브랜드 분석 결과도 보존함
    assert saved["brand_analysis"] == {
        "description": "Sample brand profile"
    }

    # 조회 결과를 수정해도 저장된 원본은 유지되어야 함
    saved["weights"]["target_ratio"] = 0

    assert (
        get_recommendation("rec_test")["weights"]["target_ratio"]
        == 0.6
    )


def test_unknown_snapshot():
    clear_recommendations()

    assert get_recommendation("missing") is None
