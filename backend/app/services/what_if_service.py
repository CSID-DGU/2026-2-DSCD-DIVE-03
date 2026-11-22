
"""Analyze a real recommendation rerun using existing POPCAST filters and ranking.

Statistical summaries only, no LLM-generated claims.
"""
from copy import deepcopy
from uuid import uuid4

from app.api.recommendations import run_recommendation
from app.schemas.recommendation import RecommendationRequest
from app.services.data_loader import load_spaces
from app.services.hard_filter import apply_hard_filters
from app.services.availability import filter_spaces_by_period
from app.services.recommendation_store import get_recommendation, save_recommendation

FACTOR_LABELS = {
    'target_ratio': '타깃 고객 규모',
    'brand_space_fit': '브랜드-공간 분위기 일치도',
    'popup_history': '동종 팝업 개최 이력',
    'subway_accessibility': '지하철 접근성',
    'rental_price_fit': '대관료 적합도',
    'area_fit': '공간 면적 적합도',
}
HARD_LABELS = {
    'max_budget_krw': '최대 예산',
    'region_ids': '희망 지역',
    'operating_period': '운영 기간',
}


def _candidate_ids(spaces, hard: dict) -> set[str]:
    """Use EXACT same exclusion stages as run_recommendation."""
    filtered = apply_hard_filters(
        spaces,
        budget_max=hard['max_budget_krw'],
        regions=hard['region_ids'],
    )
    filtered = filter_spaces_by_period(
        spaces=filtered,
        start_date=str(hard['start_date']),
        end_date=str(hard['end_date']),
    )
    return {str(x) for x in filtered['seq'].tolist()}


def _changed_conditions(before_hard, after_hard, before_soft, after_soft):
    changes = {}
    all_keys = set(before_hard) | set(after_hard)
    for key in sorted(all_keys):
        if key in ('area_min_pyeong', 'area_max_pyeong'):
            continue
        if before_hard.get(key) != after_hard.get(key):
            changes[key] = {
                'before': before_hard.get(key),
                'after': after_hard.get(key),
            }

    before_area = [
        before_hard.get('area_min_pyeong'),
        before_hard.get('area_max_pyeong'),
    ]
    after_area = [
        after_hard.get('area_min_pyeong'),
        after_hard.get('area_max_pyeong'),
    ]

    if before_area != after_area:
        changes['area_range_pyeong'] = {
            'before': before_area,
            'after': after_area,
        }

    if before_soft != after_soft:
        changes['soft_filters'] = {
            'before': before_soft,
            'after': after_soft,
        }

    return changes


def _factor_impacts(spaces, base_hard, next_hard, before_ids):
    """Single-factor counterfactual: hold every other filter at baseline."""
    specs = (
        ('max_budget_krw', ('max_budget_krw',)),
        ('region_ids', ('region_ids',)),
        ('operating_period', ('start_date', 'end_date')),
    )

    items = []

    for key, fields in specs:
        changed = any(
            base_hard.get(f) != next_hard.get(f)
            for f in fields
        )

        if not changed:
            delta = 0
        else:
            trial = deepcopy(base_hard)

            for f in fields:
                trial[f] = next_hard[f]

            delta = (
                len(_candidate_ids(spaces, trial))
                - len(before_ids)
            )

        items.append({
            'factor': key,
            'label': HARD_LABELS[key],
            'candidate_change': delta,
            'changed': changed,
            'explanation': '기준 조건에서 이 조건만 변경한 후보 수 차이',
        })

    return items


def _space_analyses(before, after, after_list):
    """Use actual returned factors/contributions; never impute an absent prior score."""
    factors = (
        set(after.get('weights', {}))
        | set(before.get('weights', {}))
    )

    averages = {}

    for factor in sorted(factors):
        values = [
            float(s['factor_scores'][factor])
            for s in after_list
            if s.get('factor_scores', {}).get(factor) is not None
        ]

        if values:
            averages[factor] = round(
                sum(values) / len(values),
                4,
            )

    output = {}

    for space in after_list:
        sid = str(space['space_id'])
        old = before.get(sid)
        rows = []

        for factor in sorted(factors):
            old_score = (
                old.get('factor_scores', {}).get(factor)
                if old else None
            )
            new_score = space.get('factor_scores', {}).get(factor)

            old_contrib = (
                old.get('contributions', {}).get(factor)
                if old else None
            )
            new_contrib = (
                space.get('contributions', {}).get(factor)
            )

            rows.append({
                'factor': factor,
                'label': FACTOR_LABELS.get(factor, factor),
                'before_score': old_score,
                'after_score': new_score,
                'score_change': (
                    round(new_score - old_score, 4)
                    if new_score is not None
                    and old_score is not None
                    else None
                ),
                'before_contribution': old_contrib,
                'after_contribution': new_contrib,
                'contribution_change': (
                    round(new_contrib - old_contrib, 4)
                    if new_contrib is not None
                    and old_contrib is not None
                    else None
                ),
                'candidate_average_score': averages.get(factor),
                'difference_from_average': (
                    round(new_score - averages[factor], 4)
                    if new_score is not None
                    and factor in averages
                    else None
                ),
            })

        positive = sorted(
            (
                r for r in rows
                if r['difference_from_average'] is not None
            ),
            key=lambda r: r['difference_from_average'],
            reverse=True,
        )

        strong = (
            positive[0]
            if positive
            and positive[0]['difference_from_average'] > 0
            else None
        )

        weak = (
            positive[-1]
            if positive
            and positive[-1]['difference_from_average'] < 0
            else None
        )

        contribution = sorted(
            (
                r for r in rows
                if r['after_contribution'] is not None
            ),
            key=lambda r: r['after_contribution'],
            reverse=True,
        )

        if old is None:
            summary = (
                f"{space['name']}은(는) 변경 후 추천 "
                f"{space['rank']}위에 새로 포함되었습니다."
            )
        else:
            d = (
                float(space['final_score'])
                - float(old['final_score'])
            )

            summary = (
                f"{space['name']}의 순위는 "
                f"{old['rank']}위에서 "
                f"{space['rank']}위로 변경되었고, "
                f"종합점수는 {d:+.2f}점 변했습니다."
            )

        if contribution:
            summary += (
                f" 변경 후 {contribution[0]['label']}의 "
                f"가중 기여도가 "
                f"{contribution[0]['after_contribution']:.2f}점으로 "
                f"가장 큽니다."
            )

        if strong:
            summary += (
                f" {strong['label']}은(는) 후보 평균보다 "
                f"{strong['difference_from_average']:.2f}점 높습니다."
            )

        if weak:
            summary += (
                f" {weak['label']}은(는) 후보 평균보다 "
                f"{abs(weak['difference_from_average']):.2f}점 낮습니다."
            )

        output[sid] = {
            'status': (
                'new' if old is None
                else 'up' if space['rank'] < old['rank']
                else 'down' if space['rank'] > old['rank']
                else 'same'
            ),
            'summary': summary,
            'summary_type': 'deterministic',
            'factors': rows,
            'strength_factor': (
                strong['factor'] if strong else None
            ),
            'weakness_factor': (
                weak['factor'] if weak else None
            ),
        }

    return output


