import { MOCK_SPACES } from './spaceRecords';

// 이 파일은 백엔드가 완성되기 전 UI 테스트만을 위한 Mock 추천 엔진입니다.
// 실제 NLI, 팝업 개최 이력 분석, 공간 예약 가능 여부, 공식 CSR 계산을 수행하지 않습니다.
// 공간 이름·위치·사진·등록 가격은 사용자 제공 최종 공간 CSV를 이용합니다.
const FACTOR_LABELS = {
  target_ratio: '타깃 고객 비율',
  brand_space_fit: '브랜드–공간 분위기 일치도',
  popup_history: '동종 팝업 개최 이력',
  subway_accessibility: '지하철 접근성',
  rental_price_fit: '대관료 적합도',
  area_fit: '공간 면적 적합도',
};

const round = (n, decimals = 1) => Number(n.toFixed(decimals));
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const stableHash = (text) => {
  let h = 2166136261;
  for (const char of String(text)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
};

// UI 예시 가중치: 간격으로 구성한 임시 importance scale을 정규화합니다.
// 팀의 공식 CSR 공식과 동일함을 보장하지 않으며 실제 API의 weights로 대체됩니다.
export function getDemoWeights(selected = [], gaps = []) {
  if (!selected.length) return {};
  const safeGaps = Array.from({ length: selected.length - 1 }, (_, i) => clamp(Number(gaps[i]) || 0, 0, 3));
  const length = 1 + safeGaps.reduce((a, b) => a + b, 0);
  let position = 1;
  const scores = selected.map((_, index) => {
    if (index > 0) position += safeGaps[index - 1];
    return length + 1 - position;
  });
  const total = scores.reduce((a, b) => a + b, 0);
  // 반올림 오차를 마지막 항목에 흡수하여 합계가 정확히 1이 되도록 합니다.
  const weights = {};
  let used = 0;
  selected.forEach((key, index) => {
    const value = index === selected.length - 1 ? round(1 - used, 6) : round(scores[index] / total, 6);
    weights[key] = value;
    used += value;
  });
  return weights;
}

const targetShare = (space, selectedTargets) => selectedTargets.reduce((total, key) => total + (Number(space.ratios?.[key]) || 0), 0);

function demoFactorScore(id, space, filters, targetStats) {
  const seed = stableHash(`${id}:${space.space_id}:${filters.category_id || ''}:${filters.brand_url || ''}`);
  if (id === 'target_ratio') {
    const share = targetShare(space, filters.target_customers || []);
    // 후보군 내 상대 수준을 이용하는 *데모용* 변환입니다. 실제 추천 로직과 다릅니다.
    const range = targetStats.max - targetStats.min;
    return round(range > 0.00001 ? clamp(45 + 53 * (share - targetStats.min) / range) : 70);
  }
  if (id === 'brand_space_fit') return 55 + seed % 43; // NLI 모델 미연결: 재현 가능한 시연 값
  if (id === 'popup_history') return 48 + seed % 49; // 팝업 DB 미연결: 재현 가능한 시연 값
  if (id === 'subway_accessibility') return round(clamp(100 / (1 + Number(space.station_distance_m || 0) / 420)));
  if (id === 'rental_price_fit') return round(clamp(100 * (1 - space.price_krw / Number(filters.max_budget_krw || 1))));
  if (id === 'area_fit') {
    const min = Number(filters.area_min_pyeong || 0);
    const max = Number(filters.area_max_pyeong || 0);
    const area = space.area_pyeong;
    if (area < min) return round(clamp(100 - (min - area) / Math.max(min, 1) * 100 * 3));
    if (area > max) return round(clamp(100 - (area - max) / Math.max(max, 1) * 100));
    return 100;
  }
  return 0;
}

function makeSummary(factorScores, contributions) {
  const leaders = Object.keys(contributions).sort((a, b) => contributions[b] - contributions[a]).slice(0, 2);
  if (leaders.length === 0) return '선택한 평가요소에 대한 예시 추천 결과입니다.';
  const names = leaders.map((key) => FACTOR_LABELS[key] || key).join('과(와) ');
  return `${names}의 가중 기여도가 높게 나타난 시연용 추천 결과입니다. 실제 운영 적합도는 백엔드 모델 연동 후 확인하세요.`;
}

// POST /recommendations의 응답 구조를 모방합니다. 예약 가능 여부는 필터링하지 않습니다.
export function getMockRecommendation(request) {
  const filters = request.hard_filters || {};
  const soft = request.soft_filters || {};
  const selected = soft.selected || [];
  const weights = getDemoWeights(selected, soft.importance_gaps || []);
  const validRegions = new Set(filters.region_ids || []);
  const budget = Number(filters.max_budget_krw || 0);
  const candidates = MOCK_SPACES.filter((space) =>
    validRegions.has(space.region_group) && space.price_krw <= budget && space.latitude != null && space.longitude != null,
  );
  // 희망 면적은 Hard Filter가 아니라 area_fit 평가요소에서만 반영합니다.
  const shares = candidates.map((space) => targetShare(space, filters.target_customers || []));
  const targetStats = { min: shares.length ? Math.min(...shares) : 0, max: shares.length ? Math.max(...shares) : 0 };
  const scored = candidates.map((space) => {
    const factor_scores = Object.fromEntries(selected.map((key) => [key, demoFactorScore(key, space, filters, targetStats)]));
    const contributions = Object.fromEntries(selected.map((key) => [key, round(factor_scores[key] * weights[key], 3)]));
    const final_score = round(Object.values(contributions).reduce((a, b) => a + b, 0));
    return {
      ...space, rank: 0, final_score, factor_scores, contributions,
      summary: makeSummary(factor_scores, contributions),
    };
  });
  scored.sort((a, b) => b.final_score - a.final_score || a.space_id.localeCompare(b.space_id));
  const recommendations = scored.map((space, i) => ({ ...space, rank: i + 1 }));
  return {
    recommendation_id: `mock_rec_${stableHash(JSON.stringify(request))}`,
    total_candidates: recommendations.length,
    hard_filters: filters,
    soft_filters: soft,
    weights,
    recommendations,
    mock_meta: {
      is_mock: true,
      space_source: '공간_final_최종본.csv',
      scored_count: recommendations.length,
      limitations: '기간별 예약 가능 여부 미확인 / 가격 기준 검증 전 / 일부 평가요소와 가중치는 시연용 계산',
    },
  };
}

export { FACTOR_LABELS };
