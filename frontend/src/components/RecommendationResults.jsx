import { useEffect, useMemo, useState } from 'react';
import { createRecommendation } from '../services/recommendations';
import { FACTOR_LABELS } from '../mocks/recommendations';
import KakaoMap from './KakaoMap';
import './RecommendationResults.css';

const money = (number) => `${Number(number || 0).toLocaleString('ko-KR')}원`;
const decimal = (number) => Number(number || 0).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const percent = (number) => `${Math.round((Number(number) || 0) * 100)}%`;

// 최종 공간 CSV의 male/female 연령 컬럼과 같은 코드 값을 화면에 표시합니다.
const TARGET_AGE_LABELS = {
  '0_9': '0~9세', '10s': '10대', '20s': '20대', '30s': '30대',
  '40s': '40대', '50s': '50대', '60s': '60대', '70plus': '70대 이상',
};
function targetCustomerLabels(values = []) {
  if (!values.length) return '미선택';
  return values.map((value) => {
    const match = /^(female|male)_(0_9|10s|20s|30s|40s|50s|60s|70plus)$/.exec(value);
    if (!match) return value;
    return `${match[1] === 'female' ? '여성' : '남성'} ${TARGET_AGE_LABELS[match[2]]}`;
  }).join(', ');
}

function SmallIcon({ type, size = 17 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (type === 'pin') return <svg {...p}><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
  if (type === 'grid') return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (type === 'arrow') return <svg {...p}><path d="M4 12h16m-7-7 7 7-7 7"/></svg>;
  if (type === 'check') return <svg {...p}><path d="m5 12 4 4L19 6"/></svg>;
  if (type === 'close') return <svg {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>;
  if (type === 'compare') return <svg {...p}><path d="M12 3v18M5 7h14M4 7l-2 5h7L7 7M17 7l-2 5h7l-2-5M4 16h16"/></svg>;
  if (type === 'refresh') return <svg {...p}><path d="M20 11a8 8 0 0 0-14.5-4.5L3 9m0-6v6h6M4 13a8 8 0 0 0 14.5 4.5L21 15m0 6v-6h-6"/></svg>;
  if (type === 'external') return <svg {...p}><path d="M14 3h7v7m0-7-9 9M20 13v7H4V4h7"/></svg>;
  return null;
}

function SpaceImage({ space, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [space.space_id, space.image_url]);
  return (
    <div className={`result-space-image ${className}`}>
      {space.image_url && !failed ? (
        <img src={space.image_url} alt={`${space.name} 공간 사진`} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="result-image-placeholder"><SmallIcon type="grid" size={27}/><small>이미지 준비 중</small></span>
      )}
    </div>
  );
}

function ScoreCircle({ score }) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="result-score-circle" style={{ '--score': `${safeScore}%` }} aria-label={`종합 적합도 ${safeScore}점`}>
      <div><strong>{safeScore.toFixed(1)}</strong><small>/ 100점</small></div>
    </div>
  );
}

function SpaceCard({ space, selected, compared, compareDisabled, onSelect, onCompare }) {
  return (
    <article className={`result-space-card ${selected ? 'is-current' : ''}`}>
      <button className="result-space-pick" type="button" onClick={onSelect} aria-pressed={selected}>
        <SpaceImage space={space}/>
        <div className="result-card-main">
          <div className="result-card-first"><span className="result-rank">{space.rank}위</span><span className="result-card-score">{space.final_score.toFixed(1)}점</span></div>
          <strong className="result-card-name">{space.name}</strong>
          <span className="result-card-address"><SmallIcon type="pin" size={13}/>{space.address}</span>
          <span className="result-card-meta">{decimal(space.area_pyeong)}평 <span>·</span> 등록 가격 {money(space.price_krw)}</span>
        </div>
      </button>
      <div className="result-card-actions">
        <button type="button" onClick={onSelect}>{selected ? '현재 보고 있는 공간' : '상세 점수 보기'}</button>
        <button type="button" className={compared ? 'is-compared' : ''} onClick={onCompare} disabled={!compared && compareDisabled}>
          {compared ? '✓ 비교 선택됨' : '+ 비교 후보 선택'}
        </button>
      </div>
    </article>
  );
}

