import { useMemo, useState } from 'react';
import { createWhatIfAnalysis } from '../services/whatIf';
import { FACTOR_LABELS } from '../mocks/recommendations';
import './WhatIfAnalysis.css';

const REGIONS = ['성수', '강남·서초', '홍대·신촌', '종로·을지로·명동', '용산', '기타', '잠실'];
const CATEGORIES = ['패션', '애니/캐릭터', '뷰티', 'F&B', '라이프스타일', '연예인/셀럽', '엔터테인먼트', '기타', '문구/아트', '디지털/테크', '키즈/반려동물', '지역상생'];
const AGES = [
  ['0_9', '0~9세'], ['10s', '10대'], ['20s', '20대'], ['30s', '30대'],
  ['40s', '40대'], ['50s', '50대'], ['60s', '60대'], ['70plus', '70대 이상'],
];
const TARGETS = ['female', 'male'].flatMap((gender) => AGES.map(([code, age]) => ({
  value: `${gender}_${code}`, label: `${gender === 'female' ? '여성' : '남성'} ${age}`,
})));
const FACTOR_ORDER = ['target_ratio', 'brand_space_fit', 'popup_history', 'subway_accessibility', 'rental_price_fit', 'area_fit'];
const GAP_LABELS = ['비슷함', '조금 더 중요함', '더 중요함', '훨씬 더 중요함'];
const TOP_RANK_COUNT = 5; // What-if 변경 전후 추천 상위 5개 비교
const formatMoney = (value) => `${Number(value || 0).toLocaleString('ko-KR')}원`;
const formatDelta = (value) => `${value > 0 ? '+' : ''}${Number(value).toLocaleString('ko-KR')}`;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const copyHard = (hard = {}) => ({ ...hard, region_ids: [...(hard.region_ids || [])], target_customers: [...(hard.target_customers || [])] });
const copySoft = (soft = {}) => ({ selected: [...(soft.selected || [])], importance_gaps: [...(soft.importance_gaps || [])] });
const normalizeGaps = (items, gaps) => Array.from({ length: Math.max(0, items.length - 1) }, (_, i) => Number(gaps?.[i] ?? 1));
const isEligible = (id, hard) => {
  if (id === 'target_ratio') return (hard.target_customers || []).length > 0;
  if (id === 'brand_space_fit') return /^https?:\/\//i.test(hard.brand_url || '');
  if (id === 'popup_history') return Boolean(hard.category_id);
  return true;
};

function makePayload(baseline, hard, soft) {
  const baseHard = baseline.hard_filters;
  const baseSoft = baseline.soft_filters;
  const changedHard = {};
  for (const [key, value] of Object.entries(hard)) {
    if (!same(value, baseHard[key])) changedHard[key] = value;
  }
  const payload = { recommendation_id: baseline.recommendation_id };
  if (Object.keys(changedHard).length) payload.modified_hard_filters = changedHard;
  if (!same(soft, baseSoft)) payload.modified_soft_filters = soft;
  return payload;
}
function validate(hard, soft) {
  if (!Number.isFinite(Number(hard.max_budget_krw)) || Number(hard.max_budget_krw) <= 0) return '최대 예산은 0원보다 커야 합니다.';
  if (!(hard.region_ids || []).length || hard.region_ids.length > 3) return '지역은 1~3개 선택해 주세요.';
  if (!hard.start_date || !hard.end_date || hard.end_date < hard.start_date || hard.start_date < today()) return '운영 기간을 확인해 주세요. 시작일은 오늘 이후여야 합니다.';
  if (+hard.area_min_pyeong < 0 || +hard.area_max_pyeong < +hard.area_min_pyeong || +hard.area_max_pyeong > 5000) return '희망 면적은 0~5,000평 범위에서 최소값 이하가 되지 않도록 설정해 주세요.';
  if (hard.brand_url) {
    try {
      if (!['http:', 'https:'].includes(new URL(hard.brand_url).protocol)) return '브랜드 URL은 http 또는 https 형식이어야 합니다.';
    } catch { return '브랜드 URL을 확인해 주세요.'; }
  }
  if (!soft.selected.length) return 'Soft Filter를 최소 1개 선택해 주세요.';
  if (soft.selected.some((id) => !isEligible(id, hard))) return '선택된 평가요소에 필요한 기본 정보가 부족합니다.';
  if (soft.importance_gaps.length !== soft.selected.length - 1 || soft.importance_gaps.some((gap) => ![0, 1, 2, 3].includes(gap))) return '평가요소 사이 중요도 차이를 확인해 주세요.';
  return '';
}

