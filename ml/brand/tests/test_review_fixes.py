"""Regression cases from the November 9 review (R1-R5)."""
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch
import requests
from fastapi.testclient import TestClient
from app.main import app
from ml.brand import analyzer
from ml.brand.analyzer import BrandAnalyzer
from ml.brand.descriptions import build_description, description_issues
try:
    from ml.brand.profiles import ProfileStore
except ImportError:
    ProfileStore = None  # Integration assertions run after Issue #33 is present.
from ml.brand.sources import collect_page
from ml.brand.tests.test_merged_recommendation import sample_spaces, KEYS


def payload(url):
    return {'hard_filters':{'max_budget_krw':10000,'start_date':'2026-11-12','end_date':'2026-11-19',
            'region_ids':['seongsu'],'brand_url':url},
            'soft_filters':{'selected':['brand_space_fit'],'importance_gaps':[]}}


def call_api(url, brand):
    with patch('app.api.recommendations.load_spaces',return_value=sample_spaces()), \
         patch('app.api.recommendations.filter_spaces_by_period',side_effect=lambda **kw:kw['spaces']), \
         patch('ml.brand.analyzer.get_brand_analyzer',return_value=brand) as factory:
        response=TestClient(app).post('/recommendations',json=payload(url))
    return response,factory


def page(url,text='디자인 설명',links=None):
    return SimpleNamespace(markdown=text,images=[],links=links or [],metadata={'url':url,'status_code':200})


