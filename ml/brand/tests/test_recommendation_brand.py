"""Exercise the actual recommendation route using a prepared brand profile."""

import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "backend"))
from app.main import app


class RecommendationBrandTests(unittest.TestCase):
    def test_brand_scores_reach_api_with_space_ids(self):
        keys = ("spirited", "trustworthy", "upscale", "stylish",
                "well-organized", "friendly", "sentimental")
        brand = dict.fromkeys(keys, 0)
        frame = pd.DataFrame([
            {"seq": str(i), "trait_scores": json.dumps(dict.fromkeys(keys, value)),
             "price": 1000, "area_pyeong": 30, "name": "공간", "address": "서울",
             "latitude": 37.5, "longitude": 127., "region_group": "성수",
             "photos": "", "availability_status": "assumed_available"}
            for i, value in enumerate((0, .5, 1))
        ])
        analyzer = Mock()
        analyzer.analyze.return_value = {"trait_scores": brand}
        with (
            patch("app.api.recommendations.load_spaces", return_value=frame),
            patch("app.api.recommendations.filter_spaces_by_period", side_effect=lambda **kw: kw["spaces"]),
            patch("ml.brand.analyzer.get_brand_analyzer", return_value=analyzer),
        ):
            response = TestClient(app).post("/recommendations", json={
                "hard_filters": {"max_budget_krw": 10000, "start_date": "2026-11-10",
                                 "end_date": "2026-11-11", "region_ids": ["seongsu"],
                                 "brand_url": "https://romand.co.kr/"},
                "soft_filters": {"selected": ["brand_space_fit"],
                                 "weights": {"brand_space_fit": 100}},
            })
        self.assertEqual(response.status_code, 200, response.text)
        rows = response.json()["recommendations"]
        self.assertEqual([r["space_id"] for r in rows], ["0", "1", "2"])
        self.assertEqual([r["final_score"] for r in rows], [100, 50, 0])
