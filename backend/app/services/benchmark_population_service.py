"""벤치마크 생활인구 수 추정치: 공간에 반복된 행정동별 값을 중복 집계하지 않음.

각 *_avg 값은 데이터 원본의 평균 생활인구 추정치이며, 고유 거주 인구나
팝업 실제 방문객 수가 아닙니다. 권역 내 행정동 대표값을 합산한 지표입니다.
"""
import math

import pandas as pd

from app.services.benchmark_service import REGIONS, load_spaces

AGE_GROUPS = (
    ('0_9', '0~9세'), ('10s', '10대'), ('20s', '20대'), ('30s', '30대'),
    ('40s', '40대'), ('50s', '50대'), ('60s', '60대'), ('70plus', '70대 이상'),
)
GROUPS = tuple((f'{gender}_{code}', f'{name} {age}', f'{gender}_{code}_avg')
               for gender, name in (('female', '여성'), ('male', '남성'))
               for code, age in AGE_GROUPS)


def build_population_summary(spaces=None):
    frame = load_spaces() if spaces is None else spaces.copy()
    required = {'region_group', 'ADSTRD_NM', *(column for _, _, column in GROUPS)}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f'생활인구 데이터 필수 컬럼 누락: {sorted(missing)}')
    frame = frame.copy()
    frame['region_group'] = frame['region_group'].astype('string').str.strip()
    frame['ADSTRD_NM'] = frame['ADSTRD_NM'].astype('string').str.strip()
    frame = frame.loc[frame.region_group.isin(REGIONS) & frame.ADSTRD_NM.notna()].copy()
    columns = [col for _, _, col in GROUPS]
    for col in columns:
        frame[col] = pd.to_numeric(frame[col], errors='coerce').where(lambda s: s >= 0)
    # 같은 행정동에 등록 공간이 여러 개 있어도 한 번만 집계.
    # 동일 행정동 값이 서로 다를 경우 평균을 대표값으로 사용.
    per_district = frame.groupby(['region_group', 'ADSTRD_NM'], observed=True)[columns].mean()

    def aggregate(values):
        totals = values.sum(axis=0, min_count=1) if len(values) else pd.Series(dtype=float)
        items = []
        for key, label, column in GROUPS:
            value = totals.get(column, float('nan'))
            if pd.notna(value) and math.isfinite(float(value)):
                items.append({'group': key, 'label': label, 'count': int(round(float(value)))})
        items.sort(key=lambda item: (-item['count'], item['label']))
        return {
            'district_count': int(len(values)),
            'total_count': sum(item['count'] for item in items),
            'top_group': items[0] if items else None,
            'groups': items,
        }

    regions = []
    for region in REGIONS:
        grouped = per_district.loc[[region]] if region in per_district.index.get_level_values(0) else per_district.iloc[:0]
        regions.append({'region': region, **aggregate(grouped)})

    return {
        'scope': 'population',
        'population_basis': '등록 대관 공간이 있는 행정동별 평균 생활인구 추정치 합산; 동일 행정동 중복 제거',
        'not_visitor_count': True,
        'overall': aggregate(per_district),
        'regions': regions,
    }
