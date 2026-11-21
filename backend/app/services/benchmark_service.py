"""POPCAST 벤치마크 통계. 기존 추천 점수 계산 로직과 독립적으로 동작합니다."""
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

from app.services.popup_history_service import load_popup_history

ROOT = Path(__file__).resolve().parents[3]
SPACES_PATH = ROOT / 'data' / 'popup_spaces.csv'
KST = timezone(timedelta(hours=9))
REGIONS = ('성수', '홍대·신촌', '잠실', '강남·서초', '용산', '종로·을지로·명동', '기타')


def _today():
    return datetime.now(KST).date()


def _clean(frame, columns):
    for col in columns:
        frame[col] = frame[col].astype('string').str.strip()
    return frame


def load_spaces(path=SPACES_PATH):
    """공간 CSV 로딩. 기존 파일의 cp949 인코딩을 우선 시도합니다."""
    try:
        frame = pd.read_csv(path, encoding='cp949')
    except UnicodeDecodeError:
        frame = pd.read_csv(path, encoding='utf-8-sig')
    mandatory = {'region_group', 'ADSTRD_NM', 'seq', 'name'}
    missing = mandatory - set(frame.columns)
    if missing:
        raise ValueError(f'공간 데이터 필수 컬럼 누락: {sorted(missing)}')
    return _clean(frame, ['region_group', 'ADSTRD_NM'])


def _records(history, spaces, start_date=None, end_date=None, as_of=None):
    """조회 기준: 시작일(open_date), 실제 기준일(as_of) 이전에 시작한 이력만 포함.

    종료하지 않은 현재 운영 중 팝업도 '과거 시작된 개최 건'에 포함됩니다.
    종료된 팝업만 원하는 경우 별도 기준을 정의해야 합니다.
    """
    h = history.copy()
    s = spaces.copy()
    for column in ('category', 'mapped_region_group', 'mapped_ADSTRD_NM'):
        h[column] = h[column].astype('string').str.strip()
    h['open_date'] = pd.to_datetime(h['open_date'], errors='coerce')
    if 'close_date' in h:
        h['close_date'] = pd.to_datetime(h['close_date'], errors='coerce')
    cutoff = pd.Timestamp(as_of or _today())
    h = h.loc[h['open_date'].notna() & (h['open_date'] < cutoff)]
    if start_date:
        h = h.loc[h['open_date'] >= pd.Timestamp(start_date)]
    if end_date:
        h = h.loc[h['open_date'] <= pd.Timestamp(end_date)]
    h = h.loc[h['mapped_region_group'].isin(REGIONS)]
    s = s.loc[s['region_group'].isin(REGIONS)]
    if 'id' in h:
        h = h.drop_duplicates(subset='id')
    if 'seq' in s:
        s = s.drop_duplicates(subset='seq')
    return h, s


def _numbers(h, s):
    category_counts = h['category'].dropna().value_counts()
    duration = pd.Series(dtype=float)
    if 'close_date' in h:
        duration = (h['close_date'] - h['open_date']).dt.days + 1
        duration = duration.where(duration >= 1).dropna()

    prices = pd.Series(dtype=float)
    if 'price' in s:
        prices = pd.to_numeric(s['price'].astype('string').str.replace(',', '', regex=False), errors='coerce')
        prices = prices.loc[prices > 0]
    areas = pd.Series(dtype=float)
    if 'area_pyeong' in s:
        areas = pd.to_numeric(s['area_pyeong'], errors='coerce')
        areas = areas.loc[areas > 0]

    monthly = h['open_date'].dt.month.value_counts().to_dict()
    return {
        'popup_count': int(len(h)),
        'space_count': int(len(s)),
        'top_category': str(category_counts.index[0]) if len(category_counts) else None,
        'top_category_share': round(float(category_counts.iloc[0] / len(h)), 4) if len(category_counts) and len(h) else None,
        'average_duration_days': round(float(duration.mean()), 1) if len(duration) else None,
        'average_listed_price_krw': round(float(prices.mean())) if len(prices) else None,
        'median_area_pyeong': round(float(areas.median()), 1) if len(areas) else None,
        'category_counts': [{'category': str(c), 'count': int(n)} for c, n in category_counts.items()],
        'monthly_open_counts': [{'month': month, 'count': int(monthly.get(month, 0))} for month in range(1, 13)],
    }


def build_region_summary(history=None, spaces=None, start_date=None, end_date=None, as_of=None):
    history = load_popup_history() if history is None else history
    spaces = load_spaces() if spaces is None else spaces
    h, s = _records(history, spaces, start_date, end_date, as_of)
    overall = _numbers(h, s)
    regions = []
    for region in REGIONS:
        rh = h.loc[h['mapped_region_group'] == region]
        rs = s.loc[s['region_group'] == region]
        regions.append({'region': region, 'has_district_detail': region != '기타', **_numbers(rh, rs)})
    return {
        'scope': 'regions',
        'as_of': str(as_of or _today()),
        'period': {'start_date': str(start_date) if start_date else None, 'end_date': str(end_date) if end_date else None},
        'popup_date_basis': 'open_date (as_of 미만)',
        'space_price_basis': '등록 대관료; 과거 팝업 예산 아님; 기간 필터 비적용',
        'overall': overall,
        'regions': regions,
    }


def build_district_summary(region, history=None, spaces=None, start_date=None, end_date=None, as_of=None):
    if region not in REGIONS or region == '기타':
        raise ValueError('상세 분석이 가능한 권역을 선택해주세요.')
    history = load_popup_history() if history is None else history
    spaces = load_spaces() if spaces is None else spaces
    h, s = _records(history, spaces, start_date, end_date, as_of)
    h = h.loc[h['mapped_region_group'] == region]
    s = s.loc[s['region_group'] == region]
    district_names = sorted(set(h['mapped_ADSTRD_NM'].dropna()) | set(s['ADSTRD_NM'].dropna()))
    districts = []
    for name in district_names:
        dh = h.loc[h['mapped_ADSTRD_NM'] == name]
        ds = s.loc[s['ADSTRD_NM'] == name]
        districts.append({'district': str(name), **_numbers(dh, ds)})
    return {'scope': 'districts', 'region': region, 'as_of': str(as_of or _today()),
            'period': {'start_date': str(start_date) if start_date else None, 'end_date': str(end_date) if end_date else None},
            'region_summary': _numbers(h, s), 'districts': districts}
