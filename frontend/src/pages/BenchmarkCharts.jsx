import { useId } from 'react';

const formatNumber = (value) => Number(value || 0).toLocaleString('ko-KR');
export const numberLabel = (value, unit = '') => value == null ? '—' : `${formatNumber(value)}${unit}`;
export const percentLabel = (ratio) => ratio == null ? '—' : `${(ratio * 100).toFixed(1)}%`;
export const priceLabel = (value) => value == null ? '—' : `${formatNumber(Math.round(value / 10000))}만원`;

export function BenchmarkStatus({ loading, error, onRetry, children }) {
  if (loading) return <div className="benchmark-state" role="status">통계 데이터를 불러오는 중입니다…</div>;
  if (error) return <div className="benchmark-state benchmark-state-error" role="alert"><span>{error}</span><button type="button" onClick={onRetry}>다시 시도</button></div>;
  return children;
}

export function KPI({ label, value, footnote }) {
  return <div className="benchmark-kpi"><span>{label}</span><strong>{value}</strong><small>{footnote}</small></div>;
}

export function CategoryBars({ data = [], total = 0, compareData = null, limit = 6 }) {
  const categories = [...data].sort((a, b) => b.count - a.count).slice(0, limit);
  if (!categories.length || !total) return <div className="benchmark-empty">해당 조건의 카테고리 데이터가 없습니다.</div>;
  const comparisonTotal = compareData?.reduce((sum, row) => sum + row.count, 0) || 0;
  const comparisonMap = Object.fromEntries((compareData || []).map(row => [row.category, row.count]));
  return <div className="benchmark-bars">
    {compareData && <div className="benchmark-legend"><span><i className="benchmark-legend-dot" />선택 권역</span><span><i className="benchmark-legend-dot is-muted" />서울 전체</span></div>}
    {categories.map(item => {
      const ratio = item.count / total * 100;
      const comparison = comparisonTotal ? (comparisonMap[item.category] || 0) / comparisonTotal * 100 : 0;
      return <div className="benchmark-bar-row" key={item.category}>
        <span className="benchmark-bar-name" title={item.category}>{item.category}</span>
        <div className="benchmark-bars-tracks">
          <div className="benchmark-bar-track"><div className="benchmark-bar-fill" style={{ width: `${Math.min(100, ratio)}%` }} /></div>
          {compareData && <div className="benchmark-bar-track is-comparison"><div className="benchmark-bar-fill is-comparison" style={{ width: `${Math.min(100, comparison)}%` }} /></div>}
        </div>
        <strong>{ratio.toFixed(1)}%</strong>
      </div>;
    })}
  </div>;
}

export function MonthlyLine({ data = [] }) {
  const gradientId = useId().replaceAll(':', '');
  const monthMap = Object.fromEntries(data.map(({ month, count }) => [Number(month), Number(count)]));
  const values = Array.from({ length: 12 }, (_, i) => monthMap[i + 1] || 0);
  const maximum = Math.max(...values, 0);
  if (!maximum) return <div className="benchmark-empty">해당 조건의 개최 이력이 없습니다.</div>;
  const left = 36, right = 12, top = 19, bottom = 32, width = 520, height = 210;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = index => left + index / 11 * plotWidth;
  const y = value => top + (1 - value / maximum) * plotHeight;
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const area = `${left},${height - bottom} ${points} ${width - right},${height - bottom}`;
  const peakIndex = values.indexOf(maximum);
  return <div className="benchmark-line-wrap">
    <div className="benchmark-line-peak">최다 개최: {peakIndex + 1}월 · {formatNumber(maximum)}건</div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`월별 팝업 개최 건수. 가장 많은 달은 ${peakIndex + 1}월 ${maximum}건`}>
      <defs><linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8067f0" stopOpacity=".25"/><stop offset="100%" stopColor="#8067f0" stopOpacity=".02"/></linearGradient></defs>
      {[0, .25, .5, .75, 1].map(fraction => {
        const label = Math.round(maximum * fraction);
        const yy = y(maximum * fraction);
        return <g key={fraction}><line x1={left} x2={width - right} y1={yy} y2={yy} stroke="#ebe8fa"/><text x={left - 7} y={yy + 4} textAnchor="end" fontSize="11" fill="#8a91a8">{label}</text></g>;
      })}
      <polygon points={area} fill={`url(#${gradientId})`}/>
      <polyline points={points} fill="none" stroke="#785df0" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>
      {values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r={index === peakIndex ? 5 : 3} fill="white" stroke="#785df0" strokeWidth="2"><title>{index + 1}월: {value}건</title></circle>)}
      {values.map((_, index) => <text key={index} x={x(index)} y={height - 11} textAnchor="middle" fontSize="11" fill="#7d8499">{index + 1}월</text>)}
    </svg>
  </div>;
}

export function DistrictBars({ districts = [], metric = 'popup_count', selectedDistrict, onSelectDistrict }) {
  if (!districts.length) return <div className="benchmark-empty">표시할 행정동 데이터가 없습니다.</div>;
  const sorted = [...districts].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
  const maxValue = Math.max(...sorted.map(d => d[metric] || 0), 1);
  return <div className="benchmark-bars benchmark-district-bars">
    {sorted.map(d => {
      const selected = selectedDistrict === d.district;
      const content = <>
        <span className="benchmark-bar-name" title={d.district}>{d.district}</span>
        <span className="benchmark-bar-track"><span className={`benchmark-bar-fill ${selected ? 'is-selected' : ''}`} style={{ width: `${Math.max(0, (d[metric] || 0) / maxValue * 100)}%` }}/></span>
        <strong>{formatNumber(d[metric])}</strong>
      </>;
      return onSelectDistrict ? <button type="button" aria-pressed={selected} className="benchmark-bar-row benchmark-bar-button" onClick={() => onSelectDistrict(d.district)} key={d.district}>{content}</button> : <div className="benchmark-bar-row" key={d.district}>{content}</div>;
    })}
  </div>;
}

export function CategoryDonut({ data = [], total = 0 }) {
  const top = [...data].sort((a, b) => b.count - a.count).slice(0, 5);
  if (!total || !top.length) return <div className="benchmark-empty">해당 조건의 카테고리 데이터가 없습니다.</div>;
  const colors = ['#7958ed', '#9983f5', '#b7a7f9', '#9cbbf4', '#cfd8f9', '#ece9fb'];
  const remaining = Math.max(0, total - top.reduce((sum, item) => sum + item.count, 0));
  const items = [...top, ...(remaining ? [{ category: '그 외', count: remaining }] : [])];
  let cumulative = 0;
  const segments = items.map((item, index) => {
    const from = cumulative / total * 100;
    cumulative += item.count;
    return `${colors[index]} ${from}% ${cumulative / total * 100}%`;
  });
  return <div className="benchmark-donut-layout">
    <div className="benchmark-donut" style={{ background: `conic-gradient(${segments.join(', ')})` }} role="img" aria-label="팝업 카테고리 비중">
      <div className="benchmark-donut-hole"><small>최다 카테고리</small><strong>{top[0].category}</strong><span>{percentLabel(top[0].count / total)}</span></div>
    </div>
    <div className="benchmark-donut-legend">
      {items.map((item, i) => <div key={item.category}><i style={{ background: colors[i] }}/><span>{item.category}</span><strong>{percentLabel(item.count / total)}</strong></div>)}
    </div>
  </div>;
}
