import unittest
import pandas as pd
from app.services.benchmark_population_service import GROUPS, build_population_summary


class TestPopulation(unittest.TestCase):
    def fixture(self):
        base = {column: 0.0 for _, _, column in GROUPS}
        rows = []
        for region, dong, female20 in [('성수', 'A동', 100), ('성수', 'A동', 100), ('성수', 'B동', 50), ('홍대·신촌', 'C동', 70)]:
            item = {**base, 'region_group': region, 'ADSTRD_NM': dong,
                    'female_20s_avg': float(female20), 'male_30s_avg': 40.0}
            rows.append(item)
        return pd.DataFrame(rows)

    def test_no_double_count_for_same_dong(self):
        response = build_population_summary(self.fixture())
        seongsu = next(r for r in response['regions'] if r['region'] == '성수')
        female = next(r for r in seongsu['groups'] if r['group'] == 'female_20s')
        self.assertEqual(female['count'], 150)
        self.assertEqual(seongsu['district_count'], 2)

    def test_all_regions_including_other(self):
        response = build_population_summary(self.fixture())
        self.assertEqual(len(response['regions']), 7)
        self.assertEqual(response['overall']['district_count'], 3)

    def test_top_group_shows_count(self):
        response = build_population_summary(self.fixture())
        seongsu = next(r for r in response['regions'] if r['region'] == '성수')
        self.assertEqual(seongsu['top_group']['label'], '여성 20대')
        self.assertEqual(seongsu['top_group']['count'], 150)


if __name__ == '__main__':
    unittest.main()
