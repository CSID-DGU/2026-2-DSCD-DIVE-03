import BenchmarkGeoMap from './BenchmarkGeoMap';
import BenchmarkPopulation from './BenchmarkPopulation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getBenchmarkRegions } from '../services/benchmark';
import { BenchmarkStatus, KPI, CategoryBars, MonthlyLine, numberLabel, percentLabel, priceLabel } from './BenchmarkCharts';
import './BenchmarkPages.css';

const REGIONS = ['전체', '성수', '홍대·신촌', '잠실', '강남·서초', '용산', '종로·을지로·명동', '기타'];

function RegionInsight({ summary, region }) {
  if (!summary?.popup_count) return <span>현재 조회 조건에 해당하는 팝업 개최 이력이 없습니다.</span>;
  const peak = [...(summary.monthly_open_counts || [])].sort((a, b) => b.count - a.count)[0];
  const category = summary.top_category ? `${summary.top_category} 카테고리(${percentLabel(summary.top_category_share)})` : '카테고리 정보 없음';
  return <span>{region === '전체' ? '서울 전체' : region}에서는 {category}의 개최 비중이 가장 높고, {peak?.count ? `${peak.month}월에 개최 시작 건수가 가장 많았습니다.` : '월별 개최 자료가 충분하지 않습니다.'} 과거 개최 빈도가 흥행을 보장하지는 않습니다.</span>;
}

export default function BenchmarkOverview({ selectedRegion, onSelectRegion, onOpenDistrict }) {
  const region = selectedRegion || '전체';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    getBenchmarkRegions({ signal: controller.signal })
      .then(result => { setData(result); setError(''); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const summary = useMemo(() => region === '전체'
    ? data?.overall
    : data?.regions?.find(item => item.region === region), [data, region]);
  const canDrillDown = region !== '전체' && Boolean(data?.regions?.find(item => item.region === region)?.has_district_detail);
  const overall = data?.overall;
  const kpis = [
    ['과거 팝업 개최 수', numberLabel(summary?.popup_count, '건'), '기준일 이전 개최 시작'],
    ['주요 카테고리', summary?.top_category || '—', percentLabel(summary?.top_category_share)],
    ['등록 대관 공간 수', numberLabel(summary?.space_count, '개'), '대관 공간 등록 데이터'],
    ['평균 운영 기간', numberLabel(summary?.average_duration_days, '일'), '시작일·종료일 유효 이력'],
    ['평균 등록 대관료', priceLabel(summary?.average_listed_price_krw), '과거 집행 예산 아님'],
    ['면적 중앙값', numberLabel(summary?.median_area_pyeong, '평'), '등록 대관 공간 기준'],
  ];

  return <div className="benchmark">
    <header className="benchmark-hero">
      <div><span className="benchmark-eyebrow">POPCAST · BENCHMARK</span>
        <h1>팝업 벤치마크 <span>｜ 서울 권역 분석</span></h1>
        <p>서울 권역별 과거 팝업 운영 패턴과 대관 공간 특성을 탐색해 보세요.</p>
      </div>
      <div className="benchmark-hero-art" aria-hidden="true">POP-UP</div>
    </header>

    <section className="benchmark-panel benchmark-filter-panel" aria-label="벤치마크 권역 선택">
      <span className="benchmark-filter-title">권역 선택</span>
      <div className="benchmark-region-controls">
        {REGIONS.map(item => <button key={item} type="button" className={`benchmark-chip ${region === item ? 'is-active' : ''}`} aria-pressed={region === item} onClick={() => onSelectRegion(item)}>{item}</button>)}
      </div>
    </section>

    <BenchmarkStatus loading={loading} error={error} onRetry={retry}>
      <section className="benchmark-overview-grid">
        <div className="benchmark-panel benchmark-map-placeholder">
          <h2>서울 7개 권역 팝업 현황</h2>
          <p>실제 팝업 개최 좌표의 위치 분포도입니다. 권역별 경계선은 표시하지 않습니다.</p>
          <BenchmarkGeoMap region={region} showRegionCenters onSelectRegion={onSelectRegion} />
          <div className="benchmark-region-totals">
            {(data?.regions || []).map(item => <button key={item.region} className={`benchmark-region-total ${region === item.region ? 'is-active' : ''}`} onClick={() => onSelectRegion(item.region)} type="button"><span>{item.region}</span><strong>{numberLabel(item.popup_count, '건')}</strong></button>)}
          </div>
        </div>
        <div className="benchmark-panel benchmark-summary">
          <div className="benchmark-title-line"><div><span className="benchmark-eyebrow">선택 권역</span><h2>{region === '전체' ? '서울 전체' : region}</h2></div>
            {canDrillDown && <button type="button" className="benchmark-primary" onClick={() => onOpenDistrict(region)}>행정동 상세 보기 →</button>}
          </div>
          <div className="benchmark-kpi-grid">{kpis.map(([label, value, footnote]) => <KPI key={label} label={label} value={value} footnote={footnote}/>)}</div>
          {region === '기타' && <p className="benchmark-note">기타 권역은 전체 통계에 포함되며 행정동 상세 분석은 제공하지 않습니다.</p>}
          <p className="benchmark-chart-footnote">팝업: {data?.popup_date_basis || '개최 시작일 기준'} · 대관료: 등록 가격(기간 필터 비적용)</p>
        </div>
      </section>

      <section className="benchmark-chart-grid">
        <div className="benchmark-panel"><h2>{region === '전체' ? '서울 전체 인기 카테고리' : `${region} 인기 카테고리`}</h2><CategoryBars data={summary?.category_counts} total={summary?.popup_count} compareData={region === '전체' ? null : overall?.category_counts}/></div>
        <div className="benchmark-panel"><h2>{region === '전체' ? '권역별 주요 생활인구 수' : `${region} 성별·연령별 생활인구 수`}</h2>
          <BenchmarkPopulation region={region} />
        </div>
        <div className="benchmark-panel"><h2>월별 팝업 시즌성 {region !== '전체' ? `(${region})` : ''}</h2><MonthlyLine data={summary?.monthly_open_counts}/></div>
      </section>
      <aside className="benchmark-insight">✧ 인사이트 <RegionInsight summary={summary} region={region}/></aside>
    </BenchmarkStatus>
  </div>;
}
