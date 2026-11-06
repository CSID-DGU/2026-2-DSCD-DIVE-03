import { useState } from 'react';
import './App.css';

// 최종 CSV 확인(2026-11-06): 공간 983개 / 팝업 6,383개.
// region_ids와 category_id에는 임시 영문 ID 대신 CSV의 실제 한글 분류값을 저장합니다.
// FastAPI 연동 시 백엔드와 이 한글 값(또는 변환 테이블)을 API 계약으로 확정해야 합니다.
const REGIONS = [
  { value: '성수', label: '성수', count: 322 },
  { value: '강남·서초', label: '강남·서초', count: 191 },
  { value: '홍대·신촌', label: '홍대·신촌', count: 149 },
  { value: '종로·을지로·명동', label: '종로·을지로·명동', count: 123 },
  { value: '용산', label: '용산', count: 114 },
  { value: '기타', label: '기타', count: 62 },
  { value: '잠실', label: '잠실', count: 22 },
];

// 팝업_final.csv의 category 고유값 12개 (출현 건수 내림차순)
const CATEGORIES = [
  { value: '패션', label: '패션', count: 1816 },
  { value: '애니/캐릭터', label: '애니/캐릭터', count: 1108 },
  { value: '뷰티', label: '뷰티', count: 860 },
  { value: 'F&B', label: 'F&B', count: 817 },
  { value: '라이프스타일', label: '라이프스타일', count: 644 },
  { value: '연예인/셀럽', label: '연예인/셀럽', count: 347 },
  { value: '엔터테인먼트', label: '엔터테인먼트', count: 266 },
  { value: '기타', label: '기타', count: 218 },
  { value: '문구/아트', label: '문구/아트', count: 145 },
  { value: '디지털/테크', label: '디지털/테크', count: 92 },
  { value: '키즈/반려동물', label: '키즈/반려동물', count: 69 },
  { value: '지역상생', label: '지역상생', count: 1 },
];

// 공간 CSV의 <male|female>_<AGE>_ratio 컬럼과 1:1로 대응합니다.
const AGES = [
  { key: '0_9', label: '0~9세' },
  { key: '10s', label: '10대' },
  { key: '20s', label: '20대' },
  { key: '30s', label: '30대' },
  { key: '40s', label: '40대' },
  { key: '50s', label: '50대' },
  { key: '60s', label: '60대' },
  { key: '70plus', label: '70대 이상' },
];
const TARGETS = [
  ...['female', 'male'].flatMap((gender) =>
    AGES.map(({ key, label }) => ({
      value: `${gender}_${key}`,
      label: `${gender === 'female' ? '여성' : '남성'} ${label}`,
      ratioColumn: `${gender}_${key}_ratio`,
    })),
  ),
];

// 프리셋은 UI 편의 기능입니다. (실제 데이터의 최소 3만원~최대 1억5천만원과 별개)
// '직접 입력'을 통해 모든 양의 금액(만원 단위)을 지정할 수 있습니다.
const BUDGETS = [
  100_000, 300_000, 500_000, 1_000_000, 2_000_000, 3_000_000,
  5_000_000, 8_000_000, 10_000_000, 15_000_000, 20_000_000,
  30_000_000, 50_000_000, 100_000_000, 150_000_000,
];

// 공간 면적에서 300평까지로 우선 설정한 이유는, 공간 면적이 300평을 초과하는 경우가 전체 공간의 약 5% 정도로 적고, 대부분의 브랜드가 300평 이하 공간을 선호하기 때문입니다. 
// (983개 공간 중 931개가 300평 이하, 52개가 300평 초과)
const MAX_AREA = 5000; // 공간_final_최종본.csv area_pyeong 최댓값
const DEFAULT_SLIDER_MAX = 300; // 자주 사용하는 범위의 조작 편의성 확보
const INITIAL_FILTERS = {
  max_budget_krw: 15_000_000,
  start_date: '',
  end_date: '',
  region_ids: [],
  area_min_pyeong: 80,
  area_max_pyeong: 100,
  category_id: null,
  target_customers: [],
  brand_url: null,
};

const getLabel = (options, value) => options.find((option) => option.value === value)?.label ?? value;
const formatBudget = (value) => `${(value / 10_000).toLocaleString('ko-KR')}만원`;

