"""Regression cases from the final brand collection review."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from ml.brand.sources import collect_page
from ml.brand.analyzer import BrandAnalyzer


def page(url, status=200, text='공식 내용', images=None, camel=False):
    return SimpleNamespace(markdown=text, images=images or [], metadata={
        'url': url, 'statusCode' if camel else 'status_code': status,
    })


class PageValidationTests(unittest.TestCase):
    def test_foreign_final_domain_is_not_brand_evidence(self):
        client = Mock()
        client.scrape.return_value = page('https://unrelated.example/', text='다른 회사 문구')
        result, text, info, warnings = collect_page(client, 'https://brand.example/')
        self.assertIsNone(result)
        self.assertEqual(text, '')
        self.assertTrue(info['collection_failed'])

    def test_error_status_pages_are_discarded(self):
        for status in (404, 500, 502):
            for camel in (False, True):
                with self.subTest(status=status, camel=camel):
                    client = Mock()
                    client.scrape.return_value = page('https://brand.example/', status, 'ERROR PAGE', camel=camel)
                    result, text, info, warnings = collect_page(client, 'https://brand.example/')
                    self.assertIsNone(result)
                    self.assertEqual(text, '')
                    self.assertTrue(info['collection_failed'])

    def test_same_domain_final_url_is_image_base(self):
        client = Mock()
        client.scrape.return_value = page('https://www.brand.example/kr/main/', images=['banner.jpg'])
        result, text, info, warnings = collect_page(client, 'https://brand.example/')
        self.assertIsNotNone(result)
        self.assertEqual(info['image_page_url'], 'https://www.brand.example/kr/main/')

    def test_invalid_final_urls_are_discarded(self):
        for url in ['https://brand.example.evil.test/', 'https://notbrand.example/',
                    'file://brand.example/file', 'https://@brand.example/', 'https://[invalid']:
            with self.subTest(url=url):
                client = Mock(); client.scrape.return_value = page(url)
                result, text, info, warnings = collect_page(client, 'https://brand.example/')
                self.assertIsNone(result)
                self.assertEqual(text, '')

    @patch('ml.brand.sources.is_public_host', return_value=True)
    def test_alternate_final_domain_is_also_validated(self, host):
        client = Mock()
        client.scrape.side_effect = [page('https://romand.co.kr/', 403),
                                     page('https://unrelated.example/', text='외부 내용')]
        result, text, info, warnings = collect_page(client, 'https://romand.co.kr/')
        self.assertIsNone(result)
        self.assertEqual(text, '')
        self.assertFalse(info['fallback_used'])
        self.assertTrue(info['collection_failed'])

    @patch('ml.brand.sources.is_public_host', return_value=True)
    def test_alternate_error_page_is_discarded(self, host):
        client = Mock()
        client.scrape.side_effect = [page('https://romand.co.kr/', 403),
                                     page('https://romandbeauty.com/', 500)]
        result, text, info, warnings = collect_page(client, 'https://romand.co.kr/')
        self.assertIsNone(result)
        self.assertEqual(text, '')

    @patch('ml.brand.sources.is_public_host', return_value=True)
    def test_valid_alternate_preserves_final_path(self, host):
        client = Mock()
        client.scrape.side_effect = [page('https://romand.co.kr/', 403),
                                     page('https://romandbeauty.com/pages/campaign/', images=['photo.jpg'])]
        result, text, info, warnings = collect_page(client, 'https://romand.co.kr/')
        self.assertIsNotNone(result)
        self.assertEqual(text, '공식 내용')
        self.assertEqual(info['image_page_url'], 'https://romandbeauty.com/pages/campaign/')
        self.assertTrue(info['fallback_used'])
        self.assertFalse(info['collection_failed'])

    @patch('ml.brand.analyzer.is_public_host', return_value=True)
    def test_no_valid_evidence_stops_before_final_description_and_nli(self, host):
        ai = Mock()
        ai.responses.create.side_effect = [SimpleNamespace(output_text='', output=[]),
                                          SimpleNamespace(output_text=json.dumps({'final_description':'作成された説明'}))]
        client = Mock(); client.scrape.return_value = page('https://brand.example/', 404, 'NOT FOUND')
        scorer = Mock()
        with self.assertRaises(ValueError):
            BrandAnalyzer(ai, client, scorer).analyze('https://brand.example/')
        ai.responses.create.assert_called_once()
        scorer.score.assert_not_called()

    @patch('ml.brand.analyzer.is_public_host', return_value=True)
    @patch('ml.brand.analyzer.prepare_image', return_value=(None, 'data:image/jpeg;base64,AA=='))
    def test_resolved_relative_image_reaches_vision(self, image, host):
        ai = Mock(); ai.responses.create.side_effect = [
            SimpleNamespace(output_text='', output=[]), SimpleNamespace(output_text='画像の観察'),
            SimpleNamespace(output_text=json.dumps({'final_description':'暖かい色のブランド。'}))]
        client = Mock(); client.scrape.return_value = page('https://brand.example/kr/main/', images=['banner.jpg'])
        scorer = Mock(); scorer.score.return_value = dict.fromkeys(
            ['spirited','trustworthy','upscale','stylish','well-organized','friendly','sentimental'], .5)
        result = BrandAnalyzer(ai, client, scorer).analyze('https://brand.example/')
        image.assert_called_once_with('https://brand.example/kr/main/banner.jpg')
        self.assertEqual(result['image_sources'], ['https://brand.example/kr/main/banner.jpg'])

    @patch('ml.brand.sources.is_public_host', return_value=True)
    def test_direct_redirect_to_verified_alternate_includes_text(self, host):
        client = Mock()
        client.scrape.return_value = page('https://romandbeauty.com/pages/new/', text='미국몰 텍스트')
        result, text, info, warnings = collect_page(client, 'https://romand.co.kr/')
        self.assertIsNotNone(result)
        self.assertEqual(text, '미국몰 텍스트')
        self.assertTrue(info['fallback_used'])
        self.assertEqual(info['image_page_url'], 'https://romandbeauty.com/pages/new/')
        client.scrape.assert_called_once()

    @patch('ml.brand.sources.is_public_host', return_value=True)
    def test_failed_original_can_use_valid_registered_alternate(self, host):
        client = Mock()
        client.scrape.side_effect = [page('https://romand.co.kr/', 404, 'NOT FOUND'),
                                     page('https://romandbeauty.com/', images=['photo.jpg'])]
        result, text, info, warnings = collect_page(client, 'https://romand.co.kr/')
        self.assertIsNotNone(result)
        self.assertEqual(text, '공식 내용')
        self.assertTrue(info['fallback_used'])
        self.assertFalse(info['collection_failed'])
        self.assertEqual(info['original_failure_reason'], 'HTTP 404')
