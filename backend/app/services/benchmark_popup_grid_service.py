"""기존 map-points의 (권역, 행정동, 위도/경도 소수 3자리) 격자에 속한 실제 팝업 이력 조회."""
from datetime import datetime, timedelta, timezone
import pandas as pd

from app.services.popup_history_service import load_popup_history
from app.services.benchmark_service import REGIONS, _records, load_spaces
from app.services.benchmark_map_service import _coordinate_frame

KST = timezone(timedelta(hours=9))


def _clean(value):
    if pd.isna(value):
        return None
    text = str(value).strip()
    return text if text and text.lower() not in ('nan', 'nat', 'none') else None


def popup_grid_history(region, district, latitude, longitude, page=1, page_size=10,
                       start_date=None, end_date=None, as_of=None, history=None):
    if region not in REGIONS:
        raise ValueError('올바른 권역을 선택해 주세요.')
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError('올바른 지도 좌표를 전달해 주세요.')
    if not 1 <= page_size <= 30 or page < 1:
        raise ValueError('페이지 번호 또는 조회 건수가 올바르지 않습니다.')

    source = load_popup_history() if history is None else history
    # 지도 집계에 쓰이는 기존 기간/미래 데이터 제외 로직 그대로 재사용
    filtered, _ = _records(source, load_spaces(), start_date=start_date,
                           end_date=end_date, as_of=as_of)
    h = _coordinate_frame(filtered, 'mapped_region_group', 'mapped_ADSTRD_NM')
    h = h.loc[
        (h['region'] == region)
        & (h['district'] == district)
        & (h['lat_bucket'] == round(latitude, 3))
        & (h['lng_bucket'] == round(longitude, 3))
    ].copy()
    total = len(h)
    if 'open_date' in h.columns:
        h['_sort_date'] = pd.to_datetime(h['open_date'], errors='coerce')
        h = h.sort_values('_sort_date', ascending=False, kind='stable', na_position='last')

    selected = h.iloc[(page - 1) * page_size: page * page_size]
    items = []
    for _, row in selected.iterrows():
        raw_url = _clean(row.get('url'))
        # 외부 스킴 삽입 방지
        safe_url = raw_url if raw_url and raw_url.startswith(('https://', 'http://')) else None
        items.append({
            'id': _clean(row.get('id')),
            'title': _clean(row.get('title')) or '이름 미상 팝업',
            'category': _clean(row.get('category')) or '카테고리 미상',
            'open_date': _clean(row.get('open_date')),
            'close_date': _clean(row.get('close_date')),
            'address': _clean(row.get('address')),
            'address_detail': _clean(row.get('address_detail')),
            'url': safe_url,
        })
    return {
        'region': region, 'district': district,
        'latitude': round(latitude, 3), 'longitude': round(longitude, 3),
        'as_of': str(as_of or datetime.now(KST).date()),
        'total': total, 'page': page, 'page_size': page_size,
        'total_pages': (total + page_size - 1) // page_size,
        'items': items,
    }