function getLocalToday() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function validateFilters(filters) {
  const errors = {};
  if (!filters.max_budget_krw || filters.max_budget_krw <= 0) {
    errors.max_budget_krw = '최대 예산을 선택해주세요.';
  }
  if (!filters.start_date || !filters.end_date) {
    errors.period = '운영 시작일과 종료일을 모두 선택해주세요.';
  } else if (filters.end_date < filters.start_date) {
    errors.period = '종료일은 시작일보다 빠를 수 없어요.';
  } else if (filters.start_date < getLocalToday()) {
    errors.period = '운영 시작일은 오늘 이후로 선택해주세요.';
  }
  if (filters.region_ids.length < 1 || filters.region_ids.length > 3) {
    errors.region_ids = '지역을 1~3개 선택해주세요.';
  }
  if (filters.area_min_pyeong < 0 || filters.area_max_pyeong < filters.area_min_pyeong) {
    errors.area = '희망 면적 범위를 확인해주세요.';
  }
  if (filters.brand_url) {
    try {
      const url = new URL(filters.brand_url);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('invalid protocol');
    } catch {
      errors.brand_url = 'http:// 또는 https://로 시작하는 올바른 URL을 입력해주세요.';
    }
  }
  return errors;
}

function Icon({ name, size = 16 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'calendar') return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>;
  if (name === 'pin') return <svg {...common}><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
  if (name === 'chevron') return <svg {...common}><path d="m6 9 6 6 6-6"/></svg>;
  if (name === 'arrow') return <svg {...common}><path d="M4 12h16m-7-7 7 7-7 7"/></svg>;
  if (name === 'check') return <svg {...common}><path d="m5 12 4 4L19 6"/></svg>;
  if (name === 'users') return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
  return null;
}

function OptionPicker({ options, value, onChange, placeholder, multiple = false, max, label, countUnit }) {
  const selected = multiple ? value : value ? [value] : [];

  const toggle = (optionValue) => {
    if (multiple) {
      if (selected.includes(optionValue)) onChange(selected.filter((item) => item !== optionValue));
      else if (!max || selected.length < max) onChange([...selected, optionValue]);
    } else {
      onChange(value === optionValue ? null : optionValue);
    }
  };

  return (
    <details className="option-picker">
      <summary className="picker-summary" aria-label={label}>
        <span className="picker-chips">
          {selected.length ? selected.map((item) => (
            <span className="chip" key={item}>{getLabel(options, item)}</span>
          )) : <span className="picker-placeholder">{placeholder}</span>}
          <span className="chip chip-add">+ {multiple ? '추가' : '변경'}</span>
        </span>
        <Icon name="chevron" size={15} />
      </summary>
      <div className="picker-menu" role="group" aria-label={`${label} 선택 옵션`}>
        {options.map((option) => {
          const checked = selected.includes(option.value);
          const disabled = !checked && multiple && Boolean(max) && selected.length >= max;
          return (
            <button type="button" className={`picker-option ${checked ? 'is-checked' : ''}`} key={option.value} onClick={() => toggle(option.value)} disabled={disabled} aria-pressed={checked}>
              <span className="picker-option-check">{checked ? <Icon name="check" size={13} /> : null}</span>
              <span className="picker-option-label">{option.label}</span>
              {Number.isFinite(option.count) && (
                <span className="picker-option-meta">{option.count.toLocaleString('ko-KR')}개 {countUnit}</span>
              )}
            </button>
          );
        })}
        {max && <span className="picker-hint">최대 {max}개 선택 가능 · 선택한 항목을 다시 누르면 해제돼요.</span>}
      </div>
    </details>
  );
}

function StepIndicator({ currentStep }) {
  const steps = [
    ['기본 조건 입력', '기본 정보 입력'],
    ['추천 기준 입력', '공간 추천 기준 중요도 설정'],
    ['맞춤 추천', '최적의 후보 공간 선별'],
  ];
  return (
    <nav className="step-indicator" aria-label="추천 진행 단계">
      {steps.map(([title, description], index) => (
        <div className={`step-item ${currentStep === index + 1 ? 'is-active' : ''} ${currentStep > index + 1 ? 'is-done' : ''}`} key={title}>
          <span className="step-number">{currentStep > index + 1 ? <Icon name="check" size={15} /> : index + 1}</span>
          <span><strong>{title}</strong><small>{description}</small></span>
        </div>
      ))}
    </nav>
  );
}

