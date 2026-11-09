import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from ml.brand.sources import collect_page
from ml.brand.analyzer import BrandAnalyzer


def page(url, text='', images=None, links=None):
    return SimpleNamespace(markdown=text, images=images or [], links=links or [],
                           metadata={'url':url,'status_code':200})


class DynamicFallbackTests(unittest.TestCase):
    def setUp(self):
        host = patch('ml.brand.discovery.is_public_host', return_value=True)
        host.start()
        self.addCleanup(host.stop)

    @patch('ml.brand.sources.is_public_host',return_value=True)
    def test_discovers_same_domain_store_and_requires_return_link(self, host):
        client=Mock()
        client.map.return_value=SimpleNamespace(links=[SimpleNamespace(
            url='https://global.brand.example/',title='Brand Global Store')])
        alternate=page('https://global.brand.example/','해외몰 내용',
                       ['/campaign.jpg'],['https://brand.example/'])
        client.scrape.side_effect=[page('https://brand.example/','Checking your Browser'),alternate]
        result,text,info,warnings=collect_page(client,'https://brand.example/')
        self.assertIs(result,alternate)
        self.assertEqual(text,'해외몰 내용')
        self.assertTrue(info['fallback_used'])
        self.assertEqual(info['fallback_verification'],'same_domain_store_with_return_link')
        self.assertEqual(info['fallback_evidence_url'],'https://global.brand.example/')

    @patch('ml.brand.sources.is_public_host',return_value=True)
    def test_external_domain_not_used_and_missing_backlink_rejected(self, host):
        for candidate in ['https://brand.example.evil.test/','https://global.brand.example/']:
            with self.subTest(candidate=candidate):
                client=Mock();client.map.return_value=SimpleNamespace(links=[SimpleNamespace(url=candidate,title='Global Store')])
                client.scrape.side_effect=[page('https://brand.example/','Checking your Browser'),
                                          page(candidate,'unverified store', ['/image.jpg'])]
                result,text,info,warnings=collect_page(client,'https://brand.example/')
                self.assertIsNone(result)
                self.assertFalse(info['fallback_used'])
                self.assertEqual(text,'')
                self.assertTrue(info['collection_failed'])
                self.assertLessEqual(client.scrape.call_count,2)

    @patch('ml.brand.sources.is_public_host',return_value=True)
    def test_blocked_alternate_records_specific_reason(self, host):
        client=Mock();client.map.return_value=SimpleNamespace(links=[SimpleNamespace(url='https://global.brand.example/',title='Global Store')])
        client.scrape.side_effect=[page('https://brand.example/','Checking your Browser'),
                                  page('https://global.brand.example/','Checking your Browser')]
        result,text,info,warnings=collect_page(client,'https://brand.example/')
        self.assertIsNone(result)
        self.assertIn('보안',info['fallback_failure_reason'])
        self.assertEqual(len(info['fallback_attempts']),1)

    @patch('ml.brand.sources.is_public_host',return_value=True)
    def test_discovery_failure_has_reason_without_leaking_exception(self, host):
        client=Mock();client.scrape.return_value=page('https://brand.example/','Checking your Browser')
        client.map.side_effect=RuntimeError('secret-should-not-leak')
        _,_,info,_=collect_page(client,'https://brand.example/')
        self.assertEqual(info['discovery_failure_reason'],'대체 공식몰 탐색 요청 실패')
        self.assertNotIn('secret',json.dumps(info))

    @patch('ml.brand.analyzer.is_public_host',return_value=True)
    def test_empty_evidence_exposes_structured_error(self, host):
        client=Mock();client.scrape.return_value=page('https://brand.example/','Checking your Browser')
        client.map.return_value=SimpleNamespace(links=[])
        ai=Mock();ai.responses.create.return_value=SimpleNamespace(output_text='',output=[])
        with self.assertRaises(ValueError) as raised:
            BrandAnalyzer(ai,client,Mock()).analyze('https://brand.example/')
        self.assertEqual(raised.exception.code,'BRAND_EVIDENCE_UNAVAILABLE')
        self.assertIn('보안',str(raised.exception))
        self.assertIn('공식',str(raised.exception))
        self.assertEqual(raised.exception.details['image_count'],0)

    def test_api_preserves_reason_and_action(self):
        from fastapi.testclient import TestClient
        from app.main import app
        from ml.brand.errors import BrandAnalysisError
        from ml.brand.tests.test_merged_recommendation import sample_spaces
        analyzer=Mock();analyzer.analyze.side_effect=BrandAnalysisError(
            'BRAND_EVIDENCE_UNAVAILABLE','공식몰·대체몰 모두 보안 확인으로 수집 실패',
            details={'image_count':0})
        payload={'hard_filters':{'max_budget_krw':10000,'start_date':'2026-11-12','end_date':'2026-11-19',
                 'region_ids':['seongsu'],'brand_url':'https://brand.example/'},
                 'soft_filters':{'selected':['brand_space_fit'],'importance_gaps':[]}}
        with patch('app.api.recommendations.load_spaces',return_value=sample_spaces()), \
             patch('app.api.recommendations.filter_spaces_by_period',side_effect=lambda **kw:kw['spaces']), \
             patch('ml.brand.analyzer.get_brand_analyzer',return_value=analyzer):
            response=TestClient(app).post('/recommendations',json=payload)
        self.assertEqual(response.status_code,503)
        detail=response.json()['detail']
        self.assertEqual(detail['code'],'BRAND_EVIDENCE_UNAVAILABLE')
        self.assertIn('보안',detail['message'])
        self.assertIn('다시 시도',detail['action'])

    @patch('ml.brand.discovery.is_public_host',return_value=False)
    def test_private_candidate_not_requested(self, host):
        client=Mock();client.scrape.return_value=page('https://brand.example/','Checking your Browser')
        client.map.return_value=SimpleNamespace(links=[SimpleNamespace(url='https://global.brand.example/',title='Global Store')])
        result,_,info,_=collect_page(client,'https://brand.example/')
        self.assertIsNone(result)
        client.scrape.assert_called_once()
