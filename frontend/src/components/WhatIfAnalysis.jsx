
import { useMemo, useState } from 'react';
import { createWhatIfAnalysis } from '../services/whatIf';
import { FACTOR_LABELS } from '../mocks/recommendations';
import './WhatIfAnalysis.css';

// ============================================================
// 1. 기본 설정
// ============================================================

const REGIONS = [
  '성수',
  '강남·서초',
  '홍대·신촌',
  '종로·을지로·명동',
  '용산',
  '기타',
  '잠실',
];

const CATEGORIES = [
  '패션', '애니/캐릭터', '뷰티', 'F&B',
  '라이프스타일', '연예인/셀럽', '엔터테인먼트',
  '기타', '문구/아트', '디지털/테크',
  '키즈/반려동물', '지역상생',
];

const AGES = [
  ['0_9', '0~9세'],
  ['10s', '10대'],
  ['20s', '20대'],
  ['30s', '30대'],
  ['40s', '40대'],
  ['50s', '50대'],
  ['60s', '60대'],
  ['70plus', '70대 이상'],
];

const TARGETS = ['female', 'male'].flatMap((gender) =>
  AGES.map(([code, age]) => ({
    value: `${gender}_${code}`,
    label: `${gender === 'female' ? '여성' : '남성'} ${age}`,
  }))
);

const FACTOR_ORDER = [
  'target_ratio',
  'brand_space_fit',
  'popup_history',
  'subway_accessibility',
  'rental_price_fit',
  'area_fit',
];

const GAP_LABELS = [
  '비슷함',
  '조금 더 중요함',
  '더 중요함',
  '훨씬 더 중요함',
];

const TOP_RANK_COUNT = 5;

const formatMoney = (value) =>
  `${Number(value || 0).toLocaleString('ko-KR')}원`;

const formatDelta = (value) =>
  `${value > 0 ? '+' : ''}${Number(value).toLocaleString('ko-KR')}`;

const fmt = (value) =>
  value == null ? 'N/A' : Number(value).toFixed(1);

const same = (a, b) =>
  JSON.stringify(a) === JSON.stringify(b);

const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
};

const copyHard = (hard = {}) => ({
  ...hard,
  region_ids: [...(hard.region_ids || [])],
  target_customers: [...(hard.target_customers || [])],
});

const copySoft = (soft = {}) => ({
  selected: [...(soft.selected || [])],
  importance_gaps: [...(soft.importance_gaps || [])],
});

const normalizeGaps = (items, gaps) =>
  Array.from(
    { length: Math.max(0, items.length - 1) },
    (_, i) => Number(gaps?.[i] ?? 1)
  );

const isEligible = (id, hard) => {
  if (id === 'target_ratio') {
    return (hard.target_customers || []).length > 0;
  }
  if (id === 'brand_space_fit') {
    return /^https?:\/\//i.test(hard.brand_url || '');
  }
  if (id === 'popup_history') {
    return Boolean(hard.category_id);
  }
  return true;
};

// ============================================================
// 2. Request 생성 및 검증
// ============================================================

function makePayload(baseline, hard, soft) {
  const baseHard = baseline.hard_filters || {};
  const baseSoft = baseline.soft_filters || {};
  const changedHard = {};

  for (const [key, value] of Object.entries(hard)) {
    if (!same(value, baseHard[key])) {
      changedHard[key] = value;
    }
  }

  const payload = {
    recommendation_id: baseline.recommendation_id,
  };

  if (Object.keys(changedHard).length) {
    payload.modified_hard_filters = changedHard;
  }

  if (!same(soft, baseSoft)) {
    payload.modified_soft_filters = soft;
  }

  return payload;
}

function validate(hard, soft) {
  if (
    !Number.isFinite(Number(hard.max_budget_krw)) ||
    Number(hard.max_budget_krw) <= 0
  ) {
    return '최대 예산은 0원보다 커야 합니다.';
  }

  if (
    !(hard.region_ids || []).length ||
    hard.region_ids.length > 3
  ) {
    return '지역은 1~3개 선택해 주세요.';
  }

  if (
    !hard.start_date ||
    !hard.end_date ||
    hard.end_date < hard.start_date ||
    hard.start_date < today()
  ) {
    return '운영 기간을 확인해 주세요.';
  }

  if (
    +hard.area_min_pyeong < 0 ||
    +hard.area_max_pyeong < +hard.area_min_pyeong ||
    +hard.area_max_pyeong > 5000
  ) {
    return '희망 면적은 0~5,000평 범위로 설정해 주세요.';
  }

  if (hard.brand_url) {
    try {
      const url = new URL(hard.brand_url);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return '브랜드 URL은 http 또는 https 형식이어야 합니다.';
      }
    } catch {
      return '브랜드 URL을 확인해 주세요.';
    }
  }

  if (!soft.selected.length) {
    return '평가요소를 최소 1개 선택해 주세요.';
  }

  if (soft.selected.some((id) => !isEligible(id, hard))) {
    return '선택한 평가요소에 필요한 기본 정보가 부족합니다.';
  }

  if (
    soft.importance_gaps.length !== soft.selected.length - 1 ||
    soft.importance_gaps.some(
      (gap) => ![0, 1, 2, 3].includes(gap)
    )
  ) {
    return '평가요소 중요도 차이를 확인해 주세요.';
  }

  return '';
}

// ============================================================
// 3. TOP 5 공간 카드
// ============================================================

