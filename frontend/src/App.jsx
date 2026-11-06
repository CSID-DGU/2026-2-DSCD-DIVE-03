import { useRef, useState } from 'react';
import './App.css';
import RecommendationResults from './components/RecommendationResults';
import WhatIfAnalysis from './components/WhatIfAnalysis';
import TradeOffAnalysis from './components/TradeOffAnalysis';

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

// 두 날짜 모두 전체 입력창과 달력 버튼으로 날짜 선택기를 열 수 있습니다.
// Chrome/Edge 등에서 showPicker를 지원하며, 미지원 브라우저는 입력창 포커스로 대체합니다.
function DateField({ id, label, value, min, onChange }) {
  const inputRef = useRef(null);
  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
        return;
      }
    } catch {
      // 브라우저 보안 제한 등으로 showPicker가 실패하면 직접 입력할 수 있도록 포커스합니다.
    }
    input.focus();
  };
  return (
    <div className="date-field">
      <input
        ref={inputRef}
        id={id}
        aria-label={label}
        type="date"
        min={min}
        value={value}
        onClick={openPicker}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" className="date-open-button" aria-label={`${label} 달력 열기`} onClick={openPicker}>
        <Icon name="calendar" size={15} />
      </button>
    </div>
  );
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
    setFilters((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'start_date' && prev.end_date && value && value > prev.end_date) {
        updated.end_date = ''; // 시작일이 종료일보다 늦어지면 종료일을 다시 선택하도록 합니다.
      }
      return updated;
    });
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
            <div className="date-pair">
              <DateField id="start-date" label="운영 시작일" min={getLocalToday()} value={filters.start_date} onChange={(value) => setField('start_date', value)} />
              <span className="date-separator" aria-hidden="true">~</span>
              <DateField id="end-date" label="운영 종료일" min={filters.start_date || getLocalToday()} value={filters.end_date} onChange={(value) => setField('end_date', value)} />
            </div>
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
            <OptionPicker label="타깃 고객" options={TARGETS} value={filters.target_customers} onChange={(value) => setField('target_customers', value)} placeholder="성별·연령대를 선택해주세요" multiple />
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

// STEP 02: 11월 4일 확정된 6개 Soft Filter 및 API-01의 필드명 사용
// 중요도 차이(s)는 0~3, selected는 중요도 내림차순, gaps.length === selected.length - 1
// 평가요소별 의미를 반영한 벡터 아이콘 (별도 아이콘 라이브러리 필요 없음)
function CriterionIcon({ name }) {
  const props = {
    width: 19, height: 19, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round',
    strokeLinejoin: 'round', 'aria-hidden': true,
  };
  if (name === 'people') return <svg {...props}><circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/></svg>;
  if (name === 'palette') return <svg {...props}><path d="M12 3a9 9 0 1 0 0 18h1.6a2 2 0 0 0 1.5-3.3 2 2 0 0 1 1.5-3.3H19A3 3 0 0 0 22 11a9 9 0 0 0-10-8Z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="18.5" cy="11" r="1"/></svg>;
  if (name === 'store') return <svg {...props}><path d="M3 10h18l-2-6H5l-2 6Zm0 0v10h18V10M7 20v-7h5v7M3 10a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/></svg>;
  if (name === 'train') return <svg {...props}><rect x="5" y="3" width="14" height="16" rx="4"/><path d="M8 7h8M7 12h10M8 21l2-2m6 0 2 2"/><circle cx="9" cy="16" r="1"/><circle cx="15" cy="16" r="1"/></svg>;
  if (name === 'wallet') return <svg {...props}><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 9V5a2 2 0 0 1 2-2h13M17 12h4v5h-4a2.5 2.5 0 0 1 0-5Z"/><circle cx="17.5" cy="14.5" r=".5"/></svg>;
  if (name === 'ruler') return <svg {...props}><path d="m4 15 11-11 6 6-11 11-6-6Zm8-8 2 2m-5 1 2 2m-5 1 2 2m8-11 2 2"/></svg>;
  return null;
}

