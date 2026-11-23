"""벤치마크 행정동 대관 공간 목록: 기존 등록 공간 데이터와 동일한 seq 기준.

운영 가능/예약 가능 여부를 조회하지 않으며, 등록 가격은 기간 단위가 확인되지 않았음.
"""
import math
from urllib.parse import urlparse

import pandas as pd

from app.services.benchmark_service import REGIONS, load_spaces


def _numeric(series):
    return pd.to_numeric(series.astype('string').str.replace(',', '', regex=False).str.replace('원', '', regex=False).str.strip(), errors='coerce')


def _safe_url(value, allowed_hosts):
    if pd.isna(value):
        return None
    text = str(value).strip()
    try:
        parsed = urlparse(text)
        host = (parsed.hostname or '').lower()
        if parsed.scheme == 'https' and any(host == domain or host.endswith('.' + domain) for domain in allowed_hosts):
            return text
    except ValueError:
        pass
    return None


def _first_photo(value):
    if pd.isna(value) or not str(value).strip():
        return None
    return _safe_url(str(value).split('|')[0].strip(), ('shareit.kr', 'ripieajroxoqatulugda.supabase.co', 'mycafe24.com', 'edge.naverncp.com'))


def build_space_list(region, district='전체', min_area=None, max_area=None,
                     min_price=None, max_price=None, page=1, page_size=8, spaces=None):
    if region not in REGIONS or region == '기타':
        raise ValueError('상세 분석이 가능한 권역을 선택해주세요.')
    if page < 1 or not 1 <= page_size <= 30:
        raise ValueError('페이지 번호 또는 페이지 크기가 올바르지 않습니다.')
    for bound in (min_area, max_area, min_price, max_price):
        if bound is not None and (not math.isfinite(bound) or bound < 0):
            raise ValueError('면적 및 가격 필터는 0 이상의 유한한 값이어야 합니다.')
    if min_area is not None and max_area is not None and min_area > max_area:
        raise ValueError('최소 면적은 최대 면적보다 클 수 없습니다.')
    if min_price is not None and max_price is not None and min_price > max_price:
        raise ValueError('최소 가격은 최대 가격보다 클 수 없습니다.')

    frame = load_spaces() if spaces is None else spaces.copy()
    frame = frame.drop_duplicates(subset='seq').copy()
    for col in ('region_group', 'ADSTRD_NM'):
        frame[col] = frame[col].astype('string').str.strip()
    frame = frame.loc[frame.region_group.eq(region)].copy()
    # 팝업 개최 이력에는 있지만 등록 대관 공간이 없는 행정동도 정상 조회 대상입니다.
    # 공간 목록에 없다는 이유로 422 오류를 반환하지 않습니다.
    if district != '전체':
        frame = frame.loc[frame.ADSTRD_NM.eq(district)].copy()
    frame['_area'] = _numeric(frame['area_pyeong']) if 'area_pyeong' in frame else float('nan')
    frame['_price'] = _numeric(frame['price']) if 'price' in frame else float('nan')
    if min_area is not None:
        frame = frame.loc[frame['_area'] >= min_area]
    if max_area is not None:
        frame = frame.loc[frame['_area'] <= max_area]
    if min_price is not None:
        frame = frame.loc[frame['_price'] >= min_price]
    if max_price is not None:
        frame = frame.loc[frame['_price'] <= max_price]

    frame = frame.sort_values(by=['name', 'seq'], kind='stable', na_position='last')
    total = len(frame)
    sliced = frame.iloc[(page - 1) * page_size: page * page_size]
    items = []
    for _, row in sliced.iterrows():
        area = row['_area']
        price = row['_price']
        items.append({
            'space_id': str(row['seq']),
            'name': str(row['name']) if pd.notna(row['name']) else '이름 미상',
            'district': str(row['ADSTRD_NM']) if pd.notna(row['ADSTRD_NM']) else None,
            'address': str(row['address']).strip() if 'address' in row and pd.notna(row['address']) else None,
            'address_detail': str(row['addressDetail']).strip() if 'addressDetail' in row and pd.notna(row['addressDetail']) else None,
            'area_pyeong': round(float(area), 1) if pd.notna(area) and area > 0 else None,
            'listed_price_krw': int(round(float(price))) if pd.notna(price) and price > 0 else None,
            'thumbnail_url': _first_photo(row.get('photos')),
            'page_url': _safe_url(row.get('page_url'), ('shareit.kr', 'popupkorea.com', 'popupkorea.co.kr', 'mycafe24.com', 'spacecloud.kr')),
        })
    return {
        'region': region,
        'district': district,
        'filters': {'min_area': min_area, 'max_area': max_area, 'min_price': min_price, 'max_price': max_price},
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': math.ceil(total / page_size),
        'price_basis': 'CSV 등록 대관료; 기간 단위 및 예약 가능 여부 미확인',
        'items': items,
    }