function AreaRange({ min, max, onMinChange, onMaxChange }) {
  const [expanded, setExpanded] = useState(max > DEFAULT_SLIDER_MAX);
  // 직접 입력으로 300평을 넘겨도 슬라이더가 자동으로 전체 범위로 확장됩니다.
  const isExpanded = expanded || min > DEFAULT_SLIDER_MAX || max > DEFAULT_SLIDER_MAX;
  const sliderMax = isExpanded ? MAX_AREA : DEFAULT_SLIDER_MAX;
  const start = (min / sliderMax) * 100;
  const end = (max / sliderMax) * 100;
  const clampArea = (value) => Math.min(MAX_AREA, Math.max(0, Number(value) || 0));

  const toggleScale = () => {
    if (isExpanded) {
      onMinChange(Math.min(min, DEFAULT_SLIDER_MAX));
      onMaxChange(Math.min(max, DEFAULT_SLIDER_MAX));
      setExpanded(false);
    } else {
      setExpanded(true);
    }
  };

  return (
    <div className="area-wrap">
      <div className="area-control">
        <span className="area-number">{min}평</span>
        <div className="range-container" style={{ '--range-start': `${start}%`, '--range-end': `${end}%` }}>
          <div className="range-bar" />
          <input aria-label="희망 최소 면적 슬라이더" type="range" min="0" max={sliderMax} step="1" value={Math.min(min, sliderMax)} onChange={(event) => onMinChange(Math.min(Number(event.target.value), max))} />
          <input aria-label="희망 최대 면적 슬라이더" type="range" min="0" max={sliderMax} step="1" value={Math.min(max, sliderMax)} onChange={(event) => onMaxChange(Math.max(Number(event.target.value), min))} />
        </div>
        <span className="area-number">{max}평</span>
      </div>
      <div className="area-extra">
        <div className="area-exact-inputs">
          <label>최소 <input aria-label="희망 최소 면적 직접 입력" type="number" min="0" max={MAX_AREA} step="1" value={min} onChange={(event) => onMinChange(Math.min(clampArea(event.target.value), max))} />평</label>
          <span>~</span>
          <label>최대 <input aria-label="희망 최대 면적 직접 입력" type="number" min="0" max={MAX_AREA} step="1" value={max} onChange={(event) => onMaxChange(Math.max(clampArea(event.target.value), min))} />평</label>
        </div>
        <button type="button" className="area-scale-button" aria-pressed={isExpanded} onClick={toggleScale}>
          {isExpanded ? '300평 범위로 축소' : '300평 초과 공간도 선택'}
        </button>
      </div>
    </div>
  );
}

