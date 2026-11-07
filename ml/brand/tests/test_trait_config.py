import json
from pathlib import Path
import unittest


class TraitConfigTests(unittest.TestCase):
    def test_seven_brand_hypotheses_preserve_trait_order(self):
        config = json.loads((Path(__file__).resolve().parents[1] / "trait_config.json").read_text())
        self.assertEqual(list(config["hypotheses"]), [
            "spirited", "trustworthy", "upscale", "stylish",
            "well-organized", "friendly", "sentimental",
        ])
        self.assertTrue(all(text.startswith("이 브랜드는") for text in config["hypotheses"].values()))
        self.assertEqual(config["nli_revision"], "8adb042d524ecd5c26d3e3ba0e3fbcf7e2d0864c")
