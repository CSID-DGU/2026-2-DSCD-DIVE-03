"""Keep team popup/CSR changes and brand inference working together."""
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import pandas as pd
from fastapi.testclient import TestClient
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'backend'))
from app.main import app


KEYS = ['spirited','trustworthy','upscale','stylish','well-organized','friendly','sentimental']
FACTORS = ['area_fit','subway_accessibility','rental_price_fit','target_ratio','popup_history','brand_space_fit']


def sample_spaces():
    return pd.DataFrame([
        {'seq':str(i),'name':'공간 '+str(i),'price':price,'area_pyeong':area,
         'station_distance_m':distance,'female_20s_ratio':ratio,
         'trait_scores':json.dumps(dict.fromkeys(KEYS, trait)),
         'region_group':'성수','ADSTRD_NM':'동'+str(i),'address':'서울',
         'latitude':37.5,'longitude':127.,'photos':'','availability_status':'assumed_available'}
        for i,(price,area,distance,ratio,trait) in enumerate([
            (1000,40,100,.1,0),(3000,50,500,.2,.5),(5000,80,900,.3,1)])
    ])


def history_rows():
    return pd.DataFrame([
        {'category':'beauty','open_date':pd.Timestamp('2020-01-01'),
         'mapped_region_group':'성수','mapped_ADSTRD_NM':'동'+str(i)}
        for i,count in [(0,0),(1,2),(2,4)] for _ in range(count)
    ])


class MergedRecommendationTests(unittest.TestCase):
    def request(self, selected, gaps):
        analyzer=Mock(); analyzer.analyze.return_value={'trait_scores':dict.fromkeys(KEYS,0)}
        payload={'hard_filters':{'max_budget_krw':10000,'start_date':'2026-11-10','end_date':'2026-11-10',
                 'region_ids':['seongsu'],'brand_url':'https://brand.example/',
                 'area_min_pyeong':40,'area_max_pyeong':60,'target_customers':['female_20s'],'category_id':'beauty'},
                 'soft_filters':{'selected':selected,'importance_gaps':gaps}}
        with patch('app.api.recommendations.load_spaces',return_value=sample_spaces()), \
             patch('app.api.recommendations.filter_spaces_by_period',side_effect=lambda **kw:kw['spaces']), \
             patch('app.services.popup_history_service.load_popup_history',return_value=history_rows()), \
             patch('ml.brand.analyzer.get_brand_analyzer',return_value=analyzer):
            return TestClient(app).post('/recommendations',json=payload)

    def test_six_factors_preserve_popup_and_brand_and_equal_csr(self):
        response=self.request(FACTORS,[0]*5)
        self.assertEqual(response.status_code,200,response.text)
        body=response.json()
        self.assertEqual(set(body['weights']),set(FACTORS))
        for weight in body['weights'].values(): self.assertAlmostEqual(weight,1/6)
        self.assertEqual([x['space_id'] for x in body['recommendations']],['0','1','2'])
        self.assertEqual([x['final_score'] for x in body['recommendations']],[66.6667,58.3333,33.3333])
        self.assertEqual([x['factor_scores']['popup_history'] for x in body['recommendations']],[0,50,100])
        self.assertEqual([x['factor_scores']['brand_space_fit'] for x in body['recommendations']],[100,50,0])
        self.assertEqual(body['brand_analysis']['trait_scores'],dict.fromkeys(KEYS,0))
        for row in body['recommendations']:
            self.assertEqual(set(row['factor_scores']),set(FACTORS))
            self.assertAlmostEqual(sum(row['contributions'].values()),row['final_score'],places=3)

    def test_frontend_importance_gaps_use_nonuniform_csr(self):
        response=self.request(['brand_space_fit','subway_accessibility','rental_price_fit'],[1,2])
        self.assertEqual(response.status_code,200,response.text)
        weights=response.json()['weights']
        self.assertAlmostEqual(weights['brand_space_fit'],8/15)
        self.assertAlmostEqual(weights['subway_accessibility'],1/3)
        self.assertAlmostEqual(weights['rental_price_fit'],2/15)

    def test_invalid_gap_count_is_rejected(self):
        response=self.request(['brand_space_fit','popup_history'],[])
        self.assertEqual(response.status_code,422)
