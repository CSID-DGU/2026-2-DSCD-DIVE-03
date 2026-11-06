import { useEffect, useMemo, useState } from 'react';
import { FACTOR_LABELS } from '../mocks/recommendations';
import { createTradeOffAnalysis } from '../services/tradeOff';
import './TradeOffAnalysis.css';

const formatScore = (v) => Number(v ?? 0).toFixed(1);
const formatMoney = (v) => v == null ? '정보 없음' : `${Number(v).toLocaleString('ko-KR')}원`;
const formatArea = (v) => v == null ? '정보 없음' : `${Number(v).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}평`;
const formatWeight = (v) => `${(Number(v || 0) * 100).toFixed(1)}%`;
const factorTitle = (key) => FACTOR_LABELS[key] || key;
const safeScore = (value) => Math.max(0, Math.min(100, Number(value) || 0));

function SpacePhoto({ space }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [space?.space_id, space?.image_url]);
  return (
    <div className="tradeoff-photo">
      {space?.image_url && !failed ? (
        <img src={space.image_url} alt={`${space.name} 공간 대표 사진`} loading="lazy" onError={() => setFailed(true)} />
      ) : <span>공간 이미지 준비 중</span>}
    </div>
  );
}

function SpacePanel({ space, badge, leader, scoreDifference }) {
  return (
    <article className={`tradeoff-space-card ${leader ? 'is-higher' : ''}`}>
      <div className="tradeoff-space-top">
        <span className="tradeoff-space-label">비교 공간 {badge}</span>
        <div className="tradeoff-space-flags"><span>추천 {space.rank ?? '-'}위</span>{leader && <strong>종합 적합도 우위</strong>}</div>
      </div>
      <SpacePhoto space={space} />
      <div className="tradeoff-space-content">
        <h2>{space.name}</h2>
        <p className="tradeoff-address">{space.address || '주소 정보 없음'}</p>
        <div className="tradeoff-space-score">
          <div><small>종합 적합도</small><strong>{formatScore(space.final_score)}<span> / 100점</span></strong></div>
          {leader && <span className="tradeoff-score-delta">+{formatScore(scoreDifference)}점 우위</span>}
        </div>
        <div className="tradeoff-space-stats">
          <div><small>면적</small><b>{formatArea(space.area_pyeong)}</b></div>
          <div><small>등록 가격</small><b>{formatMoney(space.price_krw)}</b></div>
          <div><small>인근 역</small><b>{space.nearest_station || '정보 없음'}</b></div>
        </div>
        {space.latitude != null && space.longitude != null && Number.isFinite(Number(space.latitude)) && Number.isFinite(Number(space.longitude)) && (
          <a className="tradeoff-map-link" href={`https://map.kakao.com/link/map/${encodeURIComponent(space.name)},${space.latitude},${space.longitude}`} target="_blank" rel="noopener noreferrer">카카오맵에서 위치 확인 ↗</a>
        )}
      </div>
    </article>
  );
}

function FactorRow({ entry, a, b, weights }) {
  const aScore = Number(entry.scores?.[a.space_id] ?? a.factor_scores?.[entry.factor] ?? 0);
  const bScore = Number(entry.scores?.[b.space_id] ?? b.factor_scores?.[entry.factor] ?? 0);
  const weight = Number(weights?.[entry.factor] || 0);
  const aContribution = Number(entry.contributions?.[a.space_id] ?? a.contributions?.[entry.factor] ?? aScore * weight);
  const bContribution = Number(entry.contributions?.[b.space_id] ?? b.contributions?.[entry.factor] ?? bScore * weight);
  const winner = entry.winner_space_id === undefined ? (aScore === bScore ? null : aScore > bScore ? a.space_id : b.space_id) : entry.winner_space_id;
  return (
    <div className="tradeoff-factor-row">
      <div className={`tradeoff-factor-side ${winner === a.space_id ? 'is-best' : ''}`}>
        <div className="tradeoff-factor-numbers"><b>{formatScore(aScore)}점</b><span>기여 {formatScore(aContribution)}점</span></div>
        <div className="tradeoff-factor-track"><span style={{ width: `${safeScore(aScore)}%` }} /></div>
      </div>
      <div className="tradeoff-factor-middle">
        <strong>{factorTitle(entry.factor)}</strong>
        <span>가중치 {formatWeight(weight)}</span>
        <small>{winner === null ? '동점' : winner === a.space_id ? '공간 A 우위' : '공간 B 우위'}</small>
      </div>
      <div className={`tradeoff-factor-side ${winner === b.space_id ? 'is-best' : ''}`}>
        <div className="tradeoff-factor-numbers"><b>{formatScore(bScore)}점</b><span>기여 {formatScore(bContribution)}점</span></div>
        <div className="tradeoff-factor-track"><span style={{ width: `${safeScore(bScore)}%` }} /></div>
      </div>
    </div>
  );
}