def analyze_what_if(request):
    # 1. 기존 추천 결과 조회
    baseline = get_recommendation(request.recommendation_id)

    if baseline is None:
        raise LookupError(
            '기준 추천 결과를 찾을 수 없습니다. '
            '추천을 다시 실행한 뒤 분석해 주세요.'
        )

    # 2. 기존 조건에 변경 조건 병합
    base_hard = baseline['hard_filters']
    base_soft = baseline['soft_filters']

    next_hard = {
        **base_hard,
        **(request.modified_hard_filters or {}),
    }

    next_soft = {
        **base_soft,
        **(request.modified_soft_filters or {}),
    }

    # 3. 기존 추천 요청 스키마로 검증
    new_request = RecommendationRequest.model_validate({
        'hard_filters': next_hard,
        'soft_filters': next_soft,
    })

    # 4. 기존 추천 엔진 재실행
    updated = run_recommendation(new_request)

    # 변경된 추천 결과도 저장
    save_recommendation(updated)

    # 5. 변경 조건 정리
    changes = _changed_conditions(
        base_hard,
        next_hard,
        base_soft,
        next_soft,
    )

    before_list = baseline['recommendations']
    after_list = updated['recommendations']

    before = {
        str(s['space_id']): s
        for s in before_list
    }
    after = {
        str(s['space_id']): s
        for s in after_list
    }

    before_ids = set(before)
    after_ids = set(after)

    gains = len(after_ids - before_ids)
    losses = len(before_ids - after_ids)

    # 6. 공간별 순위 및 점수 변화
    rank_changes = []

    for sid in sorted(before_ids | after_ids):
        b = before.get(sid)
        a = after.get(sid)

        rank_changes.append({
            'space_id': sid,
            'name': (a or b)['name'],
            'image_url': (a or b).get('image_url'),
            'before_rank': b['rank'] if b else None,
            'after_rank': a['rank'] if a else None,
            'before_score': b['final_score'] if b else None,
            'after_score': a['final_score'] if a else None,
        })

    # 7. Hard Filter별 후보 수 변화 분석
    spaces = load_spaces()

    baseline_ids = _candidate_ids(
        spaces,
        base_hard,
    )

    impacts = _factor_impacts(
        spaces,
        base_hard,
        next_hard,
        baseline_ids,
    )

    # 8. 공간별 적합도·가중 기여도 분석
    space_analyses = _space_analyses(
        before,
        after,
        after_list,
    )

    # 9. 전체 변화 요약
    summary = (
        f"추천 후보가 {len(before_list)}개에서 "
        f"{len(after_list)}개로 "
        f"{len(after_list) - len(before_list):+d}개 변했습니다. "
        f"신규 포함 {gains}개, 제외 {losses}개이며 "
        f"기존 후보 {len(before_ids & after_ids)}개가 유지되었습니다. "
        "조건별 증감량은 각 조건을 단독 변경한 결과이며 "
        "합산할 수 없습니다."
    )

    # 10. 최종 API 응답
    return {
        'scenario_id': f"scenario_{uuid4().hex[:12]}",
        'baseline_recommendation_id': baseline['recommendation_id'],
        'changed_conditions': changes,
        'candidate_comparison': {
            'before': len(before_list),
            'after': len(after_list),
            'difference': len(after_list) - len(before_list),
            'retained': len(before_ids & after_ids),
            'added': gains,
            'removed': losses,
        },
        'rank_changes': rank_changes,
        'factor_impacts': impacts,
        'period_impact': next(
            (
                x for x in impacts
                if x['factor'] == 'operating_period'
            ),
            None,
        ),
        'summary': summary,
        'overall_analysis': {
            'summary': summary,
            'summary_type': 'deterministic',
        },
        'space_analyses': space_analyses,
        'updated_recommendation': updated,
        'analysis_meta': {
            'is_mock': False,
            'llm_generated': False,
            'note': (
                '기존 추천 엔진과 운영 기간 필터를 '
                '재실행한 정량 분석'
            ),
        },
    }
