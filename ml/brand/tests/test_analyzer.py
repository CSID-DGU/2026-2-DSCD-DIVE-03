import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from ml.brand.analyzer import BrandAnalyzer


KEYS = (
    "spirited", "trustworthy", "upscale", "stylish",
    "well-organized", "friendly", "sentimental",
)


class BrandTests(unittest.TestCase):
    def setUp(self):
        self.openai = Mock()
        self.firecrawl = Mock()
        self.scorer = Mock()
        self.scorer.score.return_value = dict.fromkeys(KEYS, .5)
        self.firecrawl.scrape.return_value = SimpleNamespace(
            markdown="공식 브랜드 소개", images=["https://brand.example/photo.jpg"]
        )
        self.openai.responses.create.side_effect = [
            SimpleNamespace(output_text="공식 조사", output=[{"type": "web_search_call", "action": {"sources": [{"url": "https://brand.example/about"}]}}]),
            SimpleNamespace(output_text="따뜻한 색감"),
            SimpleNamespace(output_text=json.dumps({"final_description": "차분하고 부드러운 분위기."})),
        ]
        self.analyzer = BrandAnalyzer(self.openai, self.firecrawl, self.scorer)

    @patch("ml.brand.analyzer.is_public_host", return_value=True)
    @patch("ml.brand.analyzer.prepare_image", return_value=(None, "data:image/jpeg;base64,AA=="))
    def test_zip_flow_returns_named_nli_traits(self, image, host):
        result = self.analyzer.analyze("https://brand.example")
        self.assertEqual(result["trait_scores"], dict.fromkeys(KEYS, .5))
        self.assertEqual(result["research_sources"], ["https://brand.example/about"])
        self.scorer.score.assert_called_once_with("차분하고 부드러운 분위기.")
        self.assertEqual(len(result["image_sources"]), 1)
        self.assertIn("JSON", self.openai.responses.create.call_args.kwargs["input"])

    @patch("ml.brand.analyzer.is_public_host", return_value=True)
    def test_text_only_page_has_explicit_warning(self, host):
        self.firecrawl.scrape.return_value.images = []
        self.openai.responses.create.side_effect = [
            SimpleNamespace(output_text="공식 조사", output=[]),
            SimpleNamespace(output_text=json.dumps({"final_description": "차분한 색감."})),
        ]
        result = self.analyzer.analyze("https://brand.example")
        self.assertTrue(result["warnings"])
        self.assertEqual(self.openai.responses.create.call_count, 2)

    @patch("ml.brand.analyzer.is_public_host", return_value=True)
    def test_nullable_search_sources(self, host):
        self.firecrawl.scrape.return_value.images = []
        self.openai.responses.create.side_effect = [
            SimpleNamespace(output_text="공식 조사", output=[
                {"type": "web_search_call", "action": {"sources": None}, "content": None},
                {"type": "message", "content": [{"annotations": [
                    {"url": "https://brand.example/about"}
                ]}]},
            ]),
            SimpleNamespace(output_text=json.dumps({"final_description": "차분한 색감."})),
        ]
        result = self.analyzer.analyze("https://brand.example")
        self.assertEqual(result["research_sources"], ["https://brand.example/about"])

    @patch("ml.brand.analyzer.is_public_host", return_value=False)
    def test_private_url_is_rejected_before_external_calls(self, host):
        with self.assertRaises(ValueError):
            self.analyzer.analyze("http://127.0.0.1")
        self.openai.responses.create.assert_not_called()

    @patch("ml.brand.analyzer.is_public_host", return_value=True)
    def test_invalid_nli_profile_is_rejected(self, host):
        self.firecrawl.scrape.return_value.images = []
        self.openai.responses.create.side_effect = [
            SimpleNamespace(output_text="공식 조사", output=[]),
            SimpleNamespace(output_text=json.dumps({"final_description": "차분한 색감."})),
        ]
        self.scorer.score.return_value = {"spirited": 2}
        with self.assertRaises(ValueError):
            self.analyzer.analyze("https://brand.example")


if __name__ == "__main__":
    unittest.main()
