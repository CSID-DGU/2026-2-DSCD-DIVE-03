import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getBenchmarkPopupGridHistory } from '../services/benchmark_popup_grid_api';
import './BenchmarkPopupHistoryModal.css';

const PAGE_SIZE = 8;
function dateLabel(start, end) {
  const a = start ? String(start).slice(0, 10) : null;
  const b = end ? String(end).slice(0, 10) : null;
  return a && b ? `${a} ~ ${b}` : a || b || '기간 정보 없음';
}

export default function BenchmarkPopupHistoryModal({ point, onClose }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const closeRef = useRef(null);

  useEffect(() => {
    setPage(1);
    setData(null);
  }, [point?.region, point?.district, point?.latitude, point?.longitude]);

  useEffect(() => {
    if (!point) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getBenchmarkPopupGridHistory({ ...point, page, pageSize: PAGE_SIZE, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [point, page, retryKey]);

  useEffect(() => {
    if (!point) return undefined;
    const previous = document.activeElement;
    closeRef.current?.focus();
    const handleKey = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [point]);

  if (!point) return null;
  return createPortal(<div className="bm-ph-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="bm-ph-dialog" role="dialog" aria-modal="true" aria-labelledby="bm-ph-title">
      <header className="bm-ph-header">
        <div>
          <span className="bm-ph-eyebrow">POPCAST · POPUP HISTORY</span>
          <h2 id="bm-ph-title">이 위치에서 열린 팝업</h2>
          <p>{point.region} · {point.district} <span aria-hidden="true">·</span> 약 100m 격자 내 개최 이력</p>
        </div>
        <button type="button" ref={closeRef} className="bm-ph-close" aria-label="닫기" onClick={onClose}>×</button>
      </header>
      <div className="bm-ph-summary">{data ? `총 ${data.total.toLocaleString()}건의 과거 팝업` : '과거 팝업 조회' } <span>최신 개최순</span></div>
      <div className="bm-ph-scroll">
        {loading && <div className="bm-ph-empty">팝업 이력을 불러오는 중...</div>}
        {!loading && error && <div className="bm-ph-empty bm-ph-error">{error}<button type="button" onClick={() => setRetryKey(v => v + 1)}>다시 시도</button></div>}
        {!loading && !error && data?.items?.length === 0 && <div className="bm-ph-empty">이 위치에 조회 가능한 팝업 이력이 없습니다.</div>}
        {!loading && !error && data?.items?.map((item, index) => <article className="bm-ph-item" key={`${item.id || item.title}-${index}`}>
          <div className="bm-ph-item-icon" aria-hidden="true">⌂</div>
          <div className="bm-ph-item-body">
            <h3>{item.title}</h3>
            <div className="bm-ph-item-meta"><span className="bm-ph-category">{item.category}</span><span>{dateLabel(item.open_date, item.close_date)}</span></div>
            {item.address && <div className="bm-ph-address">{item.address}{item.address_detail ? ` · ${item.address_detail}` : ''}</div>}
            {item.url && <a className="bm-ph-source" href={item.url} target="_blank" rel="noopener noreferrer">원본 팝업 정보 보기 ↗</a>}
          </div>
        </article>)}
      </div>
      {data && data.total_pages > 1 && <footer className="bm-ph-footer">
        <button type="button" disabled={loading || page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>이전</button>
        <span>{page} / {data.total_pages}</span>
        <button type="button" disabled={loading || page >= data.total_pages} onClick={() => setPage(p => p + 1)}>다음</button>
      </footer>}
    </section>
  </div>, document.body);
}
