import BenchmarkGeoMap from './BenchmarkGeoMap';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBenchmarkDistricts } from '../services/benchmark';
import { BenchmarkStatus, KPI, CategoryDonut, DistrictBars, MonthlyLine, numberLabel } from './BenchmarkCharts';
import BenchmarkSpaceList from './BenchmarkSpaceList';
import './BenchmarkPages.css';
import './BenchmarkSpaces.css';
import './BenchmarkDistrictRefresh.css';

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
    ['과거 팝업 개최 수', numberLabel(summary?.popup_count, '건')],
    ['등록 대관 공간 수', numberLabel(summary?.space_count, '개')],
    ['주요 카테고리', summary?.top_category || '—'],
    ['평균 운영 기간', numberLabel(summary?.average_duration_days, '일')],
  ];

  return <div className="benchmark benchmark-district-refresh">
    <header className="benchmark-hero"><div className="benchmark-hero-copy">
      <button type="button" className="benchmark-text-link" onClick={onBack}>← 서울 권역 분석으로 돌아가기</button>
      <h1>팝업 벤치마크 <span className="benchmark-heading-separator">|</span><span className="benchmark-heading-subtitle">{region} 권역 행정동 분석</span></h1>
      <p>행정동별 팝업 개최 현황을 비교하고 해당 지역의 대관 공간을 살펴보세요.</p>
    </div></header>
    <section className="benchmark-panel benchmark-filter-panel">
      <span className="benchmark-filter-title">권역</span><strong>{region}</strong>
      <label className="benchmark-dong-select">행정동 <select value={dong} disabled={loading || Boolean(error)} onChange={event => setDong(event.target.value)}><option value="전체">전체</option>{(data?.districts || []).map(item => <option key={item.district} value={item.district}>{item.district}</option>)}</select></label>
      
    </section>
    <BenchmarkStatus loading={loading} error={error} onRetry={retry}>
      <section className="benchmark-district-kpis">{kpis.map(([label, value]) => <div className="benchmark-panel" key={label}><KPI label={label} value={value}/></div>)}</section>
      <section className="benchmark-district-workspace">
        <div className="benchmark-district-analytics">
          <div className="benchmark-district-main-row">
            <div className="benchmark-panel benchmark-district-map-card">
              <h2>행정동별 팝업 분포</h2>
              <BenchmarkGeoMap region={region} district={dong} onSelectDistrict={setDong} />
            </div>
            <div className="benchmark-panel benchmark-district-count-card">
              <h2>행정동별 팝업 개최 건수</h2>
              <DistrictBars districts={data?.districts} metric="popup_count" selectedDistrict={dong} onSelectDistrict={setDong}/>
            </div>
          </div>
          <div className="benchmark-district-analytics-row">
            <div className="benchmark-panel benchmark-district-category-card">
              <h2>팝업 카테고리 비중 {dong !== '전체' ? `(${dong})` : ''}</h2>
              <CategoryDonut data={summary?.category_counts} total={summary?.popup_count}/>
            </div>
            <div className="benchmark-panel benchmark-district-season-card">
              <h2>월별 팝업 개최 추이 {dong !== '전체' ? `(${dong})` : ''}</h2>
              <MonthlyLine data={summary?.monthly_open_counts}/>
            </div>
          </div>
        </div>
        <div className="benchmark-panel benchmark-spaces-panel benchmark-district-space-column">
          <BenchmarkSpaceList region={region} district={dong} />
        </div>
      </section>
      <section className="benchmark-panel benchmark-district-space-bars-card" aria-label="행정동별 등록 대관 공간 수">
        <h2>행정동별 대관 공간 수 ({region})</h2>
        <DistrictBars districts={data?.districts} metric="space_count" selectedDistrict={dong} onSelectDistrict={setDong}/>
      </section>
    </BenchmarkStatus>
  </div>;
}