function ConditionsPage({ filters, setFilters, onNext }) {
  const [errors, setErrors] = useState({});
  const [budgetMode, setBudgetMode] = useState(BUDGETS.includes(filters.max_budget_krw) ? 'preset' : 'custom');
  const setField = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined, ...(field === 'start_date' || field === 'end_date' ? { period: undefined } : {}) }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validateFilters(filters);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onNext();
  };

  return (
    <form className="conditions-form" onSubmit={handleSubmit} noValidate>
      <section className="form-card" aria-labelledby="basic-title">
        <div className="card-heading"><span className="section-tag">STEP 1</span><h2 id="basic-title">기본 조건을 설정해주세요</h2></div>
        <p className="card-description">최대 예산 · 운영 기간 · 희망 지역은 필수 입력 조건이며, 희망 면적은 공간 면적 적합도 평가에도 활용돼요.</p>
        <div className="fields-grid">
          <div className="field">
            <label htmlFor="max-budget">최대 예산 <span>(필수)</span></label>
            <div className="select-shell">
              <select id="max-budget" value={budgetMode === 'custom' ? 'custom' : String(filters.max_budget_krw)} onChange={(event) => {
                if (event.target.value === 'custom') setBudgetMode('custom');
                else { setBudgetMode('preset'); setField('max_budget_krw', Number(event.target.value)); }
              }}>
                {BUDGETS.map((budget) => <option key={budget} value={budget}>{formatBudget(budget)}</option>)}
                <option value="custom">직접 입력 (만원)</option>
              </select>
              <Icon name="chevron" size={15} />
            </div>
            {budgetMode === 'custom' && (
              <div className="budget-custom">
                <input aria-label="최대 예산 직접 입력 (만원)" type="number" min="1" step="1" value={filters.max_budget_krw / 10_000} onChange={(event) => setField('max_budget_krw', Number(event.target.value) * 10_000)} />
                <span>만원</span>
              </div>
            )}
            {errors.max_budget_krw && <small className="field-error" role="alert">{errors.max_budget_krw}</small>}
          </div>

          <div className="field">
            <label htmlFor="start-date">운영 기간 <span>(필수)</span></label>
            <div className="date-pair"><Icon name="calendar" size={16} /><input id="start-date" aria-label="운영 시작일" type="date" min={getLocalToday()} value={filters.start_date} onChange={(event) => setField('start_date', event.target.value)} /><span className="date-separator">~</span><input aria-label="운영 종료일" type="date" min={filters.start_date || getLocalToday()} value={filters.end_date} onChange={(event) => setField('end_date', event.target.value)} /></div>
            {errors.period && <small className="field-error" role="alert">{errors.period}</small>}
          </div>

          <div className="field">
            <label>희망 지역 <span>(최대 3개 선택, 필수)</span></label>
            <OptionPicker label="희망 지역" options={REGIONS} countUnit="공간" value={filters.region_ids} onChange={(value) => setField('region_ids', value)} placeholder="지역을 선택해주세요" multiple max={3} />
            <small className="field-hint">'기타'는 목록에 없는 이외 다수의 지역을 포함하고 있습니다.</small>
            {errors.region_ids && <small className="field-error" role="alert">{errors.region_ids}</small>}
          </div>

          <div className="field">
            <label>희망 면적 <span>(필수)</span></label>
            <AreaRange min={filters.area_min_pyeong} max={filters.area_max_pyeong} onMinChange={(value) => setField('area_min_pyeong', value)} onMaxChange={(value) => setField('area_max_pyeong', value)} />
            <small className="field-hint">최대 5,000평의 공간까지 준비되어 있어요.</small>
            {errors.area && <small className="field-error" role="alert">{errors.area}</small>}
          </div>

          <div className="field">
            <label>타깃 고객 <span className="optional">(선택)</span></label>
            <OptionPicker label="타깃 고객" options={TARGETS} value={filters.target_customers} onChange={(value) => setField('target_customers', value)} placeholder="성별·연령대를 선택해주세요 (0~9세 포함)" multiple />
          </div>

          <div className="field">
            <label>브랜드 카테고리 <span className="optional">(선택)</span></label>
            <OptionPicker label="브랜드 카테고리" options={CATEGORIES} countUnit="팝업" value={filters.category_id} onChange={(value) => setField('category_id', value)} placeholder="카테고리를 선택해주세요" />
          </div>
        </div>
      </section>

      <section className="form-card brand-card" aria-labelledby="brand-title">
        <div className="card-heading"><span className="section-tag">STEP 2</span><h2 id="brand-title">브랜드 정보를 입력해주세요 (선택)</h2></div>
        <p className="card-description">브랜드의 이미지와 공간 분위기를 분석하여 공간과의 추구미(美) 적합도를 추천에 반영합니다.</p>
        <div className="field">
          <label htmlFor="brand-url">브랜드 공식 홈페이지 URL</label>
          <input id="brand-url" className="text-input" type="url" inputMode="url" placeholder="예) https://www.POPCAST.com" value={filters.brand_url ?? ''} onChange={(event) => setField('brand_url', event.target.value.trim() || null)} />
          {errors.brand_url && <small className="field-error" role="alert">{errors.brand_url}</small>}
        </div>
      </section>

      <button className="primary-button" type="submit">다음 · 추천 기준 설정하기 <Icon name="arrow" size={18} /></button>
      <p className="form-note">선택지: 최종 CSV 기준 지역 7개 · 카테고리 12개 · 성별·연령 조합 16개 / 현재는 Mock 입력으로 서버 전송 없음</p>
    </form>
  );
}

