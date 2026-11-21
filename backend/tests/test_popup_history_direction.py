from types import SimpleNamespace

import pandas as pd
import pytest
from pydantic import ValidationError

from app.schemas.recommendation import SoftFilters
from app.services import recommendation_service
from ml.recommendation.scoring import popup_history_scores


def test_soft_filter_direction_defaults_to_existing_behavior():
    filters = SoftFilters(selected=['popup_history'], importance_gaps=[])
    assert filters.popup_history_direction == 'frequent'


def test_soft_filter_direction_accepts_rare_and_rejects_invalid_values():
    filters = SoftFilters(selected=['popup_history'], importance_gaps=[], popup_history_direction='rare')
    assert filters.popup_history_direction == 'rare'
    with pytest.raises(ValidationError):
        SoftFilters(selected=['popup_history'], importance_gaps=[], popup_history_direction='both')


def test_normalized_history_reverses_candidate_order():
    assert popup_history_scores([0, 5, 10]) == pytest.approx([0.0, 0.5, 1.0])
    assert popup_history_scores([0, 5, 10], reverse=True) == pytest.approx([1.0, 0.5, 0.0])


def test_original_zero_count_tie_remains_backward_compatible():
    assert popup_history_scores([0, 0]) == [0.0, 0.0]
    assert popup_history_scores([0, 0], reverse=True) == [1.0, 1.0]
    assert popup_history_scores([5, 5], reverse=True) == [0.5, 0.5]


def test_rare_score_has_no_effect_on_non_history_factors(monkeypatch):
    monkeypatch.setattr(recommendation_service, 'count_popup_history', lambda candidates, category: [1, 5, 9])
    candidates = pd.DataFrame({'seq': [11, 12, 13]})
    hard = SimpleNamespace(category_id='패션')
    frequent = recommendation_service.calculate_soft_scores(
        candidates, hard, ['popup_history'], popup_history_direction='frequent'
    )
    rare = recommendation_service.calculate_soft_scores(
        candidates, hard, ['popup_history'], popup_history_direction='rare'
    )
    assert frequent['11']['popup_history'] == 0.0
    assert frequent['13']['popup_history'] == 1.0
    assert rare['11']['popup_history'] == 1.0
    assert rare['13']['popup_history'] == 0.0
    assert frequent['12']['popup_history'] == rare['12']['popup_history'] == 0.5


def test_category_is_required_for_both_history_directions():
    candidates = pd.DataFrame({'seq': [1]})
    for direction in ('frequent', 'rare'):
        with pytest.raises(ValueError, match='브랜드 카테고리'):
            recommendation_service.calculate_soft_scores(
                candidates, SimpleNamespace(category_id=None), ['popup_history'],
                popup_history_direction=direction,
            )


def test_llm_fact_sheet_explains_rare_score_direction():
    from app.services.trade_off_llm import _facts
    result = {
        'popup_history_direction': 'rare',
        'spaces': [
            {'space_id': 'a', 'name': 'A', 'final_score': 80.0, 'price_krw': 100000,
             'area_pyeong': 10, 'nearest_station': '역A'},
            {'space_id': 'b', 'name': 'B', 'final_score': 70.0, 'price_krw': 200000,
             'area_pyeong': 20, 'nearest_station': '역B'},
        ],
        'score_comparison': {'difference': 10.0},
        'factor_comparison': [{
            'factor': 'popup_history', 'weight': 1.0,
            'scores': {'a': 80.0, 'b': 70.0},
            'contributions': {'a': 80.0, 'b': 70.0},
        }],
    }
    facts = _facts(result)
    assert facts['popup_history_direction'] == 'rare'
    assert '적을수록' in facts['popup_history_score_meaning']
