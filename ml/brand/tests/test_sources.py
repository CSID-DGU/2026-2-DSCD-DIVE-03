import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from ml.brand.sources import collect_page, blocked_reason
from ml.brand.analyzer import BrandAnalyzer


def page(markdown='', images=None, metadata=None):
    return SimpleNamespace(markdown=markdown, images=images or [], metadata=metadata or {})


class SourceTests(unittest.TestCase):
    def test_status_200_challenge_is_detected(self):
        self.assertIsNotNone(blocked_reason(page(metadata={
            'status_code': 200, 'url': 'https://veritas-hub.cafe24.com/challenge?auth=redacted'})))
        self.assertIsNotNone(blocked_reason(page('Checking your Browser…')))
        self.assertIsNone(blocked_reason(page('공식 브랜드 소개')))

    @patch('ml.brand.sources.is_public_host', return_value=True)
    def test_blocked_romand_uses_verified_alternate_and_discards_challenge(self, host):
        client = Mock()
        alternate = page('미국 공식몰 설명', ['/campaign.jpg'])
        client.scrape.side_effect = [page('Checking your Browser…', ['/cafe24.svg']), alternate]
        result, text, info, warnings = collect_page(client, 'https://romand.co.kr/')
        self.assertIs(result, alternate)
        self.assertEqual(text, '미국 공식몰 설명')
        self.assertTrue(info['fallback_used'])
        self.assertEqual(info['image_page_url'], 'https://romandbeauty.com/')
        self.assertEqual(info['fallback_evidence_url'], 'https://linktr.ee/romandyou')

    def test_unregistered_brand_does_not_invent_alternate(self):
        client = Mock()
        client.scrape.return_value = page(metadata={'status_code': 403})
        result, text, info, warnings = collect_page(client, 'https://unregistered.example/')
        self.assertIsNone(result)
        self.assertEqual(text, '')
        client.scrape.assert_called_once()

    @patch('ml.brand.sources.is_public_host', return_value=True)
    def test_failed_alternate_keeps_text_only_mode(self, host):
        client = Mock()
        client.scrape.side_effect = [page('Checking your Browser…'), RuntimeError('failure')]
        result, text, info, warnings = collect_page(client, 'https://romand.co.kr/')
        self.assertIsNone(result)
        self.assertFalse(info['fallback_used'])
        self.assertTrue(warnings)

    def test_valid_empty_page_does_not_trigger_alternate(self):
        client = Mock()
        original = page('공식 브랜드 소개')
        client.scrape.return_value = original
        result, text, info, warnings = collect_page(client, 'https://romand.co.kr/')
        self.assertIs(result, original)
        self.assertFalse(info['fallback_used'])
        client.scrape.assert_called_once()

    @patch('ml.brand.analyzer.is_public_host', return_value=True)
    @patch('ml.brand.sources.is_public_host', return_value=True)
    @patch('ml.brand.analyzer.prepare_image', return_value=(None, 'data:image/jpeg;base64,AA=='))
    def test_alternate_image_and_provenance_reach_analysis(self, image, source_host, host):
        client = Mock()
        client.scrape.side_effect = [page('Checking your Browser…'), page('alternate', ['/campaign.jpg'])]
        ai = Mock()
        ai.responses.create.side_effect = [
            SimpleNamespace(output_text='공식 검색', output=[]),
            SimpleNamespace(output_text='분홍색 배경과 밝은 색감'),
            SimpleNamespace(output_text=json.dumps({'final_description': '이미지에서는 밝은 색감이 나타납니다.'})),
        ]
        scorer = Mock()
        scorer.score.return_value = dict.fromkeys(
            ['spirited', 'trustworthy', 'upscale', 'stylish', 'well-organized', 'friendly', 'sentimental'], .5)
        result = BrandAnalyzer(ai, client, scorer).analyze('https://romand.co.kr/')
        image.assert_called_once_with('https://romandbeauty.com/campaign.jpg')
        self.assertTrue(result['image_collection']['fallback_used'])
        self.assertEqual(result['image_sources'], ['https://romandbeauty.com/campaign.jpg'])
        final_input = ai.responses.create.call_args.kwargs['input']
        self.assertNotIn('Checking your Browser', final_input)
        self.assertIn('alternate', final_input)
        research_call = ai.responses.create.call_args_list[0].kwargs
        self.assertEqual(result['research_domains'], ['romand.co.kr', 'romandbeauty.com'])
        self.assertTrue(result['research_rejected'])
        self.assertEqual(result['research_summary'], '')
        self.assertIn('site:romandbeauty.com', research_call['input'])
        self.assertIn('rom&nd (롬앤)', research_call['input'])


