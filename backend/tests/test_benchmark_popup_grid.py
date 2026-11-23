"""실제 프로젝트 루트에서 PYTHONPATH=backend pytest/unittest로 실행."""
import unittest
from unittest.mock import patch
import pandas as pd
from app.services.benchmark_popup_grid_service import popup_grid_history


class PopupGridTests(unittest.TestCase):
    def setUp(self):
        self.history = pd.DataFrame([
            dict(id=1, title='첫 번째 팝업', url='https://popga.co.kr/popup/1', category='패션',
                 open_date='2025-01-01', close_date='2025-01-11', address='서울 성동구',
                 mapped_region_group='성수', mapped_ADSTRD_NM='성수2가3동',
                 latitude=37.54511, longitude=127.05511),
            dict(id=2, title='두 번째 팝업', url='https://popga.co.kr/popup/2', category='뷰티',
                 open_date='2025-06-01', close_date='2025-06-11', address='서울 성동구',
                 mapped_region_group='성수', mapped_ADSTRD_NM='성수2가3동',
                 latitude=37.54518, longitude=127.05518),
            dict(id=3, title='옆 격자', url='https://popga.co.kr/popup/3', category='패션',
                 open_date='2025-06-01', close_date='2025-06-11', address='서울 성동구',
                 mapped_region_group='성수', mapped_ADSTRD_NM='성수2가3동',
                 latitude=37.5462, longitude=127.05518),
        ])

    @patch('app.services.benchmark_popup_grid_service.load_spaces')
    @patch('app.services.benchmark_popup_grid_service._records')
    def test_grid_and_sort(self, record_filter, load_spaces):
        load_spaces.return_value = pd.DataFrame()
        record_filter.side_effect = lambda history, spaces, **kwargs: (history, spaces)
        result = popup_grid_history('성수', '성수2가3동', 37.545, 127.055,
                                    as_of='2026-11-22', history=self.history)
        self.assertEqual(result['total'], 2)
        self.assertEqual([x['title'] for x in result['items']], ['두 번째 팝업', '첫 번째 팝업'])
        self.assertEqual(result['items'][0]['url'], 'https://popga.co.kr/popup/2')

    @patch('app.services.benchmark_popup_grid_service.load_spaces')
    @patch('app.services.benchmark_popup_grid_service._records')
    def test_empty_grid(self, record_filter, load_spaces):
        load_spaces.return_value = pd.DataFrame()
        record_filter.side_effect = lambda history, spaces, **kwargs: (history, spaces)
        result = popup_grid_history('성수', '성수2가3동', 37.549, 127.055, history=self.history)
        self.assertEqual(result['total'], 0)
        self.assertEqual(result['items'], [])

    def test_wrong_region(self):
        with self.assertRaises(ValueError):
            popup_grid_history('임의지역', '성수2가3동', 37.545, 127.055, history=self.history)


if __name__ == '__main__':
    unittest.main()
