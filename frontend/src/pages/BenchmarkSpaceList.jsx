import { useEffect, useState } from 'react';
import { getBenchmarkSpaces } from '../services/benchmark';
import './BenchmarkSpaceAddress.css';

const fullAddress = (item) => {
  const address = String(item.address || '').trim();
  const detail = String(item.address_detail || '').trim();
  if (!address) return detail || item.district || '주소 정보 없음';
  return detail && !address.includes(detail) ? `${address} ${detail}` : address;
};

const currency = (value) => Number.isFinite(value) ? `${Math.round(value / 10000).toLocaleString('ko-KR')}만원` : '가격 정보 없음';

export default function BenchmarkSpaceList({ region, district }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  // 행정동을 바꾸면 첫 페이지부터 표시합니다.
  useEffect(() => { setPage(1); }, [region, district]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getBenchmarkSpaces(region, {
      district,
      page, pageSize: 5, signal: controller.signal,
    }).then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [region, district, page, attempt]);

  return <section className="benchmark-space-list" aria-label="행정동별 등록 대관 공간">
    <div className="benchmark-space-title"><h2>{district === '전체' ? `${region} 대관 공간` : `${district} 대관 공간`}</h2>
      <span>{loading ? '조회 중' : error ? '조회 오류' : `${(data?.total ?? 0).toLocaleString('ko-KR')}개`}</span></div>
    <p className="benchmark-space-disclaimer">해당 지역의 등록 대관 공간 목록입니다.</p>
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
              <small className="benchmark-space-address" title={fullAddress(item)}>{fullAddress(item)}</small>
              <div className="benchmark-space-meta"><span>{item.area_pyeong != null ? `${item.area_pyeong.toLocaleString('ko-KR')}평` : '면적 정보 없음'}</span>
                <b>{currency(item.listed_price_krw)}</b></div>
            </div>
          </article>)}</div>
          <div className="benchmark-space-pager"><button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>이전</button>
            <span>{data.page} / {Math.max(data.total_pages, 1)}</span>
            <button type="button" disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)}>다음</button></div>
        </> : <div className="benchmark-space-state benchmark-space-empty" role="status">
          <strong>해당 {district === '전체' ? '권역' : '행정동'}에 등록된 대관 공간이 없습니다.</strong>
          <span>현재 POPCAST에 등록된 공간을 기준으로 안내합니다.</span>
        </div>}

  </section>;
}
