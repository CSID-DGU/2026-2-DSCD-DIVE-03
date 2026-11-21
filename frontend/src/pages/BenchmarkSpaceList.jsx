import { useEffect, useState } from 'react';
import { getBenchmarkSpaces } from '../services/benchmark';

const AREA_OPTIONS = [
  { label: '면적 전체', min: undefined, max: undefined },
  { label: '30평 미만', min: 0, max: 29.999 },
  { label: '30~80평 미만', min: 30, max: 79.999 },
  { label: '80~150평 미만', min: 80, max: 149.999 },
  { label: '150평 이상', min: 150, max: undefined },
];
const PRICE_OPTIONS = [
  { label: '가격 전체', min: undefined, max: undefined },
  { label: '100만원 미만', min: 0, max: 999999 },
  { label: '100~300만원 미만', min: 1000000, max: 2999999 },
  { label: '300~1,000만원 미만', min: 3000000, max: 9999999 },
  { label: '1,000만원 이상', min: 10000000, max: undefined },
];
const currency = (value) => Number.isFinite(value) ? `${Math.round(value / 10000).toLocaleString('ko-KR')}만원` : '가격 정보 없음';

export default function BenchmarkSpaceList({ region, district }) {
  const [areaIndex, setAreaIndex] = useState(0);
  const [priceIndex, setPriceIndex] = useState(0);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const area = AREA_OPTIONS[areaIndex];
  const price = PRICE_OPTIONS[priceIndex];

  // Changing location or filters starts from page 1. Keep selectors independent of KPI filters.
  useEffect(() => { setPage(1); }, [region, district, areaIndex, priceIndex]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getBenchmarkSpaces(region, {
      district,
      minArea: area.min, maxArea: area.max,
      minPrice: price.min, maxPrice: price.max,
      page, pageSize: 8, signal: controller.signal,
    }).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [region, district, area.min, area.max, price.min, price.max, page, attempt]);

  return <section className="benchmark-space-list" aria-label="행정동별 등록 대관 공간">
    <div className="benchmark-space-title"><h2>{district === '전체' ? `${region} 대관 공간` : `${district} 대관 공간`}</h2>
      <span>{loading ? '조회 중' : error ? '조회 오류' : `${(data?.total ?? 0).toLocaleString('ko-KR')}개`}</span></div>
    <p className="benchmark-space-disclaimer">등록 공간 정보입니다. 과거 팝업 개최 장소 및 예약 가능 여부를 의미하지 않습니다.</p>
    <div className="benchmark-space-filters">
      <label>면적 <select aria-label="대관 공간 면적 필터" value={areaIndex} onChange={event => setAreaIndex(Number(event.target.value))}>
        {AREA_OPTIONS.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}
      </select></label>
      <label>등록 대관료 <select aria-label="대관 공간 가격 필터" value={priceIndex} onChange={event => setPriceIndex(Number(event.target.value))}>
        {PRICE_OPTIONS.map((item, index) => <option key={item.label} value={index}>{item.label}</option>)}
      </select></label>
    </div>
    {error ? <div className="benchmark-space-state is-error" role="alert">{error}<button type="button" onClick={() => setAttempt(n => n + 1)}>다시 시도</button></div>
      : loading ? <div className="benchmark-space-state" role="status">공간 목록을 불러오는 중...</div>
        : data?.items?.length ? <>
          <div className="benchmark-space-items">{data.items.map(item => <article key={item.space_id} className="benchmark-space-item">
            <div className="benchmark-space-thumb">
              {item.thumbnail_url ? <img src={item.thumbnail_url} loading="lazy" alt={`${item.name} 공간 사진`} onError={event => { event.currentTarget.style.display = 'none'; }} /> : null}
              <span className="benchmark-space-thumb-fallback" aria-hidden="true">POPCAST</span>
            </div>
            <div className="benchmark-space-details">
              <strong title={item.name}>{item.name}</strong>
              <small>{item.district || '행정동 미상'}</small>
              <div className="benchmark-space-meta"><span>{item.area_pyeong != null ? `${item.area_pyeong.toLocaleString('ko-KR')}평` : '면적 정보 없음'}</span>
                <b>{currency(item.listed_price_krw)}</b></div>
              {item.page_url ? <a href={item.page_url} target="_blank" rel="noopener noreferrer" aria-label={`${item.name} 대관 상세 페이지 새 창 열기`}>공간 상세 보기 ↗</a> : <span className="benchmark-space-no-link">상세 링크 없음</span>}
            </div>
          </article>)}</div>
          <div className="benchmark-space-pager"><button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>이전</button>
            <span>{data.page} / {Math.max(data.total_pages, 1)}</span>
            <button type="button" disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)}>다음</button></div>
        </> : <div className="benchmark-space-state">선택한 조건에 해당하는 공간이 없습니다.</div>}
    <p className="benchmark-space-disclaimer">가격은 CSV 등록값이며 기간 단위가 확인되지 않았습니다.</p>
  </section>;
}
