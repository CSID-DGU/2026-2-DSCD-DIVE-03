"""Regression checks for duplicate assets and excluded description content."""
import json
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from PIL import Image, ImageDraw
from ml.brand.analyzer import BrandAnalyzer


KEYS = ['spirited','trustworthy','upscale','stylish','well-organized','friendly','sentimental']


def picture(size=(640, 400), color='navy'):
    im = Image.new('RGB', size, 'white')
    d = ImageDraw.Draw(im)
    d.rectangle((size[0]//5, size[1]//5, size[0]*4//5, size[1]*4//5), fill=color)
    return im


def setup_case(urls, descriptions, text='차분한 색감의 공식 브랜드 소개'):
    ai = Mock()
    outputs = [SimpleNamespace(output_text='', output=[])]
    if urls: outputs.append(SimpleNamespace(output_text='차분한 색감과 정돈된 배치'))
    outputs += [SimpleNamespace(output_text=json.dumps({'final_description': s})) for s in descriptions]
    ai.responses.create.side_effect = outputs
    client = Mock(); client.scrape.return_value = SimpleNamespace(markdown=text, images=urls, metadata={})
    scorer = Mock(); scorer.score.return_value = dict.fromkeys(KEYS, .5)
    return BrandAnalyzer(ai, client, scorer), ai, scorer


@patch('ml.brand.analyzer.is_public_host', return_value=True)
class BrandQualityTests(unittest.TestCase):
    @patch('ml.brand.analyzer.prepare_image')
    def test_resize_urls_do_not_fill_multiple_image_slots(self, prepare, host):
        analyzer, ai, scorer = setup_case([
            'https://brand.example/photo.jpg?width=500',
            'https://brand.example/photo.jpg?width=1000'], ['차분하고 정돈된 이미지입니다.'])
        prepare.side_effect = [(picture(), 'data:one'), (picture((800,500)), 'data:two')]
        result = analyzer.analyze('https://brand.example/')
        self.assertEqual(len(result['image_sources']), 1)

    @patch('ml.brand.analyzer.prepare_image')
    def test_responsive_filename_variants_are_one_asset(self, prepare, host):
        analyzer, ai, scorer = setup_case([
            'https://brand.example/hero_phone_medium_2x.jpg',
            'https://brand.example/hero_phone_small_2x.jpg'], ['차분한 이미지입니다.'])
        prepare.side_effect = [(picture(), 'data:one'), (picture((800,500)), 'data:two')]
        self.assertEqual(len(analyzer.analyze('https://brand.example/')['image_sources']), 1)

    @patch('ml.brand.analyzer.prepare_image')
    def test_same_photo_with_different_name_is_deduplicated(self, prepare, host):
        analyzer, ai, scorer = setup_case([
            'https://brand.example/a.jpg','https://brand.example/b.jpg'], ['차분한 이미지입니다.'])
        prepare.side_effect = [(picture(), 'data:one'), (picture((800,500)), 'data:two')]
        self.assertEqual(len(analyzer.analyze('https://brand.example/')['image_sources']), 1)

    @patch('ml.brand.analyzer.prepare_image')
    def test_different_photos_are_preserved(self, prepare, host):
        analyzer, ai, scorer = setup_case([
            'https://brand.example/a.jpg','https://brand.example/b.jpg'], ['다채로운 이미지입니다.'])
        prepare.side_effect = [(picture(color='navy'), 'data:one'), (picture(color='red'), 'data:two')]
        self.assertEqual(len(analyzer.analyze('https://brand.example/')['image_sources']), 2)

    def test_price_description_is_rewritten_from_original_evidence(self, host):
        analyzer, ai, scorer = setup_case([], ['합리적인 가격에 따뜻한 디자인을 제공합니다.', '차분한 색감의 미니멀한 디자인을 표현합니다.'])
        result = analyzer.analyze('https://brand.example/')
        self.assertEqual(result['description'], '차분한 색감의 미니멀한 디자인을 표현합니다.')
        scorer.score.assert_called_once_with(result['description'])
        payload = json.loads(ai.responses.create.call_args.kwargs['input'].split('\n',1)[1])
        self.assertEqual(payload['homepage_text'], '차분한 색감의 공식 브랜드 소개')

    def test_repeated_excluded_content_stops_before_nli(self, host):
        analyzer, ai, scorer = setup_case([], ['저렴한 가격의 브랜드입니다.','무료 배송과 높은 매출을 강조합니다.'])
        with self.assertRaises(ValueError): analyzer.analyze('https://brand.example/')
        scorer.score.assert_not_called()
        self.assertEqual(ai.responses.create.call_count, 3)

    @patch('ml.brand.analyzer.prepare_image', return_value=(None, 'data:image/jpeg;base64,AA=='))
    def test_image_only_claim_is_attributed_to_observation(self, prepare, host):
        analyzer, ai, scorer = setup_case(['https://brand.example/a.jpg'],
            ['브랜드는 공식적으로 감성적 철학을 추구합니다.', '이미지에서는 따뜻한 색감이 관찰됩니다.'], text='')
        result = analyzer.analyze('https://brand.example/')
        self.assertTrue(result['description'].startswith('이미지에서는'))
        scorer.score.assert_called_once_with(result['description'])

    @patch('ml.brand.analyzer.prepare_image')
    def test_content_version_and_crop_are_not_removed_from_asset_identity(self, prepare, host):
        for first, second in [
            ('photo.jpg?v=1', 'photo.jpg?v=2'),
            ('photo.jpg?crop=left', 'photo.jpg?crop=right'),
            ('photo.jpg?f=productA', 'photo.jpg?f=productB'),
            ('photo_small.jpg', 'photo_large.jpg'),
        ]:
            with self.subTest(first=first, second=second):
                prepare.reset_mock()
                analyzer, ai, scorer = setup_case([
                    'https://brand.example/' + first, 'https://brand.example/' + second], ['다채로운 이미지입니다.'])
                prepare.side_effect = [(picture(color='navy'), 'data:one'), (picture(color='red'), 'data:two')]
                self.assertEqual(len(analyzer.analyze('https://brand.example/')['image_sources']), 2)

    def test_text_only_description_does_not_claim_image_observation(self, host):
        analyzer, ai, scorer = setup_case([], ['사진에서는 따뜻한 색감이 나타납니다.', '공식 설명은 따뜻한 색감을 강조합니다.'])
        result = analyzer.analyze('https://brand.example/')
        self.assertEqual(result['description'], '공식 설명은 따뜻한 색감을 강조합니다.')
        self.assertTrue(result['description_validation']['regenerated'])

    def test_overlong_description_is_regenerated_within_limit(self, host):
        analyzer, ai, scorer = setup_case([], ['따뜻한 색감과 편안함을 강조합니다.' * 20, '따뜻한 색감과 편안함을 강조합니다.'])
        result = analyzer.analyze('https://brand.example/')
        self.assertLessEqual(len(result['description']), 150)
        self.assertEqual(len(result['description_validation']['attempts']), 2)
