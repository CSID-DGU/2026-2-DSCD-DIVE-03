"""지도 위에 표시할 과거 팝업 개최 위치/등록 공간 좌표 집계.

행정동 경계가 아니라 실제 좌표에 대한 위치 밀집도 레이어를 생성합니다.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional
import pandas as pd

from app.services.popup_history_service import load_popup_history
from app.services.benchmark_service import REGIONS, load_spaces, _records

KST = timezone(timedelta(hours=9))
DETAIL_REGIONS = tuple(r for r in REGIONS if r != '기타')


def _coordinate_frame(frame, region_col, district_col):
    required = {'latitude', 'longitude', region_col, district_col}
    missing = required - set(frame.columns)
    if missing:
        raise ValueError(f'지도 데이터에 좌표/지역 컬럼이 누락되었습니다: {sorted(missing)}')
    result = frame.copy()
    result['latitude'] = pd.to_numeric(result['latitude'], errors='coerce')
    result['longitude'] = pd.to_numeric(result['longitude'], errors='coerce')
    result = result[
        result['latitude'].between(37.0, 38.0)
        & result['longitude'].between(126.0, 128.0)
    ].copy()
    result['region'] = result[region_col].astype('string').str.strip()
    result['district'] = result[district_col].astype('string').str.strip().fillna('미상')
    # 약 100m 격자로 집계하여 전체 원본 좌표를 그대로 공개하지 않음
    result['lat_bucket'] = result['latitude'].round(3)
    result['lng_bucket'] = result['longitude'].round(3)
    return result


def build_map_points(region='전체', district='전체', history=None, spaces=None,
                     start_date=None, end_date=None, as_of=None):
    """권역/행정동 필터를 적용한 지도용 격자 점과 권역별 중심 좌표 반환.

    0.001도 반올림 그리드의 점들은 개별 팝업 장소나 행정동 경계가 아닙니다.
    """
    if region != '전체' and region not in REGIONS:
        raise ValueError('존재하지 않는 권역입니다.')
    if district != '전체' and (region == '전체' or region == '기타'):
        raise ValueError('행정동은 상세 분석 가능한 권역과 함께 선택해주세요.')
    h = load_popup_history() if history is None else history
    s = load_spaces() if spaces is None else spaces
    h, s = _records(h, s, start_date=start_date, end_date=end_date, as_of=as_of)
    h = _coordinate_frame(h, 'mapped_region_group', 'mapped_ADSTRD_NM')
    s = _coordinate_frame(s, 'region_group', 'ADSTRD_NM')

    # 전체 지도에서 권역별 대표 중심은 모든 날짜 조건이 적용된 팝업 좌표로 계산
    centers = []
    for r in REGIONS:
        points = h.loc[h['region'] == r]
        if points.empty:
            points = s.loc[s['region'] == r]
        if points.empty:
            continue
        centers.append({
            'region': r,
            'latitude': round(float(points['latitude'].median()), 6),
            'longitude': round(float(points['longitude'].median()), 6),
            'popup_count': int((h['region'] == r).sum()),
            'space_count': int((s['region'] == r).sum()),
            'has_district_detail': r != '기타',
        })

    if region != '전체':
        h = h.loc[h['region'] == region]
        s = s.loc[s['region'] == region]
    if district != '전체':
        h = h.loc[h['district'] == district]
        s = s.loc[s['district'] == district]

    keys = ['region', 'district', 'lat_bucket', 'lng_bucket']
    h_counts = h.groupby(keys, dropna=False).size().rename('popup_count').reset_index()
    s_counts = s.groupby(keys, dropna=False).size().rename('space_count').reset_index()
    mixed = h_counts.merge(s_counts, on=keys, how='outer').fillna({'popup_count': 0, 'space_count': 0})
    mixed['total'] = mixed['popup_count'] + mixed['space_count']
    mixed = mixed.sort_values('total', ascending=False)
    # 클라이언트 렌더링 안정성을 위해 상위 격자 1500개까지 표시
    limit = 1500
    truncated = len(mixed) > limit
    grid = [{
        'region': str(row.region),
        'district': str(row.district),
        'latitude': float(row.lat_bucket),
        'longitude': float(row.lng_bucket),
        'popup_count': int(row.popup_count),
        'space_count': int(row.space_count),
    } for row in mixed.head(limit).itertuples(index=False)]
    return {
        'scope': 'map-points', 'region': region, 'district': district,
        'as_of': str(as_of or datetime.now(KST).date()),
        'coordinate_basis': '원본 위경도 약 100m 격자; 행정동 경계 데이터 아님',
        'grid_count': len(mixed), 'truncated': bool(truncated),
        'points': grid, 'region_centers': centers,
    }
