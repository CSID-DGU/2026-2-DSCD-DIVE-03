import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from ml.brand.analyzer import BrandAnalyzer
from ml.brand.sources import collect_page
from ml.brand.descriptions import description_issues


def page(url,text,images=None):
    return SimpleNamespace(markdown=text,images=images or [],metadata={'url':url,'status_code':200})


class AlternateTextTests(unittest.TestCase):
    @patch('ml.brand.sources.is_public_host',return_value=True)
    @patch('ml.brand.analyzer.is_public_host',return_value=True)
    def test_verified_alternate_text_works_without_images(self, analyzer_host, source_host):
        client=Mock();client.scrape.side_effect=[
            page('https://romand.co.kr/','Checking your Browser'),
            page('https://romandbeauty.com/','브랜드 철학은 자연과 조화로운 디자인입니다. 배송비 $10, 미국에서만 판매.')]
        ai=Mock();ai.responses.create.side_effect=[
            SimpleNamespace(output_text='',output=[]),
            SimpleNamespace(output_text=json.dumps({'final_description':'브랜드는 자연과 조화로운 디자인을 추구합니다.'}))]
        scorer=Mock();scorer.score.return_value=dict.fromkeys(
            ['spirited','trustworthy','upscale','stylish','well-organized','friendly','sentimental'],.5)
        result=BrandAnalyzer(ai,client,scorer).analyze('https://romand.co.kr/')
        self.assertEqual(len(result['image_sources']),0)
        scorer.score.assert_called_once_with('브랜드는 자연과 조화로운 디자인을 추구합니다.')
        final=ai.responses.create.call_args.kwargs
        self.assertIn('브랜드 철학은 자연',final['input'])
        self.assertIn('지역별 판매',final['instructions'])
        self.assertNotIn('미국 공식몰',result['description'])
        self.assertFalse(any('대체 공식몰 이미지 사용' in s for s in result['warnings']))

    def test_regional_sales_and_fallback_notice_excluded_but_brand_philosophy_allowed(self):
        self.assertTrue(description_issues('미국에서만 판매하며 차분한 디자인을 추구합니다.'))
        self.assertTrue(description_issues('해외 공식몰을 사용했으며 국가별 차이가 있을 수 있습니다.'))
        self.assertEqual(description_issues('브랜드는 자연과 조화로운 디자인을 추구합니다.'),[])
