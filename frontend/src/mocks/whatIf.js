import { getMockRecommendation } from './recommendations';

// What-if Mock: 실제 공간·가격·지역 기반 후보 수의 변화는 계산하지만,
// 예약 가능 여부·LLM 설명·공식 CSR/NLI 적합도를 계산하지 않습니다.
const jsonEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stableHash = (value) => {
  let hash = 2166136261;
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
};
const DIFFERENCE_LABELS = {
  max_budget_krw: '최대 예산 변경',
  region_ids: '지역 변경',
  area_range_pyeong: '희망 면적 변경',
  start_date: '운영 시작일 변경',
  end_date: '운영 종료일 변경',
  target_customers: '타깃 고객 변경',
  category_id: '카테고리 변경',
  brand_url: '브랜드 URL 변경',
  soft_filters: '추천 기준·가중치 변경',
};

const sortedByRank = (result) => [...(result?.recommendations || [])].sort((a, b) => a.rank - b.rank);
const areaPair = (filters) => [filters.area_min_pyeong, filters.area_max_pyeong];

export function getMockWhatIf(request, baseline) {
  if (!baseline?.recommendation_id) throw new Error('비교할 기존 추천 결과가 없습니다.');
  if (request.recommendation_id !== baseline.recommendation_id) {
    throw new Error('기준 추천 결과 ID가 일치하지 않습니다.');
  }
  const beforeHard = baseline.hard_filters || {};
  const beforeSoft = baseline.soft_filters || {};
  const hard = { ...beforeHard, ...(request.modified_hard_filters || {}) };
  const soft = { ...beforeSoft, ...(request.modified_soft_filters || {}) };
  const updated = getMockRecommendation({ hard_filters: hard, soft_filters: soft });
  // What-if에서 만들어진 추천 결과가 기존 것과 구분되도록 별도 식별자 부여
  updated.recommendation_id = `mock_rec_whatif_${stableHash({ from: baseline.recommendation_id, hard, soft })}`;

  const changes = {};
  const hardKeys = new Set([...Object.keys(beforeHard), ...Object.keys(hard)]);
  for (const key of hardKeys) {
    if (key === 'area_min_pyeong' || key === 'area_max_pyeong') continue;
    if (!jsonEqual(beforeHard[key], hard[key])) {
      changes[key] = { before: beforeHard[key] ?? null, after: hard[key] ?? null };
    }
  }
  if (!jsonEqual(areaPair(beforeHard), areaPair(hard))) {
    changes.area_range_pyeong = { before: areaPair(beforeHard), after: areaPair(hard) };
  }
  if (!jsonEqual(beforeSoft, soft)) {
    changes.soft_filters = { before: beforeSoft, after: soft };
  }

  const before = sortedByRank(baseline);
  const after = sortedByRank(updated);
  const beforeById = new Map(before.map((item) => [item.space_id, item]));
  const afterById = new Map(after.map((item) => [item.space_id, item]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const rank_changes = [...ids].map((space_id) => {
    const b = beforeById.get(space_id);
    const a = afterById.get(space_id);
    return {
      space_id,
      name: a?.name ?? b?.name ?? space_id,
      image_url: a?.image_url ?? b?.image_url ?? null,
      before_rank: b?.rank ?? null,
      after_rank: a?.rank ?? null,
      before_score: b?.final_score ?? null,
      after_score: a?.final_score ?? null,
    };
  });
  // 이 값들은 여러 조건을 동시에 바꿀 때 서로 영향을 주므로 합산할 수 없습니다.
  // '변경 항목 하나만' baseline에 적용한 반사실적 Mock 결과와 비교합니다.
  const factor_impacts = Object.entries(changes).map(([factor, pair]) => {
    const trialHard = { ...beforeHard };
    const trialSoft = { ...beforeSoft };
    if (factor === 'area_range_pyeong') {
      trialHard.area_min_pyeong = pair.after[0];
      trialHard.area_max_pyeong = pair.after[1];
    } else if (factor === 'soft_filters') {
      Object.assign(trialSoft, pair.after);
    } else {
      trialHard[factor] = pair.after;
    }
    const trial = getMockRecommendation({ hard_filters: trialHard, soft_filters: trialSoft });
    return {
      factor,
      label: DIFFERENCE_LABELS[factor] || factor,
      candidate_change: trial.total_candidates - baseline.total_candidates,
      explanation: '기존 조건에서 해당 항목 하나만 변경한 Mock 후보 수 차이',
    };
  });

  const gain = after.filter((space) => !beforeById.has(space.space_id)).length;
  const lost = before.filter((space) => !afterById.has(space.space_id)).length;
  const names = Object.keys(changes).map((key) => DIFFERENCE_LABELS[key] || key).join('·');
  const summary = `${names || '설정'}에 따라 Mock 추천 결과를 다시 계산했습니다. 후보 ${baseline.total_candidates}개 → ${updated.total_candidates}개, 신규 진입 ${gain}개, 제외 ${lost}개입니다. 운영 기간별 예약 가능 여부와 실제 AI 분석은 반영되지 않았습니다.`;
  return {
    scenario_id: `mock_scenario_${stableHash({ from: baseline.recommendation_id, request })}`,
    baseline_recommendation_id: baseline.recommendation_id,
    changed_conditions: changes,
    candidate_comparison: {
      before: baseline.total_candidates,
      after: updated.total_candidates,
      difference: updated.total_candidates - baseline.total_candidates,
    },
    rank_changes,
    factor_impacts,
    summary,
    updated_recommendation: updated,
    mock_meta: {
      is_mock: true,
      caveats: '후보 수는 Mock에서 지역·단일 등록 가격 기준만 반영하며, 날짜·면적은 후보 제외 기준이 아닙니다. 기여도는 중복될 수 있어 합산 불가. 실제 모델 분석이 아닙니다.',
    },
  };
}
