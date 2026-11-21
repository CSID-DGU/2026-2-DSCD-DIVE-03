import unittest
import pandas as pd
from app.services.benchmark_service import build_region_summary, build_district_summary


class BenchmarkTests(unittest.TestCase):
    def setUp(self):
        self.history = pd.DataFrame([
            {'id': 1, 'category': '패션', 'open_date': '2025-10-01', 'close_date': '2025-10-03', 'mapped_region_group': '성수', 'mapped_ADSTRD_NM': '성수2가3동'},
            {'id': 2, 'category': '뷰티', 'open_date': '2025-11-01', 'close_date': '2025-11-04', 'mapped_region_group': '성수', 'mapped_ADSTRD_NM': '성수2가1동'},
            {'id': 3, 'category': '패션', 'open_date': '2027-01-01', 'close_date': '2027-01-08', 'mapped_region_group': '성수', 'mapped_ADSTRD_NM': '성수2가3동'},
            {'id': 4, 'category': 'F&B', 'open_date': '2025-08-01', 'close_date': '2025-08-02', 'mapped_region_group': '기타', 'mapped_ADSTRD_NM': '가상동'},
        ])
        self.spaces = pd.DataFrame([
            {'seq': 10, 'name': 'A', 'region_group': '성수', 'ADSTRD_NM': '성수2가3동', 'price': '1,000,000', 'area_pyeong': 20},
            {'seq': 11, 'name': 'B', 'region_group': '기타', 'ADSTRD_NM': '가상동', 'price': '2,000,000', 'area_pyeong': 40},
        ])

    def test_overall_includes_other_excludes_future(self):
        data = build_region_summary(self.history, self.spaces, as_of='2026-11-22')
        self.assertEqual(data['overall']['popup_count'], 3)
        self.assertEqual(data['overall']['space_count'], 2)
        regions = {r['region']: r for r in data['regions']}
        self.assertEqual(regions['기타']['popup_count'], 1)
        self.assertFalse(regions['기타']['has_district_detail'])
        self.assertEqual(regions['성수']['popup_count'], 2)
        self.assertEqual(regions['성수']['average_duration_days'], 3.5)
        self.assertEqual(regions['성수']['monthly_open_counts'][9]['count'], 1)

    def test_districts_and_period(self):
        data = build_district_summary('성수', self.history, self.spaces,
                                      start_date='2025-11-01', as_of='2026-11-22')
        self.assertEqual(data['region_summary']['popup_count'], 1)
        items = {x['district']: x for x in data['districts']}
        self.assertEqual(items['성수2가3동']['popup_count'], 0)
        self.assertEqual(items['성수2가3동']['space_count'], 1)
        with self.assertRaises(ValueError):
            build_district_summary('기타', self.history, self.spaces, as_of='2026-11-22')


if __name__ == '__main__':
    unittest.main()