// 첫 번째 화면의 입력/검증/다음 단계 이동을 확인하기 위한 임시 화면입니다.
// 다음 작업에서 실제 Soft Filter 선택·정렬·중요도 UI로 교체합니다.
function StepTwoPreview({ filters, onBack }) {
  const factorPrerequisites = [
    { name: '타깃 고객 비율', ready: filters.target_customers.length > 0, needed: '타깃 고객' },
    { name: '브랜드–공간 분위기 일치도', ready: Boolean(filters.brand_url), needed: '브랜드 URL' },
    { name: '동종 팝업 개최 이력', ready: Boolean(filters.category_id), needed: '브랜드 카테고리' },
    { name: '지하철 접근성', ready: true },
    { name: '대관료 적합도', ready: true },
    { name: '공간 면적 적합도', ready: true },
  ];
  return (
    <section className="preview-card">
      <span className="section-tag">추천 기준 설정 · 개발용 미리보기</span>
      <h2>기본 조건 입력이 완료됐어요!</h2>
      <p>첫 화면의 입력 검증과 단계 이동이 정상 동작합니다. 다음 구현 단계에서 6개 Soft Filter의 체크·순위 변경·중요도 차이를 추가할 거예요.</p>
      <h3>입력한 조건</h3>
      <div className="review-grid">
        <div><small>최대 예산</small><strong>{formatBudget(filters.max_budget_krw)}</strong></div>
        <div><small>운영 기간</small><strong>{filters.start_date} ~ {filters.end_date}</strong></div>
        <div><small>희망 지역</small><strong>{filters.region_ids.map((id) => getLabel(REGIONS, id)).join(', ')}</strong></div>
        <div><small>희망 면적</small><strong>{filters.area_min_pyeong}~{filters.area_max_pyeong}평</strong></div>
        <div><small>타깃 고객</small><strong>{filters.target_customers.length ? filters.target_customers.map((item) => getLabel(TARGETS, item)).join(', ') : '선택 안 함'}</strong></div>
        <div><small>브랜드 카테고리</small><strong>{filters.category_id || '선택 안 함'}</strong></div>
      </div>
      <h3>Soft Filter 선택 가능 여부</h3>
      <div className="factor-preview-list">
        {factorPrerequisites.map((factor) => <div className="factor-preview-row" key={factor.name}><span>{factor.name}</span><span className={factor.ready ? 'ready' : 'not-ready'}>{factor.ready ? '선택 가능' : `${factor.needed} 입력 필요`}</span></div>)}
      </div>
      <details className="debug-details"><summary>API 요청용 hard_filters JSON 확인</summary><p>region_ids와 category_id는 실제 CSV의 한글 분류값입니다. API와 연결하기 전에 백엔드와 표현 방식을 맞추면 됩니다.</p><pre>{JSON.stringify(filters, null, 2)}</pre></details>
      <button type="button" className="secondary-button" onClick={onBack}>← 기본 조건 수정하기</button>
    </section>
  );
}

function App() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [currentStep, setCurrentStep] = useState(1);
  const goToStep = (step) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-mark">P</span><span>POPCAST</span></div>
          <nav className="top-nav" aria-label="상단 메뉴"><span className="nav-link is-current">공간 추천</span><span className="nav-link is-muted" title="추후 구현 예정">팝업 현황</span></nav>
          <span className="demo-pill">MOCK</span>
        </div>
      </header>

      <main className="page-content">
        <div className="hero-heading"><span className="hero-eyebrow">데이터 기반 팝업스토어 공간 추천 및 출점 의사결정 지원 시스템</span><h1>좋은 팝업은,<br />좋은 공간에서 시작됩니다.</h1><p>브랜드와 팝업 타깃, 출점 조건에 맞는 팝업 공간을 다양한 데이터를 기반으로 분석하여 추천받고, 후보별 적합도와 추천 근거를 한눈에 비교해보세요.</p></div>
        <StepIndicator currentStep={currentStep} />
        {currentStep === 1 ? <ConditionsPage filters={filters} setFilters={setFilters} onNext={() => goToStep(2)} /> : <StepTwoPreview filters={filters} onBack={() => goToStep(1)} />}
      </main>
    </div>
  );
}

export default App;
