import unittest

import pandas as pd

from app.services.benchmark_spaces_service import build_space_list


class BenchmarkSpacesTests(unittest.TestCase):
    def setUp(self):
        self.spaces = pd.DataFrame([
            dict(seq=1, name='A', address='서울특별시 성동구 성수이로 10', addressDetail='2층', region_group='성수', ADSTRD_NM='성수2가3동', area_pyeong=40, price='1,200,000', photos='https://img.shareit.kr/a.jpg | https://img.shareit.kr/b.jpg', page_url='https://shareit.kr/venue/1'),
            dict(seq=2, name='B', region_group='성수', ADSTRD_NM='성수2가3동', area_pyeong=100, price='3,000,000', photos='', page_url='javascript:alert(1)'),
            dict(seq=3, name='C', region_group='성수', ADSTRD_NM='성수1가2동', area_pyeong=70, price='2,000,000', photos=None, page_url=None),
            dict(seq=4, name='D', region_group='잠실', ADSTRD_NM='잠실동', area_pyeong=50, price='1,000,000', photos=None, page_url=None),
        ])

    def test_region_district_filters_and_pagination(self):
        result = build_space_list('성수', district='성수2가3동', spaces=self.spaces, page_size=1)
        self.assertEqual(result['total'], 2)
        self.assertEqual(result['total_pages'], 2)
        self.assertEqual(result['items'][0]['name'], 'A')
        self.assertEqual(build_space_list('성수', district='성수2가3동', min_area=80, spaces=self.spaces)['items'][0]['name'], 'B')
        self.assertEqual(build_space_list('성수', min_price=2000000, max_price=3000000, spaces=self.spaces)['total'], 2)

    def test_address_and_detail(self):
        item = build_space_list('성수', district='성수2가3동', spaces=self.spaces)['items'][0]
        self.assertEqual(item['address'], '서울특별시 성동구 성수이로 10')
        self.assertEqual(item['address_detail'], '2층')
        other = build_space_list('성수', district='성수2가3동', spaces=self.spaces)['items'][1]
        self.assertIsNone(other['address'])
        self.assertIsNone(other['address_detail'])

    def test_photo_link_safety(self):
        items = build_space_list('성수', spaces=self.spaces)['items']
        self.assertEqual(items[0]['thumbnail_url'], 'https://img.shareit.kr/a.jpg')
        self.assertIsNone(items[1]['page_url'])

    def test_invalid_region_and_filter(self):
        with self.assertRaises(ValueError):
            build_space_list('기타', spaces=self.spaces)
        # 등록 공간이 0개인 행정동은 오류 대신 빈 조회 결과를 반환합니다.
        empty = build_space_list('성수', district='성수1가1동', spaces=self.spaces)
        self.assertEqual(empty['total'], 0)
        self.assertEqual(empty['items'], [])
        self.assertEqual(empty['total_pages'], 0)
        with self.assertRaises(ValueError):
            build_space_list('성수', min_area=100, max_area=20, spaces=self.spaces)


if __name__ == '__main__':
    unittest.main()