const SOFT_FILTER_META = [
  {
    id: 'target_ratio', label: '타깃 고객 비율', icon: 'people',
    brief: '원하는 성별·연령대의 방문 비중',
    detail: '선택한 타깃 성별·연령대 고객이 해당 공간 지역의 방문 인구에서 차지하는 비중이에요.',
    requires: 'target_customers', requiredLabel: '타깃 고객', autoSelect: true,
  },
  {
    id: 'brand_space_fit', label: '브랜드–공간 분위기 일치도', icon: 'palette',
    brief: '브랜드 이미지와 공간 분위기의 유사성',
    detail: '브랜드의 이미지·추구미와 공간의 이미지·디자인·감성적 특성의 유사한 정도를 비교해요.',
    requires: 'brand_url', requiredLabel: '브랜드 공식 홈페이지 URL', autoSelect: true,
  },
  {
    id: 'popup_history', label: '동종 팝업 개최 이력', icon: 'store',
    brief: '해당 지역에서 동종 카테고리 팝업이 열린 빈도',
    detail: '해당 공간 지역에서 과거에 동일 카테고리의 팝업이 얼마나 많이 개최되었는지 평가해요.',
    requires: 'category_id', requiredLabel: '브랜드 카테고리', autoSelect: true,
  },
  {
    id: 'subway_accessibility', label: '지하철 접근성', icon: 'train',
    brief: '가장 가까운 지하철역까지의 거리',
    detail: '공간에서 가장 가까운 지하철역까지의 거리를 비교해요. 거리가 짧을수록 유리해요.',
  },
  {
    id: 'rental_price_fit', label: '대관료 적합도', icon: 'wallet',
    brief: '설정한 최대 예산 대비 공간의 대관료 수준',
    detail: '사용자가 설정한 최대 예산에 비해 실제 공간 대관료가 얼마나 부담 없는지 평가해요.',
  },
  {
    id: 'area_fit', label: '공간 면적 적합도', icon: 'ruler', autoSelect: true,
    brief: '희망 면적 대비 공간 면적 수준',
    detail: '설정한 희망 면적에 얼마나 잘 맞는지 평가해요. 희망 범위보다 좁으면 더 큰 패널티가 적용돼요.',
  },
];

const GAP_CHOICES = [
  { value: 0, text: '비슷함' },
  { value: 1, text: '조금 더 중요함' },
  { value: 2, text: '더 중요함' },
  { value: 3, text: '훨씬 더 중요함' },
];

function isAvailable(criterion, filters) {
  if (criterion.id === 'area_fit') return Number.isFinite(filters.area_min_pyeong)
    && Number.isFinite(filters.area_max_pyeong)
    && filters.area_min_pyeong >= 0
    && filters.area_max_pyeong >= filters.area_min_pyeong;
  if (criterion.requires === 'target_customers') return filters.target_customers.length > 0;
  if (criterion.requires === 'brand_url') return Boolean(filters.brand_url);
  if (criterion.requires === 'category_id') return Boolean(filters.category_id);
  return true;
}

function normalizeGaps(gaps, selectedCount) {
  const needed = Math.max(0, selectedCount - 1);
  return Array.from({ length: needed }, (_, i) => gaps[i] ?? 1);
}

// 자동 선택은 사용자 요청에 따라 4가지 입력 연동 평가요소만 적용합니다.
// 지하철 접근성과 대관료 적합도는 사용자가 직접 체크해야 합니다.
function initialSoftFilters(filters) {
  const selected = SOFT_FILTER_META.filter((item) =>
    item.autoSelect && isAvailable(item, filters),
  ).map((item) => item.id);
  return { selected, importance_gaps: normalizeGaps([], selected.length) };
}