function SpacePreview({ space, status, previous, current }) {
  if (!space) return null;
  return (
    <div className="whatif-space-preview">
      <span className="whatif-space-image">{space.image_url ? <img src={space.image_url} alt="" loading="lazy"/> : <span>사진 없음</span>}</span>
      <div className="whatif-space-info">
        <strong title={space.name}>{space.name}</strong>
        <small>{space.address || ''}</small>
        <span className="whatif-space-deltas">
          {previous != null && <span>이전 {previous.toFixed(1)}점</span>}
          {previous != null && current != null && <span aria-hidden="true">→</span>}
          {current != null && <b>변경 {current.toFixed(1)}점</b>}
        </span>
      </div>
      {status && <span className={`whatif-space-status ${status === 'NEW' ? 'is-new' : ''}`}>{status}</span>}
    </div>
  );
}

function ScenarioChanges({ baseline, result }) {
  const conditions = Object.entries(result.changed_conditions || {});
  return (
    <div className="whatif-changes">
      <h3>변경한 조건</h3>
      {conditions.length ? conditions.map(([key, value]) => <div className="whatif-change-line" key={key}>
        <span>{({ max_budget_krw: '예산', region_ids: '지역', area_range_pyeong: '면적', start_date: '시작일', end_date: '종료일', target_customers: '타깃 고객', category_id: '카테고리', brand_url: '브랜드 URL', soft_filters: '평가요소 중요도' })[key] || key}</span>
        <strong>{key === 'soft_filters' ? '변경됨' : key === 'max_budget_krw' ? formatMoney(value.after) : Array.isArray(value.after) ? value.after.join(', ') || '선택 없음' : String(value.after ?? '미선택')}</strong>
      </div>) : <p className="whatif-muted">기존 조건과 동일합니다.</p>}
      <p className="whatif-subnote">기준 추천 ID: {baseline.recommendation_id}</p>
    </div>
  );
}

