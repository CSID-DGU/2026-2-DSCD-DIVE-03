import { useState } from 'react';
import './BenchmarkPages.css';

export default function BenchmarkDistrict({ region, onBack }) {
  const [dong, setDong] = useState('전체');
  return (
    <div className="benchmark">
      <header className="benchmark-hero">
        <div>
          <button type="button" className="benchmark-text-link" onClick={onBack}>← 서울 권역 분석으로 돌아가기</button>
          <h1>팝업 벤치마크 <span>｜ {region} 권역 행정동 분석</span></h1>
          <p>행정동별 팝업 개최 현황을 비교하고 해당 지역의 대관 공간을 살펴보세요.</p>
        </div>
        <div className="benchmark-hero-art" aria-hidden="true">POP-UP</div>
      </header>
      <section className="benchmark-panel benchmark-filter-panel">
        <span className="benchmark-filter-title">권역</span><strong>{region}</strong>
        <label className="benchmark-dong-select">행정동
          <select value={dong} onChange={(event) => setDong(event.target.value)}>
            <option value="전체">전체</option>
          </select>
        </label>
        <small>행정동 목록은 데이터 연동 후 제공됩니다.</small>
      </section>
      <section className="benchmark-district-kpis">
        {['과거 팝업 개최 수', '등록 대관 공간 수', '주요 카테고리', '평균 운영 기간'].map((label) => (
          <div className="benchmark-panel benchmark-kpi" key={label}><span>{label}</span><strong>—</strong><small>데이터 연동 예정</small></div>
        ))}
      </section>
      <section className="benchmark-district-grid">
        <div className="benchmark-panel"><h2>행정동별 팝업 분포</h2><div className="benchmark-placeholder tall">행정동 지도 · 연동 예정</div></div>
        <div className="benchmark-district-middle">
          <div className="benchmark-panel"><h2>행정동별 팝업 개최 건수</h2><div className="benchmark-placeholder small">비교 차트 · 연동 예정</div></div>
          <div className="benchmark-panel"><h2>팝업 카테고리 비중</h2><div className="benchmark-placeholder small">도넛 차트 · 연동 예정</div></div>
        </div>
        <div className="benchmark-panel"><h2>대관 공간 목록</h2><p className="benchmark-subtext">선택한 행정동에 등록된 대관 공간을 표시합니다.</p><div className="benchmark-placeholder tall">공간 목록 · 연동 예정</div></div>
      </section>
      <section className="benchmark-bottom-grid">
        <div className="benchmark-panel"><h2>월별 팝업 개최 추이</h2><div className="benchmark-placeholder small">추이 차트 · 연동 예정</div></div>
        <div className="benchmark-panel"><h2>행정동별 대관 공간 수</h2><div className="benchmark-placeholder small">공간 비교 차트 · 연동 예정</div></div>
      </section>
    </div>
  );
}
