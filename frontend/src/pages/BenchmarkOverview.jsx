import './BenchmarkPages.css';

const REGIONS = ['전체', '성수', '홍대·신촌', '잠실', '강남·서초', '용산', '종로·을지로·명동', '기타'];

export default function BenchmarkOverview({ selectedRegion, onSelectRegion, onOpenDistrict }) {
  const region = selectedRegion || '전체';
  return (
    <div className="benchmark">
      <header className="benchmark-hero">
        <div>
          <span className="benchmark-eyebrow">POPCAST · BENCHMARK</span>
          <h1>팝업 벤치마크 <span>｜ 서울 권역 분석</span></h1>
          <p>서울 권역별 과거 팝업 운영 패턴과 대관 공간 특성을 탐색해 보세요.</p>
        </div>
        <div className="benchmark-hero-art" aria-hidden="true">POP-UP</div>
      </header>

      <section className="benchmark-panel benchmark-filter-panel" aria-label="벤치마크 권역 선택">
        <span className="benchmark-filter-title">권역 선택</span>
        <div className="benchmark-region-controls">
          {REGIONS.map((item) => (
            <button key={item} type="button" className={`benchmark-chip ${region === item ? 'is-active' : ''}`}
              aria-pressed={region === item} onClick={() => onSelectRegion(item)}>{item}</button>
          ))}
        </div>
      </section>

      <section className="benchmark-overview-grid">
        <div className="benchmark-panel benchmark-map-placeholder">
          <h2>서울 7개 권역 팝업 현황</h2>
          <p>권역별 개최 현황 지도</p>
          <div className="benchmark-placeholder">지도 · 데이터 연동 예정</div>
        </div>
        <div className="benchmark-panel benchmark-summary">
          <div className="benchmark-title-line">
            <div>
              <span className="benchmark-eyebrow">선택 권역</span>
              <h2>{region === '전체' ? '서울 전체' : region}</h2>
            </div>
            {region !== '전체' && region !== '기타' && (
              <button type="button" className="benchmark-primary" onClick={() => onOpenDistrict(region)}>행정동 상세 보기 →</button>
            )}
          </div>
          <div className="benchmark-kpi-grid">
            {['과거 팝업 개최 수', '주요 카테고리', '등록 대관 공간 수', '평균 운영 기간', '평균 대관료', '주요 면적대'].map((label) => (
              <div className="benchmark-kpi" key={label}><span>{label}</span><strong>—</strong><small>데이터 연동 예정</small></div>
            ))}
          </div>
          {region === '기타' && <p className="benchmark-note">기타 권역은 전체 통계에 포함되며 행정동 상세 분석은 제공하지 않습니다.</p>}
        </div>
      </section>

      <section className="benchmark-chart-grid">
        <div className="benchmark-panel"><h2>권역별 인기 카테고리</h2><div className="benchmark-placeholder small">카테고리 비교 차트 · 연동 예정</div></div>
        <div className="benchmark-panel"><h2>{region === '전체' ? '권역별 주요 생활인구' : `${region} 생활인구 구성비`}</h2><div className="benchmark-placeholder small">{region === '전체' ? '권역별 대표 인구 목록' : '성별·연령대 도넛 차트'} · 연동 예정</div></div>
        <div className="benchmark-panel"><h2>월별 팝업 시즌성</h2><div className="benchmark-placeholder small">월별 개최 추이 차트 · 연동 예정</div></div>
      </section>
      <aside className="benchmark-insight">✧ 인사이트 <span>실제 팝업 이력과 생활인구 데이터를 연동한 뒤 권역별 주요 특징을 표시합니다.</span></aside>
    </div>
  );
}