class ResearchSourceTests(unittest.TestCase):
    @patch('ml.brand.analyzer.is_public_host', return_value=True)
    def test_only_official_supported_research_reaches_final_description(self, host):
        for url, rejected in [('https://romandbeauty.com/pages/about-us', False),
                              ('https://unrelated.example/romeo', True)]:
            with self.subTest(url=url):
                ai = Mock()
                ai.responses.create.side_effect = [
                    SimpleNamespace(output_text='수집한 검색 내용', output=[{
                        'type': 'web_search_call', 'action': {'sources': [{'url': url}]}}]),
                    SimpleNamespace(output_text=json.dumps({'final_description': '밝은 색감.'})),
                ]
                client = Mock()
                client.scrape.return_value = page('공식 홈페이지 텍스트')
                scorer = Mock()
                scorer.score.return_value = dict.fromkeys(
                    ['spirited', 'trustworthy', 'upscale', 'stylish', 'well-organized', 'friendly', 'sentimental'], .5)
                result = BrandAnalyzer(ai, client, scorer).analyze('https://romand.co.kr/')
                self.assertEqual(result['research_rejected'], rejected)
                self.assertEqual(result['research_summary'], '' if rejected else '수집한 검색 내용')
                final_payload = json.loads(ai.responses.create.call_args.kwargs['input'].split('\n', 1)[1])
                self.assertEqual(final_payload['official_research'], result['research_summary'])


class AllBrandResearchTests(unittest.TestCase):
    @patch('ml.brand.analyzer.is_public_host', return_value=True)
    def test_unregistered_brand_validates_every_research_source(self, host):
        cases = [
            (['https://www.muji.com/jp/about'], False),
            (['https://muji.com/jp/about', 'https://shop.muji.com/item'], False),
            (['https://muji.com/jp/about', 'https://other.example/story'], True),
            (['https://muji.com.evil.example/about'], True),
            (['https://notmuji.com/about'], True),
            (['https://muji.com@evil.example/about'], True),
            (['file://muji.com/brand.txt'], True),
            (['https://[invalid'], True),
            (['https://@muji.com/about'], True),
            ([], True),
        ]
        for sources, rejected in cases:
            with self.subTest(sources=sources):
                ai = Mock()
                ai.responses.create.side_effect = [
                    SimpleNamespace(output_text='検索からの説明', output=[{
                        'type': 'web_search_call', 'action': {'sources': [{'url': u} for u in sources]}}]),
                    SimpleNamespace(output_text=json.dumps({'final_description': '自然な色合いのブランド。'})),
                ]
                client = Mock()
                client.scrape.return_value = page('公式サイトの説明')
                scorer = Mock()
                scorer.score.return_value = dict.fromkeys(
                    ['spirited', 'trustworthy', 'upscale', 'stylish', 'well-organized', 'friendly', 'sentimental'], .5)
                result = BrandAnalyzer(ai, client, scorer).analyze('https://www.muji.com/jp/ja/store')
                self.assertEqual(result['research_domains'], ['muji.com'])
                self.assertEqual(result['research_rejected'], rejected)
                self.assertEqual(result['research_summary'], '' if rejected else '検索からの説明')
                self.assertEqual(result['research_sources'], [] if rejected else sources)
                final_payload = json.loads(ai.responses.create.call_args.kwargs['input'].split('\n', 1)[1])
                self.assertEqual(final_payload['official_research'], result['research_summary'])
