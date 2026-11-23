import { useEffect, useMemo, useState } from 'react';
import { getBenchmarkPopulation } from '../services/benchmark';
import './BenchmarkPopulation.css';

const COLORS = ['#7153ea', '#9478f2', '#b39ef8', '#cfc3ff', '#93a9ef', '#b5c7f3', '#d1dafa', '#e6e2fa'];
const fmt = value => Number(value || 0).toLocaleString('ko-KR');
const share = (count, total) => total > 0 ? `${(count / total * 100).toFixed(1)}%` : '—';

function PopulationDonut({ summary }) {
  const all = summary?.groups || [];
  const total = summary?.total_count || 0;
  const top = all.filter(item => item.count > 0).slice(0, 7);
  const remainder = Math.max(0, total - top.reduce((sum, item) => sum + item.count, 0));
  const items = [...top, ...(remainder ? [{ group: 'others', label: '그 외 연령·성별', count: remainder }] : [])];
  if (!total || !items.length) return <p className="benchmark-population-empty">생활인구 데이터가 없습니다.</p>;
  let cumulative = 0;
  const segments = items.map((item, i) => {
    const start = cumulative / total * 100;
    cumulative += item.count;
    return `${COLORS[i]} ${start}% ${cumulative / total * 100}%`;
  });
  return <div className="benchmark-population-donut-layout">
    <div className="benchmark-population-donut" style={{ background: `conic-gradient(${segments.join(',')})` }} role="img" aria-label={`성별·연령대별 생활인구 비율 그래프. 대표 집단 ${all[0]?.label} ${share(all[0]?.count, total)}`} >
      <div className="benchmark-population-hole"><small>대표 생활인구</small><strong>{all[0]?.label}</strong><span>{share(all[0]?.count, total)}</span></div>
    </div>
    <div className="benchmark-population-legend">
      {items.map((item, i) => <div key={item.group} title={`${item.label}: ${fmt(item.count)}명`}>
        <i style={{ background: COLORS[i] }}/><span>{item.label}</span><strong>{share(item.count, total)}</strong>
      </div>)}
    </div>
  </div>;
}

export default function BenchmarkPopulation({ region }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    getBenchmarkPopulation({ signal: controller.signal })
      .then(result => { setData(result); setError(''); })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  const selected = useMemo(() => data?.regions?.find(item => item.region === region), [data, region]);
  if (loading) return <div className="benchmark-population-empty">생활인구를 불러오는 중입니다…</div>;
  if (error) return <div className="benchmark-population-empty" role="alert">{error}<button type="button" onClick={() => { setLoading(true); setRetry(v => v + 1); }}>다시 시도</button></div>;
  return <div className="benchmark-population">
    {region === '전체' ? <div className="benchmark-population-regions">
      {(data?.regions || []).filter(item => item.region !== '기타').map(item => <div key={item.region} className="benchmark-population-region">
        <span>{item.region}</span><strong>{item.top_group?.label || '자료 없음'}</strong>
        <small>{item.top_group ? share(item.top_group.count, item.total_count) : '—'}</small>
      </div>)}
    </div> : <PopulationDonut summary={selected} />}
  </div>;
}