function DemoMap({ spaces, selectedId, onSelect }) {
  // 실제 지도 타일이 아닌, CSV의 위경도를 상대적 위치로 배치하는 UI 개발용 개념도입니다.
  const plotted = spaces.slice(0, 25);
  const lats = plotted.map((s) => s.latitude).filter(Number.isFinite);
  const lngs = plotted.map((s) => s.longitude).filter(Number.isFinite);
  const minLat = Math.min(...lats, 37.45), maxLat = Math.max(...lats, 37.66);
  const minLng = Math.min(...lngs, 126.83), maxLng = Math.max(...lngs, 127.16);
  const locate = (space) => ({
    left: `${8 + ((space.longitude - minLng) / Math.max(maxLng - minLng, .001)) * 84}%`,
    top: `${9 + (1 - (space.latitude - minLat) / Math.max(maxLat - minLat, .001)) * 80}%`,
  });
  return (
    <div className="result-map-area" aria-label="추천 후보 상대 위치 개념도">
      <div className="result-map-grid" aria-hidden="true" />
      <svg className="result-map-routes" viewBox="0 0 700 600" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-30 404 C 110 345 165 405 300 362 S 545 317 760 274" stroke="#bddbec" strokeWidth="36" fill="none" opacity=".75" />
        <path d="M-20 100 C 95 220 210 144 315 260 S 580 435 730 490" stroke="#fff" strokeWidth="21" fill="none" opacity=".88" />
        <path d="M-20 100 C 95 220 210 144 315 260 S 580 435 730 490" stroke="#d4deeb" strokeWidth="2" fill="none" />
        <path d="M110 -20 L250 650 M520 -20 L340 650 M-20 246 L730 360" stroke="#fff" strokeWidth="13" opacity=".9" fill="none" />
      </svg>
      <span className="result-map-water" aria-hidden="true">한강 방향</span>
      {plotted.map((space) => (
        <button
          key={space.space_id}
          type="button"
          title={`${space.rank}위 · ${space.name}`}
          className={`result-map-pin ${space.space_id === selectedId ? 'is-active' : ''}`}
          style={locate(space)}
          onClick={() => onSelect(space.space_id)}
          aria-label={`${space.rank}위 ${space.name} 선택`}
          aria-pressed={space.space_id === selectedId}
        >{space.rank}</button>
      ))}
      <div className="result-map-caption"><SmallIcon type="pin" size={14}/> 상위 {plotted.length}개 후보 위치 · 실제 지도 아님</div>
    </div>
  );
}

function FactorBreakdown({ space, weights, selected }) {
  return (
    <div className="result-factor-list">
      {selected.map((id) => {
        const score = space.factor_scores[id] ?? 0;
        const contribution = space.contributions[id] ?? 0;
        return (
          <div className="result-factor-row" key={id}>
            <div className="result-factor-top">
              <strong>{FACTOR_LABELS[id] || id}</strong>
              <span><b>{Number(score).toFixed(1)}</b>점</span>
            </div>
            <div className="result-factor-track"><div style={{ width: `${Math.max(0, Math.min(100, Number(score)))}%` }}/></div>
            <div className="result-factor-foot"><span>가중치 {percent(weights[id])}</span><span>기여도 {Number(contribution).toFixed(2)}점</span></div>
          </div>
        );
      })}
    </div>
  );
}

