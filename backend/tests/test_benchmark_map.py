import unittest
import pandas as pd
from app.services.benchmark_map_service import build_map_points

class BenchmarkMapTests(unittest.TestCase):
    def setUp(self):
        self.history = pd.DataFrame([
            dict(id=1,category='패션',open_date='2025-01-01',mapped_region_group='성수',mapped_ADSTRD_NM='성수2가3동',latitude=37.5451,longitude=127.0551),
            dict(id=2,category='뷰티',open_date='2025-02-01',mapped_region_group='성수',mapped_ADSTRD_NM='성수2가3동',latitude=37.5452,longitude=127.0552),
            dict(id=3,category='패션',open_date='2028-02-01',mapped_region_group='성수',mapped_ADSTRD_NM='성수2가3동',latitude=37.5452,longitude=127.0552),
            dict(id=4,category='뷰티',open_date='2025-01-01',mapped_region_group='기타',mapped_ADSTRD_NM='기타동',latitude=37.50,longitude=127.01),
        ])
        self.spaces = pd.DataFrame([
            dict(seq=1,name='A',region_group='성수',ADSTRD_NM='성수2가3동',latitude=37.5451,longitude=127.0551),
            dict(seq=2,name='B',region_group='기타',ADSTRD_NM='기타동',latitude=37.50,longitude=127.01),
        ])

    def test_filters_and_counts(self):
        result = build_map_points('성수','성수2가3동',self.history,self.spaces,as_of='2026-11-22')
        self.assertEqual(sum(x['popup_count'] for x in result['points']), 2)
        self.assertEqual(sum(x['space_count'] for x in result['points']), 1)
        self.assertTrue(any(x['region'] == '기타' for x in result['region_centers']))

    def test_other_has_no_district(self):
        with self.assertRaises(ValueError):
            build_map_points('기타','기타동',self.history,self.spaces)

if __name__ == '__main__': unittest.main()
