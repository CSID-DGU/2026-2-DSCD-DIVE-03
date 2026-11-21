import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBenchmarkDistricts } from '../services/benchmark';
import { BenchmarkStatus, KPI, CategoryDonut, DistrictBars, MonthlyLine, numberLabel, percentLabel } from './BenchmarkCharts';
import './BenchmarkPages.css';

export default function BenchmarkDistrict({ region, onBack }) {
  const [dong, setDong] = useState('전체');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => { setDong('전체'); }, [region]);
  useEffect(() => {
    const controller = new AbortController();
    getBenchmarkDistricts(region, { signal: controller.signal })
      .then(result => { setData(result); setError(''); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [region, attempt]);

  const summary = useMemo(() => dong === '전체' ? data?.region_summary : (data?.districts || []).find(item => item.district === dong), [data, dong]);
  const kpis = [
    ['과거 팝업 개최 수', numberLabel(summary?.popup_count, '건'), '기준일 이전 개최 시작'],
    ['등록 대관 공간 수', numberLabel(summary?.space_count, '개'), '등록 공간 수'],
    ['주요 카테고리', summary?.top_category || '—', percentLabel(summary?.top_category_share)],
    ['평균 운영 기간', numberLabel(summary?.average_duration_days, '일'), '시작일·종료일 유효 이력'],
  ];

  return <div className="benchmark">
    <header className="benchmark-hero"><div>
      <button type="button" className="benchmark-text-link" onClick={onBack}>← 서울 권역 분석으로 돌아가기</button>
      <h1>팝업 벤치마크 <span>｜ {region} 권역 행정동 분석</span></h1>
      <p>행정동별 팝업 개최 현황을 비교하고 해당 지역의 대관 공간을 살펴보세요.</p>
    </div><div className="benchmark-hero-art" aria-hidden="true">POP-UP</div></header>
    <section className="benchmark-panel benchmark-filter-panel">
      <span className="benchmark-filter-title">권역</span><strong>{region}</strong>
      <label className="benchmark-dong-select">행정동 <select value={dong} disabled={loading || Boolean(error)} onChange={event => setDong(event.target.value)}><option value="전체">전체</option>{(data?.districts || []).map(item => <option key={item.district} value={item.district}>{item.district}</option>)}</select></label>
      <small>행정동을 선택하면 지표와 차트가 함께 변경됩니다.</small>
    </section>
    <BenchmarkStatus loading={loading} error={error} onRetry={retry}>
      <section className="benchmark-district-kpis">{kpis.map(([label, value, footnote]) => <div className="benchmark-panel" key={label}><KPI label={label} value={value} footnote={footnote}/></div>)}</section>
      <section className="benchmark-district-grid">
        <div className="benchmark-panel"><h2>행정동별 팝업 분포</h2><p className="benchmark-subtext">행정동 경계 지도는 다음 단계에서 연결합니다.</p><div className="benchmark-placeholder tall">행정동 경계 지도 · 연동 예정</div></div>
        <div className="benchmark-district-middle">
          <div className="benchmark-panel"><h2>행정동별 팝업 개최 건수</h2><DistrictBars districts={data?.districts} metric="popup_count" selectedDistrict={dong} onSelectDistrict={setDong}/></div>
          <div className="benchmark-panel"><h2>팝업 카테고리 비중 {dong !== '전체' ? `(${dong})` : ''}</h2><CategoryDonut data={summary?.category_counts} total={summary?.popup_count}/></div>
        </div>
        <div className="benchmark-panel"><h2>대관 공간 목록</h2><p className="benchmark-subtext">선택한 행정동에 등록된 대관 공간을 표시합니다.</p><div className="benchmark-placeholder tall">공간별 상세 목록 API · 연동 예정</div></div>
      </section>
      <section className="benchmark-bottom-grid"><div className="benchmark-panel"><h2>월별 팝업 개최 추이 {dong !== '전체' ? `(${dong})` : ''}</h2><MonthlyLine data={summary?.monthly_open_counts}/></div>
        <div className="benchmark-panel"><h2>행정동별 대관 공간 수 ({region})</h2><DistrictBars districts={data?.districts} metric="space_count" selectedDistrict={dong} onSelectDistrict={setDong}/></div>
      </section>
    </BenchmarkStatus>
  </div>;
}