function SpaceDetail({ space, weights, selected, onCompare, compared, compareDisabled }) {
  // Kakao 공식 지도 URL 패턴: /link/map/이름,위도,경도
  const mapLink = Number.isFinite(space.latitude) && Number.isFinite(space.longitude)
    ? `https://map.kakao.com/link/map/${encodeURIComponent(space.name)},${space.latitude},${space.longitude}` : null;
  return (
    <aside className="result-detail" aria-label="선택한 공간 상세 정보">
      <div className="result-detail-heading"><span className="result-detail-eyebrow">선택한 공간 분석</span><span className="result-detail-rank">추천 {space.rank}위</span></div>
      <strong className="result-detail-name">{space.name}</strong>
      <span className="result-detail-location"><SmallIcon type="pin" size={15}/>{space.address}</span>
      <SpaceImage space={space} className="result-detail-photo"/>
      <div className="result-detail-facts">
        <div><small>면적</small><strong>{decimal(space.area_pyeong)}평</strong></div>
        <div><small>등록 가격</small><strong>{money(space.price_krw)}</strong></div>
        <div><small>인근 역</small><strong>{space.nearest_station || '정보 없음'}</strong></div>
      </div>
      <div className="result-detail-score"><ScoreCircle score={space.final_score}/><div><strong>종합 적합도</strong><p>선택한 평가요소의 가중합 결과</p><small>시연용 Mock 점수</small></div></div>
      <div className="result-detail-section-title"><h3>평가요소별 적합도</h3><span>0–100점</span></div>
      <FactorBreakdown space={space} weights={weights} selected={selected}/>
      <div className="result-ai-summary"><span>추천 근거 요약 · Mock</span><p>{space.summary}</p></div>
      <div className="result-detail-links">
        <button type="button" className={compared ? 'result-detail-compare is-compared' : 'result-detail-compare'} onClick={onCompare} disabled={!compared && compareDisabled}>
          <SmallIcon type="compare" size={16}/>{compared ? '비교 후보에서 제외' : 'Trade-off 비교 후보로 선택'}
        </button>
        {mapLink && <a href={mapLink} target="_blank" rel="noopener noreferrer"><SmallIcon type="external" size={14}/> 카카오맵에서 위치 확인</a>}
      </div>
    </aside>
  );
}

