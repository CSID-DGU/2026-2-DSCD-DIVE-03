"""Continue empty alternates and recover vision failures using verified text."""
import json
import tempfile
import unittest
from types import SimpleNamespace as NS
from unittest.mock import Mock, patch
import requests
from PIL import Image
from ml.brand.analyzer import BrandAnalyzer
try:
    from ml.brand.profiles import ProfileStore
except ImportError:
    ProfileStore = None  # Integration assertions run after Issue #33 is present.
from ml.brand.sources import collect_page

KEYS=['spirited','trustworthy','upscale','stylish','well-organized','friendly','sentimental']


def page(url,text='',images=None,links=None):
    return NS(markdown=text,images=images or [],links=links or [],metadata={'url':url,'status_code':200})


def research(text='',official=True):
    return NS(output_text=text,output=[{'type':'web_search_call','action':{'sources':[
        {'url':'https://brand.example/about' if official else 'https://other.example/about'}]}}] if text else [])


def final(text):return NS(output_text=json.dumps({'final_description':text}))


class PartialFallbackTests(unittest.TestCase):
    def setUp(self):
        for target in ['ml.brand.analyzer.is_public_host','ml.brand.sources.is_public_host','ml.brand.discovery.is_public_host']:
            p=patch(target,return_value=True);p.start();self.addCleanup(p.stop)
        p=patch('ml.brand.analyzer.prepare_image',return_value=(Image.new('RGB',(640,400),'navy'),'data:image/jpeg;base64,AA=='))
        p.start();self.addCleanup(p.stop)

    def collect_two(self,first,second):
        client=Mock();client.map.return_value=NS(links=[NS(url='https://global.brand.example/'),NS(url='https://global.brand.example/brand')])
        client.scrape.side_effect=[page('https://brand.example/','Checking your Browser'),first,second]
        return client,collect_page(client,'https://brand.example/')

    def test_empty_first_alternate_continues_to_second_text(self):
        empty=page('https://global.brand.example/',text=' \n',images=['','  '],links=['https://brand.example/'])
        usable=page('https://global.brand.example/brand','차분한 디자인 설명',links=['https://brand.example/'])
        client,(result,text,info,_)=self.collect_two(empty,usable)
        self.assertIs(result,usable)
        self.assertEqual(text,'차분한 디자인 설명')
        self.assertEqual(client.scrape.call_count,3)
        self.assertEqual(len(info['fallback_attempts']),2)
        self.assertIn('텍스트',info['fallback_attempts'][0]['failure_reason'])
        self.assertTrue(info['fallback_used'])
        self.assertFalse(info['collection_failed'])

    def test_empty_first_can_continue_to_image_only_second(self):
        empty=page('https://global.brand.example/',links=['https://brand.example/'])
        usable=page('https://global.brand.example/brand',images=['/campaign.jpg'],links=['https://brand.example/'])
        _,(result,_,info,_)=self.collect_two(empty,usable)
        self.assertIs(result,usable)
        self.assertTrue(info['fallback_used'])

    def test_both_empty_are_not_success_and_candidate_limit_remains_two(self):
        empty=page('https://global.brand.example/',links=['https://brand.example/'])
        second=page('https://global.brand.example/brand',links=['https://brand.example/'])
        client,(result,text,info,_)=self.collect_two(empty,second)
        self.assertIsNone(result)
        self.assertEqual(text,'')
        self.assertFalse(info['fallback_used'])
        self.assertTrue(info['collection_failed'])
        self.assertEqual(client.scrape.call_count,3)
        self.assertEqual(len(info['fallback_attempts']),2)

    def brand(self,ai,homepage='자연과 조화를 이루는 단순한 디자인.',store=None):
        client=Mock();client.scrape.return_value=page('https://brand.example/',homepage,['https://brand.example/campaign.jpg'])
        scorer=Mock();scorer.score.return_value=dict.fromkeys(KEYS,.5)
        return BrandAnalyzer(ai,client,scorer,**({"profile_store": store} if store is not None else {})),scorer

    @unittest.skipIf(ProfileStore is None, "Requires integrated Issue #33 profile storage")
    def test_failed_vision_uses_home_text_without_claiming_image_observation_and_is_reused(self):
        ai=Mock();ai.responses.create.side_effect=[research(),requests.ReadTimeout('private provider details'),
            final('사진에서는 차분한 색감이 관찰됩니다.'),final('자연과 조화를 이루는 단순한 디자인입니다.')]
        with tempfile.TemporaryDirectory() as d:
            brand,scorer=self.brand(ai,store=ProfileStore(d))
            result=brand.analyze('https://brand.example/')
            reused=brand.analyze('https://brand.example/')
        self.assertEqual(result['description'],'자연과 조화를 이루는 단순한 디자인입니다.')
        self.assertEqual(result['image_analysis']['status'],'failed')
        self.assertEqual(result['image_analysis']['used_count'],0)
        self.assertEqual(result['image_analysis']['collected_count'],1)
        self.assertEqual(len(result['image_sources']),1)
        self.assertTrue(result['description_validation']['regenerated'])
        self.assertNotIn('private provider details',json.dumps(result))
        self.assertEqual(result['profile_id'],reused['profile_id'])
        self.assertTrue(reused['profile_cache_hit'])
        self.assertEqual(ai.responses.create.call_count,4)
        scorer.score.assert_called_once()

    def test_failed_vision_can_use_verified_search_text(self):
        ai=Mock();ai.responses.create.side_effect=[research('自然との調和を重視したデザイン。'),RuntimeError('vision failure'),final('자연과 조화를 이루는 디자인을 추구합니다.')]
        brand,scorer=self.brand(ai,homepage='')
        result=brand.analyze('https://brand.example/')
        self.assertFalse(result['research_rejected'])
        self.assertEqual(result['image_analysis']['used_count'],0)
        scorer.score.assert_called_once()

    @unittest.skipIf(ProfileStore is None, "Requires integrated Issue #33 profile storage")
    def test_failed_vision_does_not_use_unverified_search_or_save_failure(self):
        ai=Mock();ai.responses.create.side_effect=[research('믿을 수 없는 검색 요약',official=False),requests.ReadTimeout('vision failure')]
        from pathlib import Path
        with tempfile.TemporaryDirectory() as d:
            brand,scorer=self.brand(ai,homepage='',store=ProfileStore(d))
            with self.assertRaises(requests.ReadTimeout):brand.analyze('https://brand.example/')
            self.assertFalse(list(Path(d).glob('*.json')))
        scorer.score.assert_not_called()
        self.assertEqual(ai.responses.create.call_count,2)

    def test_successful_vision_remains_image_evidence(self):
        ai=Mock();ai.responses.create.side_effect=[research(),NS(output_text='실제 관찰한 차분한 색감'),final('이미지에서는 차분한 색감이 나타납니다.')]
        brand,scorer=self.brand(ai,homepage='')
        result=brand.analyze('https://brand.example/')
        self.assertEqual(result['image_analysis']['status'],'succeeded')
        self.assertEqual(result['image_analysis']['used_count'],1)
        scorer.score.assert_called_once()