export default function WhatIfAnalysis({ baseline, onBack, onApply }) {
  const [hard, setHard] = useState(() => copyHard(baseline.hard_filters));
  const [soft, setSoft] = useState(() => copySoft(baseline.soft_filters));
  const [mode, setMode] = useState('conditions');
  const [scenario, setScenario] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useMemo(() => makePayload(baseline, hard, soft), [baseline, hard, soft]);
  const hasChanges = Boolean(request.modified_hard_filters || request.modified_soft_filters);

  const changeHard = (key, value) => {
    const next = { ...hard, [key]: value };
    if (key === 'start_date' && next.end_date && value > next.end_date) next.end_date = '';
    setHard(next);
    setSoft((previous) => {
      const kept = previous.selected.filter((id) => isEligible(id, next));
      const auto = ['target_ratio', 'brand_space_fit', 'popup_history', 'area_fit']
        .filter((id) => !isEligible(id, hard) && isEligible(id, next) && !kept.includes(id));
      const selected = [...kept, ...auto];
      return { selected, importance_gaps: normalizeGaps(selected, previous.importance_gaps) };
    });
    setScenario(null); setError('');
  };
  const toggleArrayValue = (key, item, max) => {
    const previous = hard[key] || [];
    const next = previous.includes(item) ? previous.filter((value) => value !== item) : [...previous, item];
    if (max && next.length > max) { setError(`최대 ${max}개까지 선택할 수 있어요.`); return; }
    changeHard(key, next);
  };
  const toggleCriterion = (id) => {
    if (!isEligible(id, hard)) return;
    const selected = soft.selected.includes(id) ? soft.selected.filter((x) => x !== id) : [...soft.selected, id];
    setSoft({ selected, importance_gaps: normalizeGaps(selected, soft.importance_gaps) });
    setScenario(null); setError('');
  };
  const moveCriterion = (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= soft.selected.length) return;
    const selected = [...soft.selected];
    [selected[index], selected[nextIndex]] = [selected[nextIndex], selected[index]];
    setSoft({ ...soft, selected }); setScenario(null); setError('');
  };
  const changeGap = (index, value) => {
    setSoft((prev) => ({ ...prev, importance_gaps: prev.importance_gaps.map((gap, i) => i === index ? +value : gap) }));
    setScenario(null); setError('');
  };
  const reset = () => {
    setHard(copyHard(baseline.hard_filters)); setSoft(copySoft(baseline.soft_filters));
    setScenario(null); setError('');
  };
  const analyze = async () => {
    const validationMessage = validate(hard, soft);
    if (validationMessage) { setError(validationMessage); return; }
    if (!hasChanges) { setError('기존 조건과 다른 값을 최소 1개 변경해 주세요.'); return; }
    setError(''); setLoading(true); setScenario(null);
    try { setScenario(await createWhatIfAnalysis(request, baseline)); }
    catch (e) { setError(e.message || '분석 결과를 불러오지 못했습니다.'); }
    finally { setLoading(false); }
  };

  const baselineTop = (baseline.recommendations || []).slice(0, TOP_RANK_COUNT);
  const afterTop = scenario?.updated_recommendation?.recommendations?.slice(0, TOP_RANK_COUNT) || [];
  const beforeById = new Map((baseline.recommendations || []).map((s) => [s.space_id, s]));
  const afterById = new Map((scenario?.updated_recommendation?.recommendations || []).map((s) => [s.space_id, s]));
  const added = afterTop.filter((s) => !beforeById.has(s.space_id)).length;
  const totalDelta = scenario?.candidate_comparison?.difference ?? 0;

  return (
    <section className="whatif-page">
      <div className="whatif-topline">
        <div><span className="whatif-kicker">AI 의사결정 도우미 · STEP 04</span><h1>조건·선호 변경 (What-if)</h1><p>기존 출점 조건을 수정하고 추천 후보와 순위가 어떻게 달라지는지 비교해 보세요.</p></div>
        <button className="whatif-back" type="button" onClick={onBack}>← 추천 결과로 돌아가기</button>
      </div>
      <div className="whatif-demo-note"><b>MOCK DEMO</b> 실제 예약 가능 여부와 AI 해석이 아닌 시연용 분석입니다. 후보 수는 현재 Mock 엔진의 지역·등록 가격 기준을 사용합니다.</div>
      <div className="whatif-grid">
        <section className="whatif-panel whatif-editor">
          <div className="whatif-section-heading"><span className="whatif-step-dot">1</span><div><h2>조건 변경</h2><p>변경하고 싶은 항목을 수정하세요.</p></div></div>
          <div className="whatif-tabs" role="tablist" aria-label="변경 조건 선택">
            <button type="button" role="tab" aria-selected={mode === 'conditions'} className={mode === 'conditions' ? 'active' : ''} onClick={() => setMode('conditions')}>출점 조건 변경</button>
            <button type="button" role="tab" aria-selected={mode === 'priority'} className={mode === 'priority' ? 'active' : ''} onClick={() => setMode('priority')}>가중치 조정</button>
          </div>
          {mode === 'conditions' ? <div className="whatif-fields" role="tabpanel">
            <label className="whatif-field"><span>최대 예산 <small>(만원)</small></span><input type="number" min="1" step="1" value={Number(hard.max_budget_krw || 0) / 10000} onChange={(e) => changeHard('max_budget_krw', Number(e.target.value) * 10000)}/></label>
            <div className="whatif-field"><span>희망 지역 <small>(최대 3개)</small></span><div className="whatif-check-grid">{REGIONS.map((region) => <label key={region}><input type="checkbox" checked={hard.region_ids.includes(region)} onChange={() => toggleArrayValue('region_ids', region, 3)}/>{region}</label>)}</div></div>
            <div className="whatif-field"><span>운영 기간</span><div className="whatif-field-pair"><label><small>시작일</small><input type="date" min={today()} value={hard.start_date || ''} onChange={(e) => changeHard('start_date', e.target.value)}/></label><label><small>종료일</small><input type="date" min={hard.start_date || today()} value={hard.end_date || ''} onChange={(e) => changeHard('end_date', e.target.value)}/></label></div></div>
            <div className="whatif-field"><span>희망 면적 <small>(평)</small></span><div className="whatif-field-pair"><label><small>최소</small><input type="number" min="0" max="5000" value={hard.area_min_pyeong} onChange={(e) => changeHard('area_min_pyeong', Number(e.target.value))}/></label><label><small>최대</small><input type="number" min="0" max="5000" value={hard.area_max_pyeong} onChange={(e) => changeHard('area_max_pyeong', Number(e.target.value))}/></label></div></div>
            <div className="whatif-field"><span>타깃 고객 <small>(다중 선택)</small></span><details className="whatif-disclosure"><summary>{hard.target_customers.length ? hard.target_customers.map((id) => TARGETS.find((x) => x.value === id)?.label || id).join(', ') : '선택 안 함 · 클릭하여 변경'}</summary><div className="whatif-check-grid">{TARGETS.map((item) => <label key={item.value}><input type="checkbox" checked={hard.target_customers.includes(item.value)} onChange={() => toggleArrayValue('target_customers', item.value)}/>{item.label}</label>)}</div></details></div>
            <label className="whatif-field"><span>브랜드 카테고리</span><select value={hard.category_id || ''} onChange={(e) => changeHard('category_id', e.target.value || null)}><option value="">선택 안 함</option>{CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
            <label className="whatif-field"><span>브랜드 공식 홈페이지 URL</span><input type="url" placeholder="https://example.com" value={hard.brand_url || ''} onChange={(e) => changeHard('brand_url', e.target.value || null)}/></label>
            <p className="whatif-input-note">희망 면적은 후보 제외 조건이 아니라 점수 계산에 사용해요. 운영 기간은 Mock에서 예약 가능 여부를 검증하지 않아요.</p>
          </div> : <div className="whatif-priorities" role="tabpanel">
            <p className="whatif-input-note">평가요소를 선택하고 ↑↓로 순서를 변경하세요. 중요도 차이는 바로 아래 순위와의 차이예요.</p>
            {[...soft.selected, ...FACTOR_ORDER.filter((id) => !soft.selected.includes(id))].map((id) => {
              const index = soft.selected.indexOf(id);
              const active = index !== -1;
              const eligible = isEligible(id, hard);
              return <div className={`whatif-priority-row ${active ? 'is-active' : ''}`} key={id}>
                <label><input type="checkbox" checked={active} disabled={!eligible} onChange={() => toggleCriterion(id)}/><span>{active ? `${index + 1}위 · ` : ''}{FACTOR_LABELS[id]}</span></label>
                {!eligible && <small>관련 조건 입력 필요</small>}
                {active && <div className="whatif-priority-controls">
                  <button type="button" aria-label={`${FACTOR_LABELS[id]} 위로`} disabled={index === 0} onClick={() => moveCriterion(index, -1)}>↑</button>
                  <button type="button" aria-label={`${FACTOR_LABELS[id]} 아래로`} disabled={index === soft.selected.length - 1} onClick={() => moveCriterion(index, 1)}>↓</button>
                  {index < soft.selected.length - 1 && <select aria-label={`${FACTOR_LABELS[id]} 중요도 차이`} value={soft.importance_gaps[index] ?? 1} onChange={(e) => changeGap(index, e.target.value)}>{GAP_LABELS.map((label, i) => <option key={label} value={i}>{label}</option>)}</select>}
                </div>}
              </div>;
            })}
          </div>}
          <div className="whatif-editor-actions"><button type="button" className="whatif-reset" onClick={reset}>초기화</button><button type="button" className="whatif-primary" disabled={loading} onClick={analyze}>{loading ? '분석 중…' : '분석 시작 →'}</button></div>
          {error && <p className="whatif-error" role="alert">{error}</p>}
          <details className="whatif-json"><summary>API 요청 JSON 확인</summary><pre>{JSON.stringify(request, null, 2)}</pre></details>
        </section>

        <section className="whatif-panel whatif-results">
          <div className="whatif-section-heading"><span className="whatif-step-dot">2</span><div><h2>조건 변경 결과</h2><p>기준 결과와 변경 결과를 비교해요.</p></div></div>
          <div className="whatif-candidate-summary"><span>추천 후보 변화</span><div><b>{baseline.total_candidates.toLocaleString('ko-KR')}개</b><span>→</span><strong>{scenario ? scenario.candidate_comparison.after.toLocaleString('ko-KR') : '—'}개</strong></div><small>{scenario ? `${formatDelta(totalDelta)}개 · 신규 ${scenario.rank_changes.filter((r) => r.before_rank == null).length}개 / 제외 ${scenario.rank_changes.filter((r) => r.after_rank == null).length}개` : '조건을 수정한 다음 분석 시작을 눌러 주세요.'}</small></div>
          <h3>TOP {TOP_RANK_COUNT} 추천 변화</h3>
          {!scenario ? <><p className="whatif-muted">변경 전 상위 {TOP_RANK_COUNT}개 공간</p>{baselineTop.map((space) => <SpacePreview key={space.space_id} space={space} current={space.final_score}/>)}</> : afterTop.length ? afterTop.map((space) => {
            const old = beforeById.get(space.space_id);
            const oldRank = old?.rank;
            const status = !old ? 'NEW' : oldRank === space.rank ? '유지' : `${oldRank}위 → ${space.rank}위`;
            return <SpacePreview key={space.space_id} space={space} previous={old?.final_score} current={space.final_score} status={status}/>;
          }) : <div className="whatif-zero">새로운 조건에 맞는 후보 공간이 없어요. 예산 또는 지역을 다시 조정해 보세요.</div>}
          {scenario && <><p className="whatif-subnote">변경 전 TOP {TOP_RANK_COUNT}에서 변경 후 TOP {TOP_RANK_COUNT}에 남아 있는 공간: {baselineTop.filter((s) => afterById.has(s.space_id) && afterById.get(s.space_id).rank <= TOP_RANK_COUNT).length}개 · 새로운 후보 중 TOP {TOP_RANK_COUNT} 진입: {added}개</p><ScenarioChanges baseline={baseline} result={scenario}/></>}
        </section>

        <section className="whatif-panel whatif-impacts">
          <div className="whatif-section-heading"><span className="whatif-step-dot">3</span><div><h2>변화 요인 분석</h2><p>어떤 조건이 변경 결과에 영향을 주었을까요?</p></div></div>
          {!scenario ? <div className="whatif-waiting"><span>◇</span><strong>변경 조건 분석 대기 중</strong><p>왼쪽에서 조건을 수정하고 분석을 시작하면 주요 변화가 표시됩니다.</p></div> : <>
            <div className="whatif-summary-card"><b>Mock 변화 요약</b><p>{scenario.summary}</p></div>
            <h3>변경 조건별 후보 수 차이</h3><p className="whatif-subnote">각 항목을 <b>단독으로 변경했을 때</b>의 차이이며 서로 중복될 수 있어 합산하지 않고 개별적으로 보여줄게요.</p>
            {scenario.factor_impacts.map((impact) => <div className="whatif-impact-row" key={impact.factor}>
              <strong>{impact.label}</strong><div className="whatif-impact-bar"><span style={{width: `${Math.min(100, Math.abs(impact.candidate_change) / Math.max(1, baseline.total_candidates) * 100)}%`}}/></div><b className={impact.candidate_change > 0 ? 'positive' : impact.candidate_change < 0 ? 'negative' : ''}>{formatDelta(impact.candidate_change)}개</b>
            </div>)}
            <h3>주요 변화</h3><div className="whatif-insight"><strong>{totalDelta > 0 ? '후보 확대' : totalDelta < 0 ? '후보 축소' : '후보 수 유지'}</strong><p>변경 전 {baseline.total_candidates}개 → 변경 후 {scenario.candidate_comparison.after}개입니다. 조건별 수치의 합계와 전체 변화는 일치하지 않을 수 있어요.</p></div>
            <div className="whatif-insight"><strong>순위 변화</strong><p>추천 점수는 변경된 설정으로 다시 계산했습니다. 기준별 가중치가 바뀌었다면 전후 점수의 해석에 유의해야 해요.</p></div>
            <p className="whatif-warning">실제 LLM 변화 요인 분석 결과가 아니며, 날짜에 따른 예약 가능 여부와 면적별 후보 제외는 Mock에서 수행하지 않아요.</p>
            <details className="whatif-json"><summary>분석 API 응답 JSON 확인</summary><pre>{JSON.stringify({ ...scenario, updated_recommendation: { ...scenario.updated_recommendation, recommendations: scenario.updated_recommendation.recommendations.slice(0, TOP_RANK_COUNT) }, rank_changes: scenario.rank_changes.slice(0, 10) }, null, 2)}</pre></details>
          </>}
          <div className="whatif-bottom-actions"><button className="whatif-reset" type="button" onClick={onBack}>기존 추천 결과</button><button className="whatif-primary" type="button" disabled={!scenario?.updated_recommendation || loading} onClick={() => onApply(scenario.updated_recommendation)}>새 추천 결과 적용 →</button></div>
        </section>
      </div>
    </section>
  );
}
