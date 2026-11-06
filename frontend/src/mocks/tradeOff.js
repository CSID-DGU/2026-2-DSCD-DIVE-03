import { FACTOR_LABELS } from './recommendations';

// UI 전용 Mock. 이미 계산되어 있는 추천 결과만 사용하여 같은 기준으로 두 공간을 비교합니다.
// 새로운 AI 추론, 실제 CSR 계산, 예약 확인을 수행하지 않습니다.
const safeNumber = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = (value) => Math.round(value * 10) / 10;
const factorName = (id) => FACTOR_LABELS[id] || id;

export function getMockTradeOff(payload, recommendation) {
  if (!recommendation?.recommendation_id) throw new Error('비교 기준이 되는 추천 결과가 없습니다.');
  if (payload?.recommendation_id !== recommendation.recommendation_id) throw new Error('기준 추천 결과 ID가 일치하지 않습니다.');
  const ids = payload?.space_ids;
  if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1] || ids.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('서로 다른 공간을 정확히 2개 선택해 주세요.');
  }
  const all = recommendation.recommendations || [];
  const spaces = ids.map((id) => all.find((space) => space.space_id === id));
  if (spaces.some((space) => !space)) throw new Error('선택한 공간이 현재 추천 결과에 없습니다.');

  const [a, b] = spaces;
  const selected = recommendation.soft_filters?.selected || Object.keys(recommendation.weights || {});
  const weights = recommendation.weights || {};
  const factor_comparison = selected.map((factor) => {
    const aScore = safeNumber(a.factor_scores?.[factor]);
    const bScore = safeNumber(b.factor_scores?.[factor]);
    const aContribution = a.contributions?.[factor] == null ? round(aScore * safeNumber(weights[factor])) : safeNumber(a.contributions[factor]);
    const bContribution = b.contributions?.[factor] == null ? round(bScore * safeNumber(weights[factor])) : safeNumber(b.contributions[factor]);
    return {
      factor,
      scores: { [a.space_id]: aScore, [b.space_id]: bScore },
      contributions: { [a.space_id]: aContribution, [b.space_id]: bContribution },
      winner_space_id: aScore === bScore ? null : aScore > bScore ? a.space_id : b.space_id,
    };
  });

  const getArguments = (space, rival) => {
    const deltas = factor_comparison.map((entry) => ({
      factor: entry.factor,
      delta: entry.scores[space.space_id] - entry.scores[rival.space_id],
      weightedDelta: entry.contributions[space.space_id] - entry.contributions[rival.space_id],
    }));
    const strength = deltas.filter((item) => item.delta > 0)
      .sort((x, y) => y.weightedDelta - x.weightedDelta || y.delta - x.delta)
      .slice(0, 3)
      .map((item) => `${factorName(item.factor)}에서 상대 공간보다 ${round(item.delta).toFixed(1)}점 높음`);
    const weakness = deltas.filter((item) => item.delta < 0)
      .sort((x, y) => x.weightedDelta - y.weightedDelta || x.delta - y.delta)
      .slice(0, 3)
      .map((item) => `${factorName(item.factor)}에서 상대 공간보다 ${round(Math.abs(item.delta)).toFixed(1)}점 낮음`);
    return { strength, weakness };
  };
  const aArguments = getArguments(a, b);
  const bArguments = getArguments(b, a);
  const aFinal = safeNumber(a.final_score);
  const bFinal = safeNumber(b.final_score);
  const leader = aFinal === bFinal ? null : aFinal > bFinal ? a : b;
  const scoreGap = round(Math.abs(aFinal - bFinal));
  const topFactor = [...factor_comparison].sort((x, y) => {
    const xGap = Math.abs(x.contributions[a.space_id] - x.contributions[b.space_id]);
    const yGap = Math.abs(y.contributions[a.space_id] - y.contributions[b.space_id]);
    return yGap - xGap;
  })[0];
  const scoreSentence = leader
    ? `${leader.name}의 종합 적합도가 ${scoreGap.toFixed(1)}점 더 높습니다.`
    : '두 공간의 종합 적합도 점수가 같습니다.';
  const factorSentence = topFactor
    ? `가중 기여도 차이가 가장 큰 평가요소는 ${factorName(topFactor.factor)}입니다.`
    : '선택된 평가요소가 없어 요소별 비교를 표시할 수 없습니다.';

  return {
    recommendation_id: recommendation.recommendation_id,
    spaces: spaces.map((space) => ({
      space_id: space.space_id,
      rank: space.rank,
      name: space.name,
      address: space.address,
      image_url: space.image_url,
      price_krw: space.price_krw,
      area_pyeong: space.area_pyeong,
      nearest_station: space.nearest_station,
      station_distance_m: space.station_distance_m,
      latitude: space.latitude,
      longitude: space.longitude,
      final_score: space.final_score,
      factor_scores: space.factor_scores || {},
      contributions: space.contributions || {},
    })),
    weights,
    factor_comparison,
    score_comparison: { [a.space_id]: aFinal, [b.space_id]: bFinal, difference: scoreGap },
    strengths: [
      { space_id: a.space_id, items: aArguments.strength },
      { space_id: b.space_id, items: bArguments.strength },
    ],
    weaknesses: [
      { space_id: a.space_id, items: aArguments.weakness },
      { space_id: b.space_id, items: bArguments.weakness },
    ],
    summary: `${scoreSentence} ${factorSentence} 이는 현재 Mock 추천 점수를 비교한 결과로, 실제 AI 분석은 아닙니다.`,
    additional_considerations: '운영 기간별 실제 대관 가능 여부와 총 대관료, 공간 방문 동선, 브랜드 콘셉트 및 현장 상태를 별도로 확인해 주세요. 이 분석은 등록 가격과 시연용 평가 점수를 사용합니다.',
    mock_meta: { is_mock: true, source: '현재 추천 결과의 점수·가중 기여도', limitations: 'NLI/CSR 모델 미연동, 기간별 예약 가능 여부와 실 대관료 미검증' },
  };
}