function AllSpacesModal({ spaces, onClose, onSelect, comparedIds, onCompare }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 12;
  const filtered = spaces.filter((s) => `${s.name} ${s.address} ${s.region_group}`.toLowerCase().includes(query.trim().toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const visible = filtered.slice((page - 1) * perPage, page * perPage);
  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  return (
    <div className="result-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="result-modal" role="dialog" aria-modal="true" aria-labelledby="all-spaces-title">
        <div className="result-modal-top">
          <div><span className="result-detail-eyebrow">전체 추천 후보</span><h2 id="all-spaces-title">추천 공간 {spaces.length.toLocaleString('ko-KR')}개</h2></div>
          <button type="button" className="result-modal-close" aria-label="전체 공간 목록 닫기" onClick={onClose}><SmallIcon type="close" size={20}/></button>
        </div>
        <input className="result-modal-search" type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="공간명·주소·지역 검색" aria-label="추천 공간 검색" />
        <div className="result-modal-list">
          {visible.length ? visible.map((s) => (
            <div className="result-modal-space" key={s.space_id}>
              <SpaceImage space={s}/>
              <div><small>{s.rank}위 · {s.final_score.toFixed(1)}점</small><strong>{s.name}</strong><span>{s.region_group} · {decimal(s.area_pyeong)}평 · {money(s.price_krw)}</span></div>
              <button type="button" onClick={() => { onSelect(s.space_id); onClose(); }}>상세보기</button>
              <button type="button" disabled={!comparedIds.includes(s.space_id) && comparedIds.length >= 2} onClick={() => onCompare(s.space_id)}>{comparedIds.includes(s.space_id) ? '✓ 선택됨' : '비교'}</button>
            </div>
          )) : <p className="result-no-search">검색 결과가 없어요.</p>}
        </div>
        <div className="result-modal-bottom"><span>{page} / {totalPages} 페이지</span><div><button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>이전</button><button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>다음</button></div></div>
      </section>
    </div>
  );
}

export default function RecommendationResults({ filters, softFilters, onEditConditions, onEditCriteria }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedSpaceId, setSelectedSpaceId] = useState(null);
  const [compareIds, setCompareIds] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [compareNotice, setCompareNotice] = useState('');
  const request = useMemo(() => ({ hard_filters: filters, soft_filters: softFilters }), [filters, softFilters]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError('');
    createRecommendation(request)
      .then((data) => { if (alive) { setResult(data); setSelectedSpaceId(data.recommendations?.[0]?.space_id ?? null); setCompareIds([]); } })
      .catch((e) => { if (alive) { setError(e.message || '추천 결과를 불러오지 못했어요.'); setResult(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [request]);

  const spaces = result?.recommendations || [];
  const selectedSpace = spaces.find((space) => space.space_id === selectedSpaceId) || spaces[0];
  const selectedFactors = result?.soft_filters?.selected || softFilters.selected || [];
  const toggleCompare = (id) => {
    if (compareIds.includes(id)) {
      setCompareIds((previous) => previous.filter((x) => x !== id));
      setCompareNotice('');
      return;
    }
    if (compareIds.length >= 2) {
      setCompareNotice('공간은 정확히 2개까지만 선택할 수 있어요.');
      return;
    }
    setCompareIds((previous) => [...previous, id]);
    setCompareNotice('');
  };
  const selectedComparisons = compareIds.map((id) => spaces.find((s) => s.space_id === id)).filter(Boolean);

  if (loading) return <section className="result-loading" role="status">추천 결과를 준비하고 있어요…</section>;
  if (error) return <section className="result-empty"><h2>추천 결과를 불러오지 못했어요.</h2><p>{error}</p><button className="primary-button" type="button" onClick={onEditCriteria}>추천 기준으로 돌아가기</button></section>;
  if (!result) return null;

  return (
    <div className="result-page">
      <div className="result-topline">
        <div><span className="result-kicker">STEP 3 · 맞춤형 공간 추천</span><h1>브랜드에 어울리는 팝업 공간들을 소개합니다.</h1><p>공간 정보를 비교하고, 가장 적합한 후보를 선택해 보세요.</p></div>
        <div className="result-top-actions"><button type="button" onClick={onEditConditions}>기본 조건 수정</button><button type="button" onClick={onEditCriteria}><SmallIcon type="refresh" size={15}/> 추천 기준 수정</button></div>
      </div>
      <div className="result-demo-alert" role="note"><strong>MOCK DEMO</strong><span>공간 기본 정보는 최종 CSV 기반이며, 추천 순위·점수·근거는 개발용 예시입니다. <b>운영 기간별 대관 가능 여부는 확인되지 않았습니다.</b></span></div>
      <div className="result-summary-strip">
        <div><span>조건을 만족하는 공간</span><strong>{result.total_candidates.toLocaleString('ko-KR')}<small>개</small></strong></div>
        <div><span>선택한 추천 기준</span><strong>{selectedFactors.length}<small>개</small></strong></div>
        <div><span>희망 지역</span><strong className="result-summary-regions">{(filters.region_ids || []).join(', ') || '전체'}</strong></div>
        <div><span>최대 예산</span><strong className="result-summary-budget">{money(filters.max_budget_krw)}</strong></div>
      </div>

      <div className="result-filter-tags" aria-label="적용한 기본 조건">
        <span><b>운영 기간</b> {filters.start_date} ~ {filters.end_date}</span>
        <span><b>희망 면적</b> {decimal(filters.area_min_pyeong)}~{decimal(filters.area_max_pyeong)}평</span>
        <span><b>브랜드 카테고리</b> {filters.category_id || '미선택'}</span>
        <span className="result-target-tag"><b>타깃 고객</b> {targetCustomerLabels(filters.target_customers || [])}</span>
      </div>

      {!spaces.length ? (
        <section className="result-empty">
          <div className="result-empty-icon"><SmallIcon type="pin" size={28}/></div>
          <h2>현재 조건에 맞는 공간이 없어요.</h2>
          <p>Mock 데이터에서 선택한 지역과 최대 예산을 동시에 만족하는 공간이 없습니다. 예산을 높이거나 다른 지역을 추가해 보세요. 운영 기간의 실제 예약 가능 여부는 판단하지 않았습니다.</p>
          <button type="button" className="primary-button" onClick={onEditConditions}>기본 조건 다시 설정하기</button>
          <details className="result-request-json"><summary>전송 요청 JSON 확인</summary><pre>{JSON.stringify(request, null, 2)}</pre></details>
        </section>
      ) : (
        <>
          <div className="result-main-grid">
            <section className="result-list-panel" aria-label="추천 공간 순위 목록">
              <div className="result-panel-head"><div><h2>추천 공간 리스트</h2><small>종합 적합도 순서</small></div><button type="button" onClick={() => setModalOpen(true)}><SmallIcon type="grid" size={15}/> 전체 보기</button></div>
              <div className="result-list-items" aria-label={`상위 ${Math.min(spaces.length, 7)}개 추천 공간`}>
                {spaces.slice(0, 7).map((space) => <SpaceCard key={space.space_id} space={space} selected={space.space_id === selectedSpace.space_id} compared={compareIds.includes(space.space_id)} compareDisabled={compareIds.length >= 2} onSelect={() => setSelectedSpaceId(space.space_id)} onCompare={() => toggleCompare(space.space_id)}/>)}
              </div>
            </section>
            <section className="result-map-panel" aria-label="추천 공간 지도 영역">
              <div className="result-panel-head"><div><h2>추천 공간 위치</h2><small>상위 25개 후보 표시</small></div><span className="result-map-label">{import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY ? 'Kakao Maps 연동' : '지도 미리보기'}</span></div>
              <KakaoMap spaces={spaces} selectedId={selectedSpace.space_id} onSelect={setSelectedSpaceId} fallback={<DemoMap spaces={spaces} selectedId={selectedSpace.space_id} onSelect={setSelectedSpaceId}/>} />
              <div className="result-map-selected"><span className="result-pin-dot"/><div><strong>{selectedSpace.name}</strong><small>{selectedSpace.address}</small></div><span>{selectedSpace.final_score.toFixed(1)}점</span></div>
            </section>
            <SpaceDetail space={selectedSpace} weights={result.weights} selected={selectedFactors} onCompare={() => toggleCompare(selectedSpace.space_id)} compared={compareIds.includes(selectedSpace.space_id)} compareDisabled={compareIds.length >= 2}/>
          </div>
          <section className="result-compare-bar" aria-label="Trade-off 비교 후보 선택">
            <div className="result-compare-title"><SmallIcon type="compare" size={20}/><div><strong>Trade-off 비교 후보 선택</strong><small>서로 비교하고 싶은 공간을 2개 선택해 주세요.</small></div></div>
            <div className="result-compare-chips">{[0, 1].map((index) => selectedComparisons[index] ? <button type="button" key={index} onClick={() => toggleCompare(selectedComparisons[index].space_id)} title="비교 후보 해제">{index + 1}. {selectedComparisons[index].name} ×</button> : <span key={index}>{index + 1}번째 후보 선택</span>)}</div>
            <button type="button" className="result-compare-start" disabled={compareIds.length !== 2} onClick={() => setCompareNotice('비교 후보 2개 선택 완료! Trade-off 상세 분석 화면은 후속 개발 단계에서 구현할 예정입니다.')}>2개 후보 확인 <SmallIcon type="arrow" size={15}/></button>
          </section>
          {compareNotice && <p className="result-compare-notice" role="status">{compareNotice}</p>}
          <details className="result-request-json"><summary>개발용 API 요청·응답 JSON 확인</summary><p>실제 POST /recommendations 응답으로 교체할 수 있도록 동일한 핵심 필드를 사용합니다.</p><pre>{JSON.stringify({ request, response: { ...result, recommendations: result.recommendations.slice(0, 2) } }, null, 2)}</pre></details>
          {modalOpen && <AllSpacesModal spaces={spaces} onClose={() => setModalOpen(false)} onSelect={setSelectedSpaceId} comparedIds={compareIds} onCompare={toggleCompare}/>}
        </>
      )}
    </div>
  );
}