function SoftFilterPage({ filters, softFilters, setSoftFilters, onBack, onNext }) {
  const [infoId, setInfoId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [error, setError] = useState('');
  const selected = softFilters.selected;
  const unselected = SOFT_FILTER_META.filter((item) => !selected.includes(item.id));

  const updateSelected = (nextSelected) => {
    setSoftFilters((previous) => ({
      selected: nextSelected,
      importance_gaps: normalizeGaps(previous.importance_gaps, nextSelected.length),
    }));
    setError('');
  };

  const toggleCriterion = (id) => {
    const item = SOFT_FILTER_META.find((criterion) => criterion.id === id);
    if (!item || !isAvailable(item, filters)) return;
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    updateSelected(next);
  };

  const reorder = (sourceId, targetId) => {
    if (sourceId === targetId) return;
    const from = selected.indexOf(sourceId);
    const to = selected.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...selected];
    next.splice(from, 1);
    next.splice(to, 0, sourceId);
    // importance_gaps는 '순위 사이'의 차이이므로 순서 변경 시 위치별 값을 유지해요.
    updateSelected(next);
  };

  const moveBy = (id, amount) => {
    const index = selected.indexOf(id);
    const target = selected[index + amount];
    if (target) reorder(id, target);
  };

  const setGap = (index, value) => {
    setSoftFilters((previous) => ({
      ...previous,
      importance_gaps: previous.importance_gaps.map((gap, i) => (i === index ? value : gap)),
    }));
  };

  const handleNext = () => {
    if (selected.length === 0) {
      setError('추천에 사용할 평가요소를 최소 1개 선택해 주세요.');
      return;
    }
    onNext();
  };

  const renderCriterion = (criterion, rankIndex = -1) => {
    const active = rankIndex >= 0;
    const available = isAvailable(criterion, filters);
    const disabled = !available;
    const isLast = rankIndex === selected.length - 1;
    return (
      <div
        key={criterion.id}
        className={`criterion-row ${active ? 'is-selected' : 'is-inactive'} ${disabled ? 'is-disabled' : ''} ${overId === criterion.id && draggingId !== criterion.id ? 'is-drop-target' : ''}`}
        onDragOver={(event) => {
          if (active && draggingId && draggingId !== criterion.id) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setOverId(criterion.id);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggingId) reorder(draggingId, criterion.id);
          setDraggingId(null);
          setOverId(null);
        }}
      >
        <button
          type="button" className="criterion-drag" title={active ? '드래그하여 순서 변경' : '선택 후 순서 변경 가능'}
          aria-label={`${criterion.label} 순서 변경 핸들`}
          draggable={active}
          disabled={!active}
          onDragStart={(event) => {
            setDraggingId(criterion.id);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', criterion.id);
          }}
          onDragEnd={() => { setDraggingId(null); setOverId(null); }}
        >⠿</button>
        <input
          className="criterion-checkbox" type="checkbox" checked={active} disabled={disabled}
          aria-label={`${criterion.label} 사용`}
          onChange={() => toggleCriterion(criterion.id)}
        />
        <span className={`criterion-rank ${active ? 'is-visible' : ''}`}>{active ? rankIndex + 1 : '—'}</span>
        <div className="criterion-content">
          <div className="criterion-line">
            <span className="criterion-icon" aria-hidden="true"><CriterionIcon name={criterion.icon} /></span>
            <strong className="criterion-name">{criterion.label}</strong>
            <button
              type="button" className="criterion-info-button"
              aria-label={`${criterion.label} 평가 기준 설명`}
              aria-expanded={infoId === criterion.id}
              onClick={() => setInfoId((previous) => previous === criterion.id ? null : criterion.id)}
            >ⓘ</button>
            <span className="criterion-brief">{criterion.brief}</span>
          </div>
          {infoId === criterion.id && <p className="criterion-explanation">{criterion.detail}</p>}
          {disabled && <p className="criterion-requirement">선택하려면 기본 조건에서 {criterion.requiredLabel}을(를) 입력해야 해요.</p>}
        </div>
        <div className="criterion-actions">
          {active && (
            <div className="criterion-move-buttons" aria-label="순위 조정">
              <button type="button" title="한 순위 위로" aria-label={`${criterion.label} 한 순위 위로`} disabled={rankIndex === 0} onClick={() => moveBy(criterion.id, -1)}>↑</button>
              <button type="button" title="한 순위 아래로" aria-label={`${criterion.label} 한 순위 아래로`} disabled={isLast} onClick={() => moveBy(criterion.id, 1)}>↓</button>
            </div>
          )}
          {active && !isLast ? (
            <select
              className="criterion-gap-select"
              aria-label={`${criterion.label}과 다음 순위 사이 중요도 차이`}
              title="이 기준이 바로 아래 기준보다 얼마나 더 중요한가요?"
              value={softFilters.importance_gaps[rankIndex] ?? 1}
              onChange={(event) => setGap(rankIndex, Number(event.target.value))}
            >
              {GAP_CHOICES.map(({ value, text }) => <option value={value} key={value}>{text}</option>)}
            </select>
          ) : active ? (
            <span className="criterion-last-label">마지막 기준</span>
          ) : disabled ? (
            <button type="button" className="criterion-requirement-button" onClick={onBack}>조건 입력하기</button>
          ) : (
            <span className="criterion-not-selected">선택 안 함</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="soft-filter-page">
      <section className="criteria-panel" aria-labelledby="criteria-title">
        <div className="card-heading"><span className="section-tag">STEP 3</span><h2 id="criteria-title">추천 기준을 설정해주세요</h2></div>
        <p className="card-description">최소 1개 이상 선택해 주세요.</p>
        <div className="criteria-layout">
          <aside className="priority-rail" aria-label="중요도 순서 안내">
            <strong>선택한 기준을<br />중요한 순서대로<br />정렬해 주세요</strong>
            <span className="priority-top">↑</span>
            <small>중요도 높음<br />(1순위)</small>
            <div className="priority-line" />
            <span className="priority-bottom">↓</span>
            <small>중요도 낮음<br />(마지막 순위)</small>
          </aside>
          <div className="criteria-list">
            {selected.map((id, index) => renderCriterion(SOFT_FILTER_META.find((item) => item.id === id), index))}
            {unselected.map((item) => renderCriterion(item))}
          </div>
        </div>
        <div className="criteria-helper">
          <span>ⓘ</span>
          <p>체크박스로 기준을 선택하고, <strong>⠿ 드래그</strong> 또는 <strong>↑↓ 버튼</strong>으로 중요도 순위를 바꿀 수 있어요. 각 기준의 중요도는 <strong>바로 아래 순위와의 차이</strong>를 뜻해요. (마지막 순위에는 차이를 입력하지 않아요)</p>
        </div>
      </section>

      <div className="criteria-footer">
        <div className="criteria-summary">
          <strong>선택한 평가요소 {selected.length}개</strong>
          <span> 중요도 차이는 비슷함(0), 조금 더 중요함(1), 더 중요함(2), 훨씬 더 중요함(3)으로, 해당 기준이 아래 순위에 비해 가지는 중요도 정도를 나타내요.</span>
        </div>
        {error && <p role="alert" className="criteria-error">{error}</p>}
        <div className="criteria-navigation">
          <button type="button" className="secondary-button" onClick={onBack}>← 기본 조건 수정</button>
          <button type="button" className="primary-button" onClick={handleNext}>최적의 팝업 공간 추천받기 <Icon name="arrow" size={18} /></button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [softFilters, setSoftFilters] = useState(null);
  const [previousEligibility, setPreviousEligibility] = useState({});
  const [currentStep, setCurrentStep] = useState(1);

  // STEP 03의 추천 결과를 보관합니다. STEP 04에서 뒤로 가더라도 기존 결과가 유지됩니다.
  const [recommendationSnapshot, setRecommendationSnapshot] = useState(null);
  const [whatIfBaseline, setWhatIfBaseline] = useState(null);
  const [tradeOffBaseline, setTradeOffBaseline] = useState(null);
  const [tradeOffSelection, setTradeOffSelection] = useState([]);

  const goToStep = (step) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToCriteria = () => {
    // 새로운 입력으로 추천을 다시 실행할 때, 이전 Mock 결과를 재사용하지 않습니다.
    setRecommendationSnapshot(null);
    setWhatIfBaseline(null);
    setTradeOffBaseline(null);
    setTradeOffSelection([]);
    const eligibility = Object.fromEntries(
      SOFT_FILTER_META.map((item) => [item.id, isAvailable(item, filters)]),
    );
    setSoftFilters((previous) => {
      if (!previous) return initialSoftFilters(filters);
      const retained = previous.selected.filter((id) => eligibility[id]);
      const newlyEnabled = SOFT_FILTER_META.filter((item) =>
        item.autoSelect && eligibility[item.id] && !previousEligibility[item.id] && !retained.includes(item.id),
      ).map((item) => item.id);
      const selected = [...retained, ...newlyEnabled];
      return { selected, importance_gaps: normalizeGaps(previous.importance_gaps, selected.length) };
    });
    setPreviousEligibility(eligibility);
    goToStep(2);
  };

  const editConditions = () => {
    setRecommendationSnapshot(null);
    setWhatIfBaseline(null);
    setTradeOffBaseline(null);
    setTradeOffSelection([]);
    goToStep(1);
  };
  const editCriteria = () => {
    setRecommendationSnapshot(null);
    setWhatIfBaseline(null);
    setTradeOffBaseline(null);
    setTradeOffSelection([]);
    goToStep(2);
  };

  // 추천 결과 페이지 위/아래 두 What-if 버튼이 모두 동일한 함수를 호출합니다.
  const openWhatIf = (result) => {
    if (!result?.recommendation_id) return;
    const baseline = {
      ...result,
      hard_filters: result.hard_filters || filters,
      soft_filters: result.soft_filters || softFilters,
    };
    setRecommendationSnapshot(baseline);
    setWhatIfBaseline(baseline);
    goToStep(4);
  };

  const backFromWhatIf = () => {
    // 변경 전 추천 결과 그대로 돌아갑니다. 분석을 다시 실행하지 않습니다.
    if (whatIfBaseline) setRecommendationSnapshot(whatIfBaseline);
    goToStep(3);
  };

  const applyWhatIf = (updatedResult) => {
    if (!updatedResult?.recommendation_id || !updatedResult?.hard_filters || !updatedResult?.soft_filters) return;
    // 새 추천 결과뿐 아니라 입력 조건과 중요도 설정도 함께 동기화합니다.
    setFilters(updatedResult.hard_filters);
    setSoftFilters(updatedResult.soft_filters);
    setPreviousEligibility(Object.fromEntries(SOFT_FILTER_META.map((item) => [
      item.id, isAvailable(item, updatedResult.hard_filters),
    ])));
    setRecommendationSnapshot(updatedResult);
    setWhatIfBaseline(null);
    setTradeOffBaseline(null);
    setTradeOffSelection([]);
    goToStep(3);
  };

  const openTradeOff = (result, spaceIds) => {
    const ids = Array.isArray(spaceIds) ? spaceIds : [];
    if (!result?.recommendation_id || ids.length !== 2 || ids[0] === ids[1]) return;
    const available = new Set((result.recommendations || []).map((space) => space.space_id));
    if (ids.some((id) => !available.has(id))) return;
    setRecommendationSnapshot(result);
    setTradeOffBaseline(result);
    setTradeOffSelection([...ids]);
    goToStep(5);
  };

  const backFromTradeOff = () => {
    if (tradeOffBaseline) setRecommendationSnapshot(tradeOffBaseline);
    setTradeOffBaseline(null);
    goToStep(3);
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

      <main className={`page-content ${currentStep === 3 ? 'page-content-results' : currentStep === 4 ? 'page-content-whatif' : currentStep === 5 ? 'page-content-tradeoff' : ''}`}>
        {currentStep < 3 && (currentStep === 1 ? (
          <div className="hero-heading">
            <span className="hero-eyebrow">데이터 기반 팝업스토어 공간 추천 및 출점 의사결정 지원 시스템</span>
            <h1>좋은 팝업은,<br />좋은 공간에서 시작됩니다.</h1>
            <p>브랜드와 팝업 타깃, 출점 조건에 맞는 팝업 공간을 다양한 데이터를 기반으로 분석하여 추천받고, 후보별 적합도와 추천 근거를 한눈에 비교해보세요.</p>
          </div>
        ) : (
          <div className="hero-heading step-hero">
            <span className="hero-eyebrow">데이터 기반 팝업스토어 공간 추천 및 출점 의사결정 지원 시스템</span>
            <h1>어떤 기준을 중요하게 볼까요?</h1>
            <p>공간 추천 시 고려할 평가 기준을 선택하고, 각 기준의 중요도를 설정할 수 있어요.</p>
          </div>
        ))}
        {currentStep < 3 && <StepIndicator currentStep={currentStep} />}
        {currentStep === 1 && (
          <ConditionsPage filters={filters} setFilters={setFilters} onNext={goToCriteria} />
        )}
        {currentStep === 2 && softFilters && (
          <SoftFilterPage
            filters={filters}
            softFilters={softFilters}
            setSoftFilters={setSoftFilters}
            onBack={() => goToStep(1)}
            onNext={() => { setRecommendationSnapshot(null); setWhatIfBaseline(null); setTradeOffBaseline(null); setTradeOffSelection([]); goToStep(3); }}
          />
        )}
        {currentStep === 3 && softFilters && (
          <RecommendationResults
            filters={filters}
            softFilters={softFilters}
            initialResult={recommendationSnapshot}
            onEditConditions={editConditions}
            onEditCriteria={editCriteria}
            onOpenWhatIf={openWhatIf}
            onOpenTradeOff={openTradeOff}
            initialCompareIds={tradeOffSelection}
            onCompareIdsChange={setTradeOffSelection}
          />
        )}
        {currentStep === 4 && whatIfBaseline && (
          <WhatIfAnalysis
            baseline={whatIfBaseline}
            onBack={backFromWhatIf}
            onApply={applyWhatIf}
          />
        )}
        {currentStep === 5 && tradeOffBaseline && tradeOffSelection.length === 2 && (
          <TradeOffAnalysis
            baseline={tradeOffBaseline}
            spaceIds={tradeOffSelection}
            onBack={backFromTradeOff}
          />
        )}
      </main>
    </div>
  );
}

export default App;