function SpacePreview({
  space,
  status,
  previous,
  current,
  selected = false,
  onSelect,
}) {
  if (!space) return null;

  return (
    <div
      className={`whatif-space-preview ${
        selected ? 'is-selected' : ''
      } ${onSelect ? 'is-clickable' : ''}`}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? selected : undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (
          onSelect &&
          (e.key === 'Enter' || e.key === ' ')
        ) {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="whatif-space-image">
        {space.image_url ? (
          <img
            src={space.image_url}
            alt=""
            loading="lazy"
          />
        ) : (
          <span>사진 없음</span>
        )}
      </span>

      <div className="whatif-space-info">
        <strong title={space.name}>{space.name}</strong>
        <small>{space.address || ''}</small>

        <span className="whatif-space-deltas">
          {previous != null && (
            <span>이전 {fmt(previous)}점</span>
          )}

          {previous != null && current != null && (
            <span>→</span>
          )}

          {current != null && (
            <b>변경 {fmt(current)}점</b>
          )}
        </span>
      </div>

      {status && (
        <span
          className={`whatif-space-status ${
            status === 'NEW' ? 'is-new' : ''
          }`}
        >
          {status}
        </span>
      )}

      {selected && (
        <span className="whatif-selected-check">✓</span>
      )}
    </div>
  );
}

// ============================================================
// 4. 변경 조건 요약
// ============================================================

function ScenarioChanges({ baseline, result }) {
  const conditions = Object.entries(
    result.changed_conditions || {}
  );

  const labels = {
    max_budget_krw: '예산',
    region_ids: '지역',
    area_range_pyeong: '면적',
    start_date: '시작일',
    end_date: '종료일',
    target_customers: '타깃 고객',
    category_id: '카테고리',
    brand_url: '브랜드 URL',
    soft_filters: '평가요소 중요도',
  };

  return (
    <div className="whatif-changes">
      <h3>변경한 조건</h3>

      {conditions.length ? (
        conditions.map(([key, value]) => (
          <div className="whatif-change-line" key={key}>
            <span>{labels[key] || key}</span>
            <strong>
              {key === 'soft_filters'
                ? '변경됨'
                : key === 'max_budget_krw'
                ? formatMoney(value.after)
                : Array.isArray(value.after)
                ? value.after.join(', ') || '선택 없음'
                : String(value.after ?? '미선택')}
            </strong>
          </div>
        ))
      ) : (
        <p className="whatif-muted">
          기존 조건과 동일합니다.
        </p>
      )}

      <p className="whatif-subnote">
        기준 추천 ID: {baseline.recommendation_id}
      </p>
    </div>
  );
}

// ============================================================
// 5. 선택 공간 평가요소별 분석
// ============================================================

function getContribution(space, key, weights) {
  if (!space) return null;

  if (space.contributions?.[key] != null) {
    return Number(space.contributions[key]);
  }

  const score = space.factor_scores?.[key];
  const weight = weights?.[key];

  if (score == null || weight == null) return null;

  return Number(score) * Number(weight);
}

function SelectedSpaceAnalysis({
  space,
  oldSpace,
  baseline,
  updated,
  scenario,
}) {
  const [metric, setMetric] = useState('score');

  if (!space) {
    return (
      <div className="whatif-waiting">
        TOP 5 공간을 선택하면 상세 분석이 표시됩니다.
      </div>
    );
  }

  const isNew = !oldSpace;

  const oldWeights = baseline?.weights || {};
  const newWeights = updated?.weights || {};

  const factorKeys = [
    ...new Set([
      ...Object.keys(oldWeights),
      ...Object.keys(newWeights),
    ]),
  ];

  // 적합도 점수 또는 가중 기여도 조회
  const getValue = (target, key, weights, type) => {
    if (!target) return null;

    if (type === 'score') {
      const value = target.factor_scores?.[key];
      return value == null ? null : Number(value);
    }

    return getContribution(target, key, weights);
  };

  const rows = factorKeys
    .map((key) => {
      const before = getValue(
        oldSpace,
        key,
        oldWeights,
        metric
      );

      const after = getValue(
        space,
        key,
        newWeights,
        metric
      );

      return {
        key,
        label: FACTOR_LABELS[key] || key,
        before,
        after,
        delta:
          before == null || after == null
            ? null
            : after - before,
      };
    })
    .filter(
      (row) =>
        row.before != null || row.after != null
    );

  // 그래프 최대값
  const maxValue =
    metric === 'score'
      ? 100
      : Math.max(
          1,
          ...rows.flatMap((row) => [
            row.before ?? 0,
            row.after ?? 0,
          ])
        );

  const barWidth = (value) => {
    if (value == null) return '0%';

    return `${Math.min(
      100,
      Math.max(0, (value / maxValue) * 100)
    )}%`;
  };

  const status = isNew
    ? '신규 진입'
    : space.rank < oldSpace.rank
    ? '순위 상승'
    : space.rank > oldSpace.rank
    ? '순위 하락'
    : '순위 유지';

  // ----------------------------------------------------------
  // 5-1. 가중 기여도 변화 계산
  // ----------------------------------------------------------

  const contributionChanges = factorKeys.map((key) => {
    const before = getContribution(
      oldSpace,
      key,
      oldWeights
    );

    const after = getContribution(
      space,
      key,
      newWeights
    );

    return {
      key,
      before,
      after,
      delta:
        before == null || after == null
          ? null
          : after - before,
    };
  });

  const topContributors = [...contributionChanges]
    .filter((row) => row.after != null)
    .sort((a, b) => b.after - a.after);

  const validChanges = contributionChanges.filter(
    (row) => row.delta != null
  );

  const largestIncrease = [...validChanges].sort(
    (a, b) => b.delta - a.delta
  )[0];

  const largestDecrease = [...validChanges].sort(
    (a, b) => a.delta - b.delta
  )[0];

  // ----------------------------------------------------------
  // 5-2. 변경 후 전체 후보 평균
  // ----------------------------------------------------------

  const candidates = updated?.recommendations || [];
  const factorAverages = {};

  factorKeys.forEach((key) => {
    const values = candidates
      .map((item) => item.factor_scores?.[key])
      .filter(
        (value) =>
          value != null && Number.isFinite(Number(value))
      )
      .map(Number);

    if (values.length) {
      factorAverages[key] =
        values.reduce((sum, value) => sum + value, 0) /
        values.length;
    }
  });

  const relativeFactors = factorKeys
    .filter(
      (key) =>
        space.factor_scores?.[key] != null &&
        factorAverages[key] != null
    )
    .map((key) => ({
      key,
      score: Number(space.factor_scores[key]),
      average: factorAverages[key],
      difference:
        Number(space.factor_scores[key]) -
        factorAverages[key],
    }));

  const bestStrength = [...relativeFactors].sort(
    (a, b) => b.difference - a.difference
  )[0];

  const biggestWeakness = [...relativeFactors].sort(
    (a, b) => a.difference - b.difference
  )[0];

  // ----------------------------------------------------------
  // 5-3. Mock 정량 요약 / 실제 LLM 응답
  // ----------------------------------------------------------

  const backendSummary =
    scenario?.space_analyses?.[space.space_id]?.summary ??
    scenario?.space_summaries?.[space.space_id] ??
    null;

  let mockSummary = '';

  if (isNew) {
    const top = topContributors[0];

    mockSummary =
      `변경 후 추천 ${space.rank}위로 새롭게 진입한 공간입니다. ` +
      `종합 적합도는 ${fmt(space.final_score)}점입니다. ` +
      (top
        ? `${FACTOR_LABELS[top.key] || top.key}의 ` +
          `가중 기여도가 ${fmt(top.after)}점으로 ` +
          `가장 높게 나타났습니다. `
        : '') +
      (bestStrength && bestStrength.difference > 0
        ? `${FACTOR_LABELS[bestStrength.key] || bestStrength.key}은(는) ` +
          `후보 평균보다 ${fmt(bestStrength.difference)}점 높습니다. `
        : '') +
      (biggestWeakness && biggestWeakness.difference < 0
        ? `반면 ${FACTOR_LABELS[biggestWeakness.key] || biggestWeakness.key}은(는) ` +
          `후보 평균보다 ${fmt(Math.abs(biggestWeakness.difference))}점 낮습니다. `
        : '') +
      `정확한 신규 진입 원인은 개별 Hard Filter 분석 결과가 필요합니다.`;
  } else {
    const scoreDelta =
      space.final_score - oldSpace.final_score;

    mockSummary =
      `해당 공간의 추천 순위는 ${oldSpace.rank}위에서 ` +
      `${space.rank}위로 변경되었습니다. ` +
      `종합 적합도는 ${fmt(oldSpace.final_score)}점에서 ` +
      `${fmt(space.final_score)}점으로 ` +
      `${scoreDelta >= 0 ? '+' : ''}${fmt(scoreDelta)}점 변화했습니다. ` +
      (largestIncrease?.delta > 0
        ? `${FACTOR_LABELS[largestIncrease.key] || largestIncrease.key}의 ` +
          `가중 기여도가 ${fmt(largestIncrease.delta)}점 증가했습니다. `
        : '') +
      (largestDecrease?.delta < 0
        ? `${FACTOR_LABELS[largestDecrease.key] || largestDecrease.key}의 ` +
          `가중 기여도가 ${fmt(Math.abs(largestDecrease.delta))}점 감소했습니다. `
        : '') +
      `순위 변동에는 다른 후보 공간들의 점수 변화도 영향을 미칩니다.`;
  }

  // ----------------------------------------------------------
  // 5-4. 화면 렌더링
  // ----------------------------------------------------------

  return (
    <div className="whatif-space-analysis">

      {/* 선택한 공간 정보 */}
      <div className="whatif-selected-heading">
        <div>
          <strong>{space.name}</strong>
          <span className="whatif-selected-status">
            {status}
          </span>
        </div>

        <small>
          {isNew
            ? `신규 진입 → ${space.rank}위`
            : `${oldSpace.rank}위 → ${space.rank}위`}
          {' · '}
          {isNew
            ? `${fmt(space.final_score)}점`
            : `${fmt(oldSpace.final_score)}점 → ${fmt(space.final_score)}점`}
        </small>
      </div>

      {/* 그래프 유형 선택 */}
      <div
        className="whatif-metric-tabs"
        role="tablist"
        aria-label="평가 지표 선택"
      >
        <button
          type="button"
          role="tab"
          aria-selected={metric === 'score'}
          className={metric === 'score' ? 'active' : ''}
          onClick={() => setMetric('score')}
        >
          적합도 점수
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={metric === 'contribution'}
          className={metric === 'contribution' ? 'active' : ''}
          onClick={() => setMetric('contribution')}
        >
          가중 기여도
        </button>
      </div>

      <div className="whatif-chart-legend">
        <span>
          <i className="whatif-legend-before" />
          변경 전
        </span>
        <span>
          <i className="whatif-legend-after" />
          변경 후
        </span>
      </div>

      {/* 평가요소별 막대그래프 */}
      <div className="whatif-factor-comparison">
        {rows.map((item) => (
          <div
            className="whatif-factor-block"
            key={item.key}
          >
            <div className="whatif-factor-title">
              <strong>{item.label}</strong>

              <b>
                {item.delta == null
                  ? '신규'
                  : Math.abs(item.delta) < 0.001
                  ? '변화 없음'
                  : `${item.delta > 0 ? '+' : ''}${fmt(item.delta)}점`}
              </b>
            </div>

            {[
              ['변경 전', item.before, 'before'],
              ['변경 후', item.after, 'after'],
            ].map(([label, value, type]) => (
              <div
                className="whatif-factor-bar-row"
                key={type}
              >
                <span>{label}</span>

                <div className="whatif-factor-track">
                  {value != null && (
                    <div
                      className={`whatif-factor-fill ${type}`}
                      style={{
                        width: barWidth(value),
                      }}
                    />
                  )}
                </div>

                <b>
                  {value == null
                    ? 'N/A'
                    : `${fmt(value)}점`}
                </b>
              </div>
            ))}
          </div>
        ))}
      </div>

      {isNew && (
        <p className="whatif-subnote">
          신규 진입 공간은 변경 전 추천 대상이 아니므로
          변경 전 점수를 N/A로 표시합니다.
        </p>
      )}

      {/* 후보 평균 대비 강점·약점 */}
      <h3>후보 평균 대비 강점·약점</h3>

      <div className="whatif-insight">
        {bestStrength && bestStrength.difference > 0 ? (
          <p>
            <strong>상대적 강점 · </strong>
            {FACTOR_LABELS[bestStrength.key]}
            {' '}
            {fmt(bestStrength.score)}점
            {' / 후보 평균 '}
            {fmt(bestStrength.average)}점
            {' ('}
            +{fmt(bestStrength.difference)}점{')'}
          </p>
        ) : (
          <p>후보 평균 대비 뚜렷한 우위 요소가 없습니다.</p>
        )}

        {biggestWeakness &&
        biggestWeakness.difference < 0 ? (
          <p>
            <strong>상대적 약점 · </strong>
            {FACTOR_LABELS[biggestWeakness.key]}
            {' '}
            {fmt(biggestWeakness.score)}점
            {' / 후보 평균 '}
            {fmt(biggestWeakness.average)}점
            {' ('}
            {fmt(biggestWeakness.difference)}점{')'}
          </p>
        ) : (
          <p>후보 평균 대비 낮은 평가요소가 없습니다.</p>
        )}
      </div>

      {/* 개별 공간 주요 변화 요약 */}
      <h3>선택 공간 주요 변화 분석</h3>

      <div className="whatif-summary-card">
        <b>
          {backendSummary
            ? 'AI 주요 변화 분석'
            : 'Mock 데이터 기반 정량 요약'}
        </b>

        <p>{backendSummary || mockSummary}</p>
      </div>

      {!backendSummary && (
        <p className="whatif-warning">
          현재 실제 LLM 분석이 아닌 Mock 추천 데이터 기반
          설명입니다. 정확한 Hard Filter 진입 원인과
          지역별 특성 분석은 Backend 연동 후 제공됩니다.
        </p>
      )}
    </div>
  );
}

// ============================================================
// 6. 메인 What-if 페이지
// ============================================================

export default function WhatIfAnalysis({
  baseline,
  onBack,
  onApply,
}) {
  const [hard, setHard] = useState(() =>
    copyHard(baseline.hard_filters)
  );

  const [soft, setSoft] = useState(() =>
    copySoft(baseline.soft_filters)
  );

  const [mode, setMode] = useState('conditions');
  const [scenario, setScenario] = useState(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const request = useMemo(
    () => makePayload(baseline, hard, soft),
    [baseline, hard, soft]
  );

  const hasChanges = Boolean(
    request.modified_hard_filters ||
    request.modified_soft_filters
  );

  // ----------------------------------------------------------
  // 6-1. Hard Filter 변경
  // ----------------------------------------------------------

  const changeHard = (key, value) => {
    const next = { ...hard, [key]: value };

    if (
      key === 'start_date' &&
      next.end_date &&
      value > next.end_date
    ) {
      next.end_date = '';
    }

    setHard(next);

    setSoft((previous) => {
      const kept = previous.selected.filter((id) =>
        isEligible(id, next)
      );

      const auto = [
        'target_ratio',
        'brand_space_fit',
        'popup_history',
        'area_fit',
      ].filter(
        (id) =>
          !isEligible(id, hard) &&
          isEligible(id, next) &&
          !kept.includes(id)
      );

      const selected = [...kept, ...auto];

      return {
        selected,
        importance_gaps: normalizeGaps(
          selected,
          previous.importance_gaps
        ),
      };
    });

    setScenario(null);
    setSelectedSpaceId(null);
    setError('');
  };

  const toggleArrayValue = (key, item, max) => {
    const previous = hard[key] || [];

    const next = previous.includes(item)
      ? previous.filter((value) => value !== item)
      : [...previous, item];

    if (max && next.length > max) {
      setError(`최대 ${max}개까지 선택할 수 있어요.`);
      return;
    }

    changeHard(key, next);
  };

  // ----------------------------------------------------------
  // 6-2. Soft Filter 변경
  // ----------------------------------------------------------

  const toggleCriterion = (id) => {
    if (!isEligible(id, hard)) return;

    const selected = soft.selected.includes(id)
      ? soft.selected.filter((x) => x !== id)
      : [...soft.selected, id];

    setSoft({
      selected,
      importance_gaps: normalizeGaps(
        selected,
        soft.importance_gaps
      ),
    });

    setScenario(null);
    setSelectedSpaceId(null);
    setError('');
  };

  const moveCriterion = (index, direction) => {
    const nextIndex = index + direction;

    if (
      nextIndex < 0 ||
      nextIndex >= soft.selected.length
    ) {
      return;
    }

    const selected = [...soft.selected];

    [selected[index], selected[nextIndex]] = [
      selected[nextIndex],
      selected[index],
    ];

    setSoft({ ...soft, selected });
    setScenario(null);
    setSelectedSpaceId(null);
    setError('');
  };

  const changeGap = (index, value) => {
    setSoft((prev) => ({
      ...prev,
      importance_gaps: prev.importance_gaps.map(
        (gap, i) => (i === index ? +value : gap)
      ),
    }));

    setScenario(null);
    setSelectedSpaceId(null);
    setError('');
  };

  // ----------------------------------------------------------
  // 6-3. 초기화 및 분석
  // ----------------------------------------------------------

  const reset = () => {
    setHard(copyHard(baseline.hard_filters));
    setSoft(copySoft(baseline.soft_filters));
    setScenario(null);
    setSelectedSpaceId(null);
    setError('');
  };

  const analyze = async () => {
    const validationMessage = validate(hard, soft);

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    if (!hasChanges) {
      setError(
        '기존 조건과 다른 값을 최소 1개 변경해 주세요.'
      );
      return;
    }

    setError('');
    setLoading(true);
    setScenario(null);
    setSelectedSpaceId(null);

    try {
      const next = await createWhatIfAnalysis(
        request,
        baseline
      );

      setScenario(next);

      // 변경 후 첫 번째 추천 공간을 기본 선택
      const firstSpace =
        next?.updated_recommendation?.recommendations?.[0];

      setSelectedSpaceId(firstSpace?.space_id ?? null);
    } catch (e) {
      setError(
        e.message || '분석 결과를 불러오지 못했습니다.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------------
  // 6-4. 전후 추천 결과 구성
  // ----------------------------------------------------------

  const baselineTop = [
    ...(baseline.recommendations || []),
  ]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, TOP_RANK_COUNT);

  const updatedRecommendation =
    scenario?.updated_recommendation;

  const afterTop = [
    ...(updatedRecommendation?.recommendations || []),
  ]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, TOP_RANK_COUNT);

  const beforeById = new Map(
    (baseline.recommendations || []).map((s) => [
      String(s.space_id),
      s,
    ])
  );

  const afterById = new Map(
    (updatedRecommendation?.recommendations || []).map(
      (s) => [String(s.space_id), s]
    )
  );

  const selectedId =
    selectedSpaceId == null
      ? null
      : String(selectedSpaceId);

  const selectedSpace = afterById.get(selectedId);
  const oldSelectedSpace = beforeById.get(selectedId);

  const newTopCount = afterTop.filter(
    (space) => !beforeById.has(String(space.space_id))
  ).length;

  const totalDelta =
    scenario?.candidate_comparison?.difference ?? 0;

  const retainedTopCount = baselineTop.filter(
    (space) =>
      afterById.has(String(space.space_id)) &&
      afterById.get(String(space.space_id)).rank <=
        TOP_RANK_COUNT
  ).length;

  // ==========================================================
  // 7. 화면
  // ==========================================================

  return (
    <section className="whatif-page">

      {/* 페이지 제목 */}
      <div className="whatif-topline">
        <div>
          <span className="whatif-kicker">
            AI 의사결정 도우미 · STEP 04
          </span>

          <h1>조건·선호 변경 (What-if)</h1>

          <p>
            기존 출점 조건을 수정하고 추천 후보와 순위가
            어떻게 달라지는지 비교해 보세요.
          </p>
        </div>

        <button
          className="whatif-back"
          type="button"
          onClick={onBack}
        >
          ← 추천 결과로 돌아가기
        </button>
      </div>

      <div className="whatif-demo-note">
        <b>MOCK DEMO</b>
        실제 예약 가능 여부와 AI 해석이 아닌 시연용
        분석입니다. 후보 수는 현재 Mock 엔진의 지역·등록
        가격 기준을 사용합니다.
      </div>

      <div className="whatif-grid">

        {/* ================================================== */}
        {/* 1번 박스: 조건 변경 */}
        {/* ================================================== */}

        <section className="whatif-panel whatif-editor">

          <div className="whatif-section-heading">
            <span className="whatif-step-dot">1</span>
            <div>
              <h2>조건 변경</h2>
              <p>변경하고 싶은 항목을 수정하세요.</p>
            </div>
          </div>

          <div
            className="whatif-tabs"
            role="tablist"
            aria-label="변경 조건 선택"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'conditions'}
              className={
                mode === 'conditions' ? 'active' : ''
              }
              onClick={() => setMode('conditions')}
            >
              출점 조건 변경
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'priority'}
              className={
                mode === 'priority' ? 'active' : ''
              }
              onClick={() => setMode('priority')}
            >
              가중치 조정
            </button>
          </div>

          {mode === 'conditions' ? (
            <div
              className="whatif-fields"
              role="tabpanel"
            >

              {/* 예산 */}
              <label className="whatif-field">
                <span>
                  최대 예산 <small>(만원)</small>
                </span>

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={
                    Number(hard.max_budget_krw || 0) / 10000
                  }
                  onChange={(e) =>
                    changeHard(
                      'max_budget_krw',
                      Number(e.target.value) * 10000
                    )
                  }
                />
              </label>

              {/* 지역 */}
              <div className="whatif-field">
                <span>
                  희망 지역 <small>(최대 3개)</small>
                </span>

                <div className="whatif-check-grid">
                  {REGIONS.map((region) => (
                    <label key={region}>
                      <input
                        type="checkbox"
                        checked={hard.region_ids.includes(
                          region
                        )}
                        onChange={() =>
                          toggleArrayValue(
                            'region_ids',
                            region,
                            3
                          )
                        }
                      />
                      {region}
                    </label>
                  ))}
                </div>
              </div>

              {/* 운영 기간 */}
              <div className="whatif-field">
                <span>운영 기간</span>

                <div className="whatif-field-pair">
                  <label>
                    <small>시작일</small>
                    <input
                      type="date"
                      min={today()}
                      value={hard.start_date || ''}
                      onChange={(e) =>
                        changeHard(
                          'start_date',
                          e.target.value
                        )
                      }
                    />
                  </label>

                  <label>
                    <small>종료일</small>
                    <input
                      type="date"
                      min={hard.start_date || today()}
                      value={hard.end_date || ''}
                      onChange={(e) =>
                        changeHard(
                          'end_date',
                          e.target.value
                        )
                      }
                    />
                  </label>
                </div>
              </div>

              {/* 면적 */}
              <div className="whatif-field">
                <span>
                  희망 면적 <small>(평)</small>
                </span>

                <div className="whatif-field-pair">
                  <label>
                    <small>최소</small>
                    <input
                      type="number"
                      min="0"
                      max="5000"
                      value={hard.area_min_pyeong}
                      onChange={(e) =>
                        changeHard(
                          'area_min_pyeong',
                          Number(e.target.value)
                        )
                      }
                    />
                  </label>

                  <label>
                    <small>최대</small>
                    <input
                      type="number"
                      min="0"
                      max="5000"
                      value={hard.area_max_pyeong}
                      onChange={(e) =>
                        changeHard(
                          'area_max_pyeong',
                          Number(e.target.value)
                        )
                      }
                    />
                  </label>
                </div>
              </div>

              {/* 타깃 고객 */}
              <div className="whatif-field">
                <span>
                  타깃 고객 <small>(다중 선택)</small>
                </span>

                <details className="whatif-disclosure">
                  <summary>
                    {hard.target_customers.length
                      ? hard.target_customers
                          .map(
                            (id) =>
                              TARGETS.find(
                                (x) => x.value === id
                              )?.label || id
                          )
                          .join(', ')
                      : '선택 안 함 · 클릭하여 변경'}
                  </summary>

                  <div className="whatif-check-grid">
                    {TARGETS.map((item) => (
                      <label key={item.value}>
                        <input
                          type="checkbox"
                          checked={hard.target_customers.includes(
                            item.value
                          )}
                          onChange={() =>
                            toggleArrayValue(
                              'target_customers',
                              item.value
                            )
                          }
                        />
                        {item.label}
                      </label>
                    ))}
                  </div>
                </details>
              </div>

              {/* 카테고리 */}
              <label className="whatif-field">
                <span>브랜드 카테고리</span>

                <select
                  value={hard.category_id || ''}
                  onChange={(e) =>
                    changeHard(
                      'category_id',
                      e.target.value || null
                    )
                  }
                >
                  <option value="">선택 안 함</option>

                  {CATEGORIES.map((category) => (
                    <option
                      key={category}
                      value={category}
                    >
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              {/* 브랜드 URL */}
              <label className="whatif-field">
                <span>브랜드 공식 홈페이지 URL</span>

                <input
                  type="url"
                  placeholder="https://example.com"
                  value={hard.brand_url || ''}
                  onChange={(e) =>
                    changeHard(
                      'brand_url',
                      e.target.value || null
                    )
                  }
                />
              </label>

              <p className="whatif-input-note">
                희망 면적은 후보 제외 조건이 아니라 점수
                계산에 사용해요. 운영 기간은 Mock에서
                예약 가능 여부를 검증하지 않아요.
              </p>
            </div>
          ) : (
            <div
              className="whatif-priorities"
              role="tabpanel"
            >
              <p className="whatif-input-note">
                평가요소를 선택하고 ↑↓로 순서를
                변경하세요. 중요도 차이는 바로 아래
                순위와의 차이예요.
              </p>

              {[
                ...soft.selected,
                ...FACTOR_ORDER.filter(
                  (id) => !soft.selected.includes(id)
                ),
              ].map((id) => {
                const index = soft.selected.indexOf(id);
                const active = index !== -1;
                const eligible = isEligible(id, hard);

                return (
                  <div
                    className={`whatif-priority-row ${
                      active ? 'is-active' : ''
                    }`}
                    key={id}
                  >
                    <label>
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={!eligible}
                        onChange={() =>
                          toggleCriterion(id)
                        }
                      />

                      <span>
                        {active
                          ? `${index + 1}위 · `
                          : ''}
                        {FACTOR_LABELS[id]}
                      </span>
                    </label>

                    {!eligible && (
                      <small>관련 조건 입력 필요</small>
                    )}

                    {active && (
                      <div className="whatif-priority-controls">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() =>
                            moveCriterion(index, -1)
                          }
                        >
                          ↑
                        </button>

                        <button
                          type="button"
                          disabled={
                            index ===
                            soft.selected.length - 1
                          }
                          onClick={() =>
                            moveCriterion(index, 1)
                          }
                        >
                          ↓
                        </button>

                        {index <
                          soft.selected.length - 1 && (
                          <select
                            value={
                              soft.importance_gaps[index] ??
                              1
                            }
                            onChange={(e) =>
                              changeGap(
                                index,
                                e.target.value
                              )
                            }
                          >
                            {GAP_LABELS.map((label, i) => (
                              <option
                                key={label}
                                value={i}
                              >
                                {label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="whatif-editor-actions">
            <button
              className="whatif-reset"
              type="button"
              onClick={reset}
            >
              초기화
            </button>

            <button
              className="whatif-primary"
              type="button"
              disabled={loading}
              onClick={analyze}
            >
              {loading ? '분석 중…' : '분석 시작 →'}
            </button>
          </div>

          {error && (
            <p className="whatif-error" role="alert">
              {error}
            </p>
          )}

          <details className="whatif-json">
            <summary>API 요청 JSON 확인</summary>
            <pre>{JSON.stringify(request, null, 2)}</pre>
          </details>
        </section>

        {/* ================================================== */}
        {/* 2번 박스: 추천 결과 */}
        {/* ================================================== */}

        <section className="whatif-panel whatif-results">

          <div className="whatif-section-heading">
            <span className="whatif-step-dot">2</span>
            <div>
              <h2>조건 변경 결과</h2>
              <p>기준 결과와 변경 결과를 비교해요.</p>
            </div>
          </div>

          <div className="whatif-candidate-summary">
            <span>추천 후보 변화</span>

            <div>
              <b>
                {baseline.total_candidates.toLocaleString(
                  'ko-KR'
                )}
                개
              </b>

              <span>→</span>

              <strong>
                {scenario
                  ? scenario.candidate_comparison.after.toLocaleString(
                      'ko-KR'
                    )
                  : '—'}
                개
              </strong>
            </div>

            <small>
              {scenario
                ? `${formatDelta(totalDelta)}개 · 신규 ${
                    scenario.rank_changes.filter(
                      (r) => r.before_rank == null
                    ).length
                  }개 / 제외 ${
                    scenario.rank_changes.filter(
                      (r) => r.after_rank == null
                    ).length
                  }개`
                : '조건을 수정한 다음 분석 시작을 눌러 주세요.'}
            </small>
          </div>

          <h3>TOP {TOP_RANK_COUNT} 추천 변화</h3>

          {!scenario ? (
            <>
              <p className="whatif-muted">
                변경 전 상위 {TOP_RANK_COUNT}개 공간
              </p>

              {baselineTop.map((space) => (
                <SpacePreview
                  key={space.space_id}
                  space={space}
                  current={space.final_score}
                />
              ))}
            </>
          ) : afterTop.length ? (
            afterTop.map((space) => {
              const old = beforeById.get(
                String(space.space_id)
              );

              const oldRank = old?.rank;

              const status = !old
                ? 'NEW'
                : oldRank === space.rank
                ? '유지'
                : `${oldRank}위 → ${space.rank}위`;

              return (
                <SpacePreview
                  key={space.space_id}
                  space={space}
                  previous={old?.final_score}
                  current={space.final_score}
                  status={status}
                  selected={
                    selectedId ===
                    String(space.space_id)
                  }
                  onSelect={() =>
                    setSelectedSpaceId(space.space_id)
                  }
                />
              );
            })
          ) : (
            <div className="whatif-zero">
              새로운 조건에 맞는 후보 공간이 없어요.
              예산 또는 지역을 다시 조정해 보세요.
            </div>
          )}

          {scenario && (
            <>
              <p className="whatif-subnote">
                변경 전 TOP {TOP_RANK_COUNT}에서 변경 후
                TOP {TOP_RANK_COUNT}에 남아 있는 공간:
                {' '}
                {retainedTopCount}개
                {' · '}
                신규 후보 중 TOP {TOP_RANK_COUNT} 진입:
                {' '}
                {newTopCount}개
              </p>

              <ScenarioChanges
                baseline={baseline}
                result={scenario}
              />
            </>
          )}
        </section>

        {/* ================================================== */}
        {/* 3번 박스: 변화 요인 분석 */}
        {/* ================================================== */}

        <section className="whatif-panel whatif-impacts">

          <div className="whatif-section-heading">
            <span className="whatif-step-dot">3</span>
            <div>
              <h2>변화 요인 분석</h2>
              <p>
                어떤 조건이 변경 결과에 영향을
                주었을까요?
              </p>
            </div>
          </div>

          {!scenario ? (
            <div className="whatif-waiting">
              <span>◇</span>

              <strong>
                변경 조건 분석 대기 중
              </strong>

              <p>
                왼쪽에서 조건을 수정하고 분석을
                시작하면 주요 변화가 표시됩니다.
              </p>
            </div>
          ) : (
            <>
              {/* 3-1. 전체 변화 요약 */}
              <h3>전체 변화 요약</h3>

              <div className="whatif-summary-card">
                <b>
                  {scenario.overall_analysis?.summary ||
                  scenario.overall_summary
                    ? 'AI 전체 변화 분석'
                    : 'Mock 변화 요약'}
                </b>

                <p>
                  {scenario.overall_analysis?.summary ||
                    scenario.overall_summary ||
                    scenario.summary}
                </p>
              </div>

              {/* 3-2. 조건별 후보 수 변화 */}
            
{/* Hard Filter별 후보 수 변화 */}
<h3>Hard Filter별 후보 수 변화</h3>

<p className="whatif-subnote">
  예산·운영 기간·희망 지역 변경에 따른 후보 수 변화를
  비교합니다. 각 조건을 단독 변경한 결과이므로
  전체 증감량과 합산값이 다를 수 있습니다.
</p>

{(() => {
  const impacts = scenario.factor_impacts || [];

  const findImpact = (key) =>
    impacts.find((item) => item.factor === key);

  const budgetImpact = findImpact("max_budget_krw");
  const regionImpact = findImpact("region_ids");

  const periodChanged = Boolean(
    scenario.changed_conditions?.start_date ||
    scenario.changed_conditions?.end_date
  );

  // 운영 기간은 현재 Mock에서 가용성 미검증.
  // 0은 실제 가용성 분석 결과가 아닌 Mock 미반영 상태.
  const periodValue =
    scenario.period_impact?.candidate_change ?? 0;

  const hardImpacts = [
    {
      key: "budget",
      label: "최대 예산",
      value: budgetImpact?.candidate_change ?? 0,
      note: budgetImpact ? "" : "조건 변경 없음",
    },
    {
      key: "period",
      label: "운영 기간",
      value: periodValue,
      note:
        periodChanged &&
        scenario.period_impact?.candidate_change == null
          ? "Mock 예약 가능 여부 미반영"
          : "",
    },
    {
      key: "region",
      label: "희망 지역",
      value: regionImpact?.candidate_change ?? 0,
      note: regionImpact ? "" : "조건 변경 없음",
    },
  ];

  const maxAbs = Math.max(
    1,
    ...hardImpacts.map((item) => Math.abs(item.value))
  );

  return (
    <div className="whatif-diverging-list">
      {hardImpacts.map((item) => {
        const value = Number(item.value);
        const width =
          (Math.abs(value) / maxAbs) * 100;

        return (
          <div
            className="whatif-diverging-item"
            key={item.key}
          >
            <div className="whatif-diverging-heading">
              <strong>{item.label}</strong>

              <span
                className={
                  value > 0
                    ? "positive"
                    : value < 0
                    ? "negative"
                    : "neutral"
                }
              >
                {value > 0
                  ? `+${value}개 증가`
                  : value < 0
                  ? `${value}개 감소`
                  : "변화 없음"}
              </span>
            </div>

            <div className="whatif-diverging-chart">
              <div className="whatif-diverging-half left">
                {value < 0 && (
                  <div
                    className="whatif-diverging-fill negative"
                    style={{ width: `${width}%` }}
                  />
                )}
              </div>

              <div className="whatif-diverging-half right">
                {value > 0 && (
                  <div
                    className="whatif-diverging-fill positive"
                    style={{ width: `${width}%` }}
                  />
                )}
              </div>
            </div>

            {item.note && (
              <p className="whatif-diverging-note">
                {item.note}
              </p>
            )}
          </div>
        );
      })}

      <div className="whatif-diverging-axis">
        <span>← 후보 감소</span>
        <span>후보 증가 →</span>
      </div>
    </div>
  );
})()}


              {/* 3-3. 선택 공간 상세 분석 */}
              <h3>선택 공간의 평가요소별 변화</h3>

              <SelectedSpaceAnalysis
                key={String(selectedSpaceId ?? '')}
                space={selectedSpace}
                oldSpace={oldSelectedSpace}
                baseline={baseline}
                updated={updatedRecommendation}
                scenario={scenario}
              />

              <p className="whatif-warning">
                현재 Mock 결과는 등록 가격·지역에
                따른 후보 수 변화를 반영하며,
                실시간 예약 여부와 공식 CSR/NLI 및
                LLM 분석 결과는 아닙니다.
              </p>

              <details className="whatif-json">
                <summary>분석 API 응답 JSON 확인</summary>

                <pre>
                  {JSON.stringify(
                    {
                      ...scenario,
                      updated_recommendation: {
                        ...updatedRecommendation,
                        recommendations:
                          updatedRecommendation?.recommendations?.slice(
                            0,
                            TOP_RANK_COUNT
                          ),
                      },
                      rank_changes:
                        scenario.rank_changes?.slice(
                          0,
                          10
                        ),
                    },
                    null,
                    2
                  )}
                </pre>
              </details>
            </>
          )}

          {/* 변경 결과 적용 */}
          <div className="whatif-bottom-actions">
            <button
              className="whatif-reset"
              type="button"
              onClick={onBack}
            >
              기존 추천 결과
            </button>

            <button
              className="whatif-primary"
              type="button"
              disabled={
                !scenario?.updated_recommendation ||
                loading
              }
              onClick={() =>
                onApply(
                  scenario.updated_recommendation
                )
              }
            >
              새 추천 결과 적용 →
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
