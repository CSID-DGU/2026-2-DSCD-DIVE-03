import { useEffect, useMemo, useState } from 'react';
import {
  createWhatIfAnalysis,
  explainWhatIfSpace,
} from '../services/whatIf';
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
  popup_history_direction: soft.popup_history_direction || 'frequent',
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
  // 선호 방향이 없는 이전 추천 결과도 기본값(frequent)으로 비교합니다.
  // 방향만 변경해도 modified_soft_filters가 생성되며,
  // 처음 화면에 진입했다고 무조건 변경된 것으로 처리되지 않습니다.
  const baseSoft = copySoft(baseline.soft_filters || {});
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


function StructuredAnalysis({ text, type = "overall" }) {
  if (!text) return null;

  const configs = {
    overall: {
      "후보 구성": { icon: "📊", title: "후보 구성 변화" },
      "조건 영향": { icon: "⚙️", title: "주요 조건 영향" },
      "중요도·지역": { icon: "📍", title: "중요도 및 지역 특성" },
      "TOP 5 변화": { icon: "🏆", title: "상위 추천 변화" },
    },
    space: {
      "추천 변화": { icon: "📈", title: "추천 결과 변화" },
      "상대적 강점": { icon: "✅", title: "상대적 강점" },
      "주요 기여 요인": { icon: "🎯", title: "주요 기여 요인" },
      "종합 해석": { icon: "💡", title: "종합 해석" },
    },
  };

  const config = configs[type] || configs.overall;

  const sections = String(text)
    .split(/\r?\n/)
    .map((line) => {
      const match = line.trim().match(/^\[([^\]]+)\]\s*(.+)$/);

      if (!match) return null;

      const key = match[1].trim();
      const content = match[2].trim();

      if (!config[key] || !content) return null;

      return {
        key,
        content,
        ...config[key],
      };
    })
    .filter(Boolean);

  // 기존에 생성된 긴 설명이나 형식이 다른 응답도 표시
  if (sections.length === 0) {
    return (
      <p style={{
        margin: 0,
        lineHeight: 1.75,
        fontSize: 14,
        color: "#475569",
        whiteSpace: "pre-line",
      }}>
        {text}
      </p>
    );
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      {sections.map((section) => (
        <div
          key={section.key}
          style={{
            display: "flex",
            gap: 12,
            padding: "13px 15px",
            background: "#ffffff",
            border: "1px solid #e7e9f4",
            borderRadius: 10,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              fontSize: 17,
              flexShrink: 0,
              lineHeight: 1.5,
            }}
          >
            {section.icon}
          </span>

          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#333b55",
              marginBottom: 5,
            }}>
              {section.title}
            </div>

            <p style={{
              margin: 0,
              fontSize: 13,
              lineHeight: 1.7,
              color: "#64748b",
              overflowWrap: "anywhere",
            }}>
              {section.content}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}


function SelectedSpaceAnalysis({
  space,
  oldSpace,
  baseline,
  updated,
  scenario,
  llmSummary,
  llmLoading,
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

  
const spaceAnalysis =
  scenario?.space_analyses?.[String(space.space_id)];

const backendSummary =
  llmSummary?.summary ??
  spaceAnalysis?.summary ??
  null;

const isLLMSummary =
  llmSummary?.summary_type === 'llm';


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

{(() => {
  // 위의 '가중 기여도' 그래프와 동일한 계산 결과를 그대로 재사용합니다.
  // topContributors는 getContribution()을 사용해 산출한 변경 후 기여도순 목록입니다.
  const validContributors = topContributors
    .filter((item) => Number.isFinite(item.after))
    .slice(0, 2);

  const strengths = [...relativeFactors]
    .filter((item) => item.difference > 0)
    .sort((a, b) => b.difference - a.difference)
    .slice(0, 2);

  const weaknesses = [...relativeFactors]
    .filter((item) => item.difference < 0)
    .sort((a, b) => a.difference - b.difference)
    .slice(0, 2);

  const getInterpretation = (text) => {
    const lines = String(text || "").split(/\r?\n/);

    const line = lines.find((item) =>
      item.trim().startsWith("[종합 해석]")
    );

    return line
      ? line.replace(/^\s*\[종합 해석\]\s*/, "").trim()
      : "";
  };

  const interpretation = getInterpretation(
    llmSummary?.summary
  );

  const fallback = isNew
    ? `변경 후 ${space.rank}위로 신규 진입했습니다. 평가요소별 강점과 가중 기여도를 함께 확인할 수 있습니다.`
    : `종합점수 변화와 추천 순위 변화는 일치하지 않을 수 있습니다. 다른 후보들의 진입·이탈과 상대적 점수 변화도 고려해야 합니다.`;

  const smallTitle = {
    fontSize: 13,
    fontWeight: 700,
    marginBottom: 8,
  };

  const rowStyle = {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 13,
    padding: "5px 0",
  };

  return (
    <div className="whatif-summary-card">
      <b>선택 공간 정량 분석</b>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 14,
        margin: "16px 0",
      }}>
        <div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            추천 순위
          </div>
          <strong style={{ fontSize: 19 }}>
            {isNew
              ? `신규 진입 · ${space.rank}위`
              : `${oldSpace.rank}위 → ${space.rank}위`}
          </strong>
        </div>

        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            종합 적합도
          </div>
          <strong style={{ fontSize: 19 }}>
            {isNew
              ? `${fmt(space.final_score)}점`
              : `${fmt(oldSpace.final_score)} → ${fmt(space.final_score)}점`}
          </strong>
        </div>
      </div>

      <div style={{
        borderTop: "1px solid #e8eaf3",
        paddingTop: 14,
      }}>
        <div style={smallTitle}>✅ 상대적 강점</div>

        {strengths.length ? strengths.map((item) => (
          <div key={item.key} style={rowStyle}>
            <span>{FACTOR_LABELS[item.key] || item.key}</span>
            <strong style={{ color: "#16a34a" }}>
              평균 대비 +{fmt(item.difference)}점
            </strong>
          </div>
        )) : (
          <p style={{ fontSize: 13 }}>
            후보 평균보다 높은 평가요소 없음
          </p>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={smallTitle}>⚠️ 상대적 약점</div>

        {weaknesses.length ? weaknesses.map((item) => (
          <div key={item.key} style={rowStyle}>
            <span>{FACTOR_LABELS[item.key] || item.key}</span>
            <strong style={{ color: "#e11d48" }}>
              평균 대비 {fmt(item.difference)}점
            </strong>
          </div>
        )) : (
          <p style={{ fontSize: 13 }}>
            후보 평균보다 낮은 평가요소 없음
          </p>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={smallTitle}>
          🎯 종합점수 주요 기여 요소
        </div>

        {validContributors.length ? (
          validContributors.map((item) => (
            <div key={item.key} style={rowStyle}>
              <span>
                {FACTOR_LABELS[item.key] || item.key}
                {item.before != null && Number.isFinite(item.before)
                  ? ` · 변경 전 ${fmt(item.before)}점`
                  : ''}
              </span>

              <strong>
                기여 {fmt(item.after)}점
                {item.delta != null && Number.isFinite(item.delta)
                  ? ` (${Math.abs(item.delta) < 0.05
                      ? '변화 없음'
                      : `${item.delta > 0 ? '+' : ''}${fmt(item.delta)}점`})`
                  : ''}
              </strong>
            </div>
          ))
        ) : (
          <p style={{ fontSize: 13 }}>
            표시할 가중 기여도 데이터가 없습니다.
          </p>
        )}
      </div>

      <div style={{
        borderTop: "1px solid #e8eaf3",
        paddingTop: 14,
        marginTop: 14,
      }}>
        <div style={smallTitle}>💡 AI 핵심 해석</div>
        <p style={{
          fontSize: 13,
          color: "#475569",
          lineHeight: 1.7,
          margin: 0,
        }}>
          {llmLoading
            ? "주요 변화 요인을 분석하고 있습니다."
            : interpretation || fallback}
        </p>
      </div>
    </div>
  );
})()}



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
  const [popupHistoryHelp, setPopupHistoryHelp] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [spaceSummaries, setSpaceSummaries] = useState({});
  const [spaceLLMLoading, setSpaceLLMLoading] = useState(false);
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
        ...previous,
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
      ...soft,
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

  // 개최 이력의 평가 방향만 변경해도 What-if 분석 대상으로 인식합니다.
  // 나머지 Soft Filter 및 CSR 순위/중요도 차이는 그대로 유지합니다.
  const changePopupHistoryDirection = (direction) => {
    if (!['frequent', 'rare'].includes(direction)) return;
    if (!soft.selected.includes('popup_history')) return;
    if (soft.popup_history_direction === direction) return;

    setSoft((previous) => ({
      ...previous,
      popup_history_direction: direction,
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
  
useEffect(() => {
  const scenarioId = scenario?.scenario_id;

  if (!scenarioId || selectedSpaceId == null) {
    return;
  }

  const sid = String(selectedSpaceId);
  const key = `${scenarioId}:${sid}`;

  // 이미 분석한 공간은 다시 요청하지 않음
  if (spaceSummaries[key]) {
    setSpaceLLMLoading(false);
    return;
  }

  let cancelled = false;

  const fetchExplanation = async () => {
    setSpaceLLMLoading(true);

    try {
      const result = await explainWhatIfSpace(
        scenarioId,
        sid
      );

      if (!cancelled) {
        setSpaceSummaries((prev) => ({
          ...prev,
          [key]: result,
        }));
      }
    } catch (error) {
      console.error(
        '선택 공간 LLM 분석 실패:',
        error
      );
    } finally {
      if (!cancelled) {
        setSpaceLLMLoading(false);
      }
    }
  };

  fetchExplanation();

  return () => {
    cancelled = true;
  };
}, [scenario?.scenario_id, selectedSpaceId, spaceSummaries]);

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
            </div>
          ) : (
            <div
              className="whatif-priorities"
              role="tabpanel"
            >
              <p className="whatif-input-note whatif-priority-instructions">
                평가요소를 선택하고 ↑↓로 순서를 변경하세요. 중요도 차이는 바로 아래 순위와의 차이예요.
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

                    {id === 'popup_history' && active && eligible && (
                      <div
                        className="whatif-popup-history-direction"
                        role="group"
                        aria-label="동종 팝업 개최 이력 선호 방향"
                      >
                        <div className="whatif-popup-history-title">
                          <strong>개최 빈도 선호 방향</strong>
                          <span>두 방향 중 하나를 선택하세요.</span>
                        </div>

                        <div className="whatif-popup-history-options">
                          {[
                            {
                              value: 'frequent',
                              label: '많이 개최',
                              detail: '유사 업종의 기존 입지 선택 경향을 간접적으로 참고하고 싶을 때 선택해요.',
                            },
                            {
                              value: 'rare',
                              label: '적게 개최',
                              detail: '동종 팝업 개최 사례가 상대적으로 드문 지역에서 차별성과 희소성을 고려하고 싶을 때 선택해요.',
                            },
                          ].map((option) => (
                            <div
                              className={`whatif-popup-history-option ${
                                soft.popup_history_direction === option.value
                                  ? 'is-selected'
                                  : ''
                              }`}
                              key={option.value}
                            >
                              <button
                                type="button"
                                className="whatif-popup-history-select"
                                aria-pressed={
                                  soft.popup_history_direction === option.value
                                }
                                onClick={() =>
                                  changePopupHistoryDirection(option.value)
                                }
                              >
                                <span className="whatif-popup-history-radio" aria-hidden="true" />
                                {option.label}
                              </button>

                              <button
                                type="button"
                                className="whatif-popup-history-info"
                                aria-label={`${option.label} 설명 보기`}
                                aria-expanded={popupHistoryHelp === option.value}
                                onClick={() =>
                                  setPopupHistoryHelp((prev) =>
                                    prev === option.value ? null : option.value
                                  )
                                }
                              >
                                ⓘ
                              </button>
                            </div>
                          ))}
                        </div>

                        {popupHistoryHelp && (
                          <p className="whatif-popup-history-help" role="status">
                            {popupHistoryHelp === 'frequent'
                              ? '유사 업종의 기존 입지 선택 경향을 간접적으로 참고하고 싶을 때 선택해요.'
                              : '동종 팝업 개최 사례가 상대적으로 드문 지역에서 차별성과 희소성을 고려하고 싶을 때 선택해요.'}
                          </p>
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

{(() => {
  const impacts = (scenario.factor_impacts || [])
    .filter((item) =>
      item.changed &&
      Number.isFinite(Number(item.candidate_change))
    );

  const positive = [...impacts]
    .filter((item) => Number(item.candidate_change) > 0)
    .sort((a, b) => b.candidate_change - a.candidate_change)[0];

  const negative = [...impacts]
    .filter((item) => Number(item.candidate_change) < 0)
    .sort((a, b) => a.candidate_change - b.candidate_change)[0];

  const beforeTop5 = (baseline?.recommendations || [])
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);

  const afterTop5 = (
    scenario.updated_recommendation?.recommendations || []
  )
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);

  const beforeIds = new Set(
    beforeTop5.map((item) => String(item.space_id))
  );

  const retained = afterTop5.filter((item) =>
    beforeIds.has(String(item.space_id))
  ).length;

  const newCount = afterTop5.length - retained;

  const rawSummary =
    scenario.overall_analysis?.summary ||
    scenario.overall_summary ||
    scenario.summary ||
    "";

  const lines = String(rawSummary)
    .split(/\r?\n/)
    .map((line) => line.trim());

  const interpretation =
    lines.find((line) => line.startsWith("[조건 영향]"))
      ?.replace(/^\[조건 영향\]\s*/, "")
    || lines.find((line) => line.startsWith("[TOP 5 변화]"))
      ?.replace(/^\[TOP 5 변화\]\s*/, "")
    || "";

  const comparison = scenario.candidate_comparison || {};

  const difference = Number(comparison.after) -
    Number(comparison.before);

  const factorText =
    positive && negative
      ? `${positive.label} 단독 변경은 후보 확대 방향으로, ${negative.label} 단독 변경은 후보 축소 방향으로 나타났습니다.`
      : positive
        ? `${positive.label} 단독 변경 시 후보가 증가했습니다.`
        : negative
          ? `${negative.label} 단독 변경 시 후보가 감소했습니다.`
          : "변경된 조건의 단독 영향 분석을 확인해 보세요.";

  const fallback = Number.isFinite(difference)
    ? `${factorText} 모든 조건을 함께 변경한 결과 후보 수는 ${Math.abs(difference)}개 ${difference > 0 ? "증가" : difference < 0 ? "감소" : "유지"}했습니다.`
    : factorText;

  const impactCard = (item, label) => (
    <div style={{
      flex: 1,
      minWidth: 170,
      padding: 15,
      borderRadius: 12,
      background: "#f7f8fc",
      border: "1px solid #e8eaf3",
    }}>
      <div style={{
        fontSize: 12,
        color: "#64748b",
        marginBottom: 7,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 6,
      }}>
        {item?.label || "해당 조건 없음"}
      </div>
      <div style={{
        fontSize: 23,
        fontWeight: 800,
        color: item
          ? Number(item.candidate_change) > 0
            ? "#16a34a"
            : "#e11d48"
          : "#94a3b8",
      }}>
        {item
          ? `${Number(item.candidate_change) > 0 ? "+" : ""}${item.candidate_change}개`
          : "—"}
      </div>
    </div>
  );

  return (
    <div className="whatif-summary-card">
      <b>AI 변화 요인 분석</b>

      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        marginTop: 14,
      }}>
        {impactCard(positive, "후보 확대 방향 단독 영향")}
        {impactCard(negative, "후보 축소 방향 단독 영향")}
      </div>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        padding: "14px 0",
        marginTop: 10,
        borderBottom: "1px solid #e8eaf3",
      }}>
        <span style={{ fontSize: 13 }}>TOP 5 구성 변화</span>
        <strong style={{ fontSize: 13 }}>
          {retained}개 유지 · {newCount}개 신규 진입
        </strong>
      </div>

      <div style={{ marginTop: 15 }}>
        <strong style={{ fontSize: 13 }}>
          💡 AI 핵심 해석
        </strong>
        <p style={{
          fontSize: 13,
          lineHeight: 1.7,
          margin: "8px 0 0",
          color: "#475569",
        }}>
          {interpretation || fallback}
        </p>
      </div>

      <p style={{
        fontSize: 11,
        color: "#94a3b8",
        marginTop: 12,
      }}>
        조건별 후보 변화는 기준 조건에서 하나씩 변경한 결과입니다.
      </p>
    </div>
  );
})()}


              {/* 3-2. 조건별 후보 수 변화 */}
            
{/* Hard Filter별 후보 수 변화 */}
<h3>Hard Filter별 후보 수 변화</h3>

<p className="whatif-subnote whatif-hard-filter-note">
  예산·운영 기간·희망 지역 변경에 따른 후보 수 변화를 비교합니다. 각 조건을 단독 변경한 결과이므로 전체 증감량과 합산값이 다를 수 있습니다.
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
                llmSummary={
                  spaceSummaries[
                    `${scenario?.scenario_id}:${String(selectedSpaceId)}`
                  ]
                }
                llmLoading={spaceLLMLoading}
              />
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