function ArgumentPanel({ space, strengths, weaknesses, badge }) {
  const strengthsList = strengths?.find((item) => item.space_id === space.space_id)?.items || [];
  const weaknessesList = weaknesses?.find((item) => item.space_id === space.space_id)?.items || [];
  return (
    <article className="tradeoff-argument-card">
      <div className="tradeoff-argument-head"><span>공간 {badge}</span><h3>{space.name}</h3></div>
      <div className="tradeoff-argument-list"><strong className="tradeoff-positive">상대적 강점</strong>
        {strengthsList.length ? <ul>{strengthsList.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul> : <p>선택한 평가요소에서 상대적으로 우위인 항목이 없어요.</p>}
      </div>
      <div className="tradeoff-argument-list"><strong className="tradeoff-negative">상대적 약점</strong>
        {weaknessesList.length ? <ul>{weaknessesList.map((item, i) => <li key={`${i}-${item}`}>{item}</li>)}</ul> : <p>선택한 평가요소에서 상대적으로 열세인 항목이 없어요.</p>}
      </div>
    </article>
  );
}

export default function TradeOffAnalysis({ baseline, spaceIds, onBack }) {
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const idsKey = Array.isArray(spaceIds) ? spaceIds.join('|') : '';
  const request = useMemo(() => ({ recommendation_id: baseline?.recommendation_id, space_ids: idsKey.split('|').filter(Boolean) }), [baseline?.recommendation_id, idsKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setAnalysis(null);
    Promise.resolve().then(() => createTradeOffAnalysis(request, baseline))
      .then((response) => { if (active) setAnalysis(response); })
      .catch((err) => { if (active) setError(err?.message || '비교 결과를 불러오지 못했어요.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [baseline, request]);

  const spaces = analysis?.spaces?.map((item) => {
    const original = baseline?.recommendations?.find((s) => s.space_id === item.space_id) || {};
    return { ...original, ...item };
  }) || [];
  const [a, b] = spaces;
  const aFinal = Number(a?.final_score || 0);
  const bFinal = Number(b?.final_score || 0);
  const gap = Math.abs(Number(analysis?.score_comparison?.difference ?? Math.abs(aFinal - bFinal)));
  const leadingId = aFinal === bFinal ? null : aFinal > bFinal ? a?.space_id : b?.space_id;
  const mock = analysis?.mock_meta?.is_mock === true || import.meta.env.VITE_USE_MOCK_RECOMMENDATIONS !== 'false';

  return (
    <div className="tradeoff-page">
      <div className="tradeoff-topline">
        <div><span className="tradeoff-kicker">STEP 5 · Trade-off 분석</span><h1>선택한 두 공간을 나란히 비교해 보세요.</h1><p>같은 추천 조건을 기준으로 종합 적합도와 평가요소별 차이를 확인할 수 있어요.</p></div>
        <button type="button" className="tradeoff-back" onClick={onBack}>← 추천 결과로 돌아가기</button>
      </div>

      <div className="tradeoff-demo-note" role="note"><b>{mock ? 'MOCK DEMO' : 'TRADE-OFF'}</b><span>{mock ? '비교 공간 정보는 최종 CSV 기반입니다. 점수·가중치·장단점은 현재 추천 Mock을 재사용하며 실제 AI 분석이나 예약 가능 여부 검증 결과가 아닙니다.' : '추천 결과의 동일한 평가 기준으로 공간 두 곳을 비교합니다. 실제 대관 조건은 별도로 확인해 주세요.'}</span></div>
      {loading && <div className="tradeoff-loading" role="status">선택한 두 공간을 비교하고 있어요…</div>}
      {!loading && error && <div className="tradeoff-error" role="alert"><h2>비교 분석을 불러오지 못했어요.</h2><p>{error}</p><button type="button" onClick={onBack}>추천 결과로 돌아가기</button></div>}
      {!loading && !error && analysis && (!a || !b) && <div className="tradeoff-error" role="alert"><h2>비교할 공간 정보가 부족해요.</h2><button type="button" onClick={onBack}>추천 결과로 돌아가기</button></div>}
      {!loading && !error && a && b && (
        <>
          <div className="tradeoff-overview">
            <div><span>비교 대상</span><strong>공간 A <em>vs</em> 공간 B</strong></div>
            <div><span>종합 적합도 점수 차이</span><strong>{formatScore(gap)}<small>점</small></strong></div>
            <div><span>현재 추천 기준의 우위 공간</span><strong className="tradeoff-leader-name">{leadingId === a.space_id ? `A · ${a.name}` : leadingId === b.space_id ? `B · ${b.name}` : '동점'}</strong></div>
          </div>
          <section className="tradeoff-spaces" aria-label="비교 공간 기본 정보">
            <SpacePanel space={a} badge="A" leader={leadingId === a.space_id} scoreDifference={gap}/>
            <SpacePanel space={b} badge="B" leader={leadingId === b.space_id} scoreDifference={gap}/>
          </section>
          <section className="tradeoff-panel" aria-labelledby="tradeoff-factor-title">
            <div className="tradeoff-panel-title"><div><span>01 · 점수 비교</span><h2 id="tradeoff-factor-title">평가요소별 적합도 및 가중 기여도</h2><p>두 공간의 동일 평가요소를 100점 만점으로 비교해요. 선택한 평가요소만 나타납니다.</p></div><span className="tradeoff-factor-count">{analysis.factor_comparison?.length || 0}개 평가요소</span></div>
            <div className="tradeoff-factor-header"><b>공간 A · {a.name}</b><span>평가요소</span><b>공간 B · {b.name}</b></div>
            {analysis.factor_comparison?.length ? analysis.factor_comparison.map((entry) => <FactorRow key={entry.factor} entry={entry} a={a} b={b} weights={analysis.weights}/>) : <p className="tradeoff-no-factors">비교할 평가요소가 없어요.</p>}
            <p className="tradeoff-footnote">* 적합도 점수는 0~100점이며, 기여도는 적합도 점수 × 선택한 가중치입니다. Mock 추천 계산에 따른 값입니다.</p>
          </section>
          <section className="tradeoff-panel" aria-labelledby="tradeoff-pros-title">
            <div className="tradeoff-panel-title"><div><span>02 · 상대적 장단점</span><h2 id="tradeoff-pros-title">어떤 공간이 어떤 기준에서 유리할까요?</h2><p>선택한 두 공간의 평가요소 점수 차이를 바탕으로 정리했어요.</p></div></div>
            <div className="tradeoff-arguments">
              <ArgumentPanel space={a} badge="A" strengths={analysis.strengths} weaknesses={analysis.weaknesses}/>
              <ArgumentPanel space={b} badge="B" strengths={analysis.strengths} weaknesses={analysis.weaknesses}/>
            </div>
          </section>
          <section className="tradeoff-panel tradeoff-narrative" aria-label="종합 비교 요약">
            <div className="tradeoff-panel-title"><div><span>03 · 비교 요약</span><h2>종합 비교 및 추가 고려사항</h2></div></div>
            <div className="tradeoff-summary"><strong>{mock ? 'Mock 비교 요약' : '비교 요약'}</strong><p>{analysis.summary || '분석 요약 정보가 없습니다.'}</p></div>
            <div className="tradeoff-consider"><strong>최종 결정 전 확인할 사항</strong><p>{analysis.additional_considerations || '실제 대관 조건과 일정, 브랜드 콘셉트를 함께 검토해 주세요.'}</p></div>
          </section>
          <details className="tradeoff-json"><summary>개발용 API Request·Response JSON 보기</summary><pre>{JSON.stringify({ request, response: analysis }, null, 2)}</pre></details>
          <div className="tradeoff-bottom"><button type="button" onClick={onBack}>← 비교 후보 다시 선택하기</button><span>선택했던 두 공간은 추천 결과에서 유지돼요.</span></div>
        </>
      )}
    </div>
  );
}