class ReviewFixTests(unittest.TestCase):
    def test_firecrawl_factory_sets_real_http_timeout_and_single_attempt(self):
        from firecrawl import Firecrawl
        getattr(analyzer, '_create_brand_analyzer', analyzer.get_brand_analyzer).cache_clear()
        try:
            with patch.dict(os.environ,{'OPENAI_API_KEY':'test-unused','FIRECRAWL_API_KEY':'test-unused'}), \
                 patch('firecrawl.Firecrawl',wraps=Firecrawl),patch('openai.OpenAI'),patch('ml.brand.nli.TraitScorer'):
                brand=analyzer.get_brand_analyzer()
            response=Mock(ok=True);response.json.return_value={'success':True,'links':[]}
            with patch('firecrawl.v2.utils.http_client.requests.post',return_value=response) as post:
                brand.firecrawl.map('https://brand.example/',timeout=15000)
            self.assertEqual(post.call_args.kwargs['timeout'],40)
            self.assertEqual(post.call_args.kwargs['json']['timeout'],15000)
            with patch('firecrawl.v2.utils.http_client.requests.post',side_effect=requests.ReadTimeout('stalled')) as post:
                with self.assertRaises(requests.Timeout):brand.firecrawl.map('https://brand.example/')
            self.assertEqual(post.call_count,1)
        finally:getattr(analyzer, '_create_brand_analyzer', analyzer.get_brand_analyzer).cache_clear()

    @unittest.skipIf(ProfileStore is None, "Requires integrated Issue #33 profile storage")
    def test_timeout_does_not_save_profile_and_releases_lock(self):
        with tempfile.TemporaryDirectory() as d:
            store=ProfileStore(d)
            with self.assertRaises(requests.ReadTimeout):
                store.get('https://brand.example/','v1',Mock(side_effect=requests.ReadTimeout()))
            self.assertFalse(list(Path(d).glob('*.json')))
            result=store.get('https://brand.example/','v1',lambda:{'description':'단순한 디자인.','trait_scores':dict.fromkeys(KEYS,.5)})
            self.assertFalse(result['profile_cache_hit'])

    def test_timeout_has_specific_api_reason(self):
        brand=Mock();brand.analyze.side_effect=requests.ReadTimeout('secret-provider-detail')
        response,_=call_api('https://brand.example/',brand)
        self.assertEqual(response.status_code,503)
        self.assertEqual(response.json()['detail']['code'],'BRAND_COLLECTION_TIMEOUT')
        self.assertIn('시간',response.json()['detail']['message'])
        self.assertNotIn('secret',response.text)

    def test_notice_variants_regenerate_and_normal_design_is_allowed(self):
        bad=['국가마다 제품 구성이 다를 수 있습니다.',
             '한국 공식몰 대신 영문 스토어 자료를 사용했습니다.',
             '해외몰 정보를 참고해 작성한 분석입니다.',
             '나라에 따라 상품 구성에 차이가 있습니다.',
             '국내 구성과 다를 수 있습니다.',
             '국내와 캠페인·상품 구성이 다를 수 있습니다.',
             '한국과 일본에서 판매되는 브랜드입니다.']
        good='브랜드는 자연과 조화를 이루는 미적 철학과 국제적인 세련됨을 표현합니다.'
        self.assertEqual(description_issues(good),[])
        task={'official_research':'공식 디자인 설명','homepage_text':'브랜드 소개','visual_observations':''}
        for notice in bad:
            with self.subTest(notice=notice):
                client=Mock();client.responses.create.side_effect=[
                    SimpleNamespace(output_text=json.dumps({'final_description':notice})),
                    SimpleNamespace(output_text=json.dumps({'final_description':good}))]
                description,validation=build_description(client,'test','',task,0)
                self.assertEqual(description,good)
                self.assertTrue(validation['regenerated'])
        client=Mock();client.responses.create.return_value=SimpleNamespace(output_text=json.dumps({'final_description':bad[0]}))
        with self.assertRaises(ValueError):build_description(client,'test','',task,0)
        self.assertEqual(client.responses.create.call_count,2)

    def test_invalid_urls_are_400_before_model_initialization(self):
        for url in ['not-a-url','file:///etc/passwd','https://user:pass@brand.example/','https://brand.example:bad/']:
            with self.subTest(url=url):
                response,factory=call_api(url,Mock())
                self.assertEqual(response.status_code,400,response.text)
                factory.assert_not_called()

    @patch('ml.brand.analyzer.is_public_host',return_value=False)
    def test_private_host_validation_is_400(self, host):
        response,_=call_api('http://127.0.0.1/',BrandAnalyzer(None,None,None))
        self.assertEqual(response.status_code,400,response.text)

    def test_configuration_failure_remains_503(self):
        with patch('app.api.recommendations.load_spaces',return_value=sample_spaces()), \
             patch('app.api.recommendations.filter_spaces_by_period',side_effect=lambda **kw:kw['spaces']), \
             patch('ml.brand.analyzer.get_brand_analyzer',side_effect=ValueError('API 설정 누락')):
            response=TestClient(app).post('/recommendations',json=payload('https://brand.example/'))
        self.assertEqual(response.status_code,503)

    @patch('ml.brand.discovery.is_public_host',return_value=True)
    def test_dynamic_final_url_constraints(self, discovery_host):
        cases=[('http://global.brand.example/',True),('https://global.brand.example:444/',True),
               ('https://global.brand.example/',False),('https://other.example/',True),
               ('https://user@global.brand.example/',True)]
        for url,public in cases:
            with self.subTest(url=url,public=public),patch('ml.brand.sources.is_public_host',return_value=public):
                client=Mock();client.map.return_value=SimpleNamespace(links=[SimpleNamespace(url='https://global.brand.example/')])
                client.scrape.side_effect=[page('https://brand.example/','Checking your Browser'),
                                          page(url,links=['https://brand.example/'])]
                result,text,info,_=collect_page(client,'https://brand.example/')
                self.assertIsNone(result)
                self.assertEqual(text,'')
                self.assertFalse(info['fallback_used'])

    @patch('ml.brand.sources.is_public_host',return_value=True)
    def test_registered_alternate_cannot_downgrade_to_http(self, host):
        client=Mock();client.scrape.side_effect=[page('https://romand.co.kr/','Checking your Browser'),
                                              page('http://romandbeauty.com/')]
        result,_,info,_=collect_page(client,'https://romand.co.kr/')
        self.assertIsNone(result)
        self.assertFalse(info['fallback_used'])


    @patch('ml.brand.sources.is_public_host',return_value=True)
    def test_direct_registered_redirect_rejects_insecure_final_url(self, host):
        client=Mock();client.scrape.return_value=page('http://romandbeauty.com/')
        result,text,info,_=collect_page(client,'https://romand.co.kr/')
        self.assertIsNone(result)
        self.assertEqual(text,'')
        self.assertFalse(info['fallback_used'])

    def test_original_http_official_site_still_works(self):
        client=Mock();original=page('http://brand.example/','브랜드 디자인 설명')
        client.scrape.return_value=original
        result,text,_,_=collect_page(client,'http://brand.example/')
        self.assertIs(result,original)
        self.assertEqual(text,'브랜드 디자인 설명')

    @patch('ml.brand.sources.is_public_host',return_value=True)
    def test_discovery_timeout_is_reported_without_sdk_details(self, host):
        client=Mock();client.scrape.return_value=page('https://brand.example/','Checking your Browser')
        client.map.side_effect=requests.ReadTimeout('private SDK details')
        _,_,info,_=collect_page(client,'https://brand.example/')
        self.assertIn('시간',info['discovery_failure_reason'])
        self.assertNotIn('private',json.dumps(info))
