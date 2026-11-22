import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './BenchmarkMapRefresh.css';
import { getBenchmarkMapPoints } from '../services/benchmark';

// 경계 폴리곤이 아닌 개최/등록 위치를 격자로 집계한 지도입니다.
const SEOUL = [37.564, 126.996];
const REGION_COLORS = {
  '성수': '#7355e9', '홍대·신촌': '#a36aee', '잠실': '#4e88e8',
  '강남·서초': '#5f70db', '용산': '#16a5b4',
  '종로·을지로·명동': '#d186da', '기타': '#a2a4b7',
};

export default function BenchmarkGeoMap({ region = '전체', district = '전체',
  onSelectRegion, onSelectDistrict, showRegionCenters = false }) {
  const elementRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const callbacksRef = useRef({ onSelectRegion, onSelectDistrict });
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  callbacksRef.current = { onSelectRegion, onSelectDistrict };

  useEffect(() => {
    if (!elementRef.current || mapRef.current) return;
    const map = L.map(elementRef.current, { zoomControl: true, scrollWheelZoom: false });
    map.setView(SEOUL, 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    // 처음 보이지 않는 탭에서 열렸을 때 타일 위치 재계산
    const id = requestAnimationFrame(() => map.invalidateSize());
    return () => {
      cancelAnimationFrame(id);
      layerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getBenchmarkMapPoints({ region, district, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setPayload(result); })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [region, district]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer || !payload) return;
    layer.clearLayers();
    const bounds = [];
    // 진한 점: 팝업 개최 격자. 외곽 링: 대관 공간이 함께 있는 격자
    for (const point of payload.points || []) {
      const position = [point.latitude, point.longitude];
      bounds.push(position);
      const popup = point.popup_count || 0;
      const space = point.space_count || 0;
      const color = REGION_COLORS[point.region] || '#7862ec';
      const marker = L.circleMarker(position, {
        radius: Math.min(14, 3.5 + Math.sqrt(popup + space) * 1.6),
        fillColor: color, fillOpacity: popup ? 0.48 : 0.18,
        color: space ? '#212b59' : color, weight: space ? 1.4 : 0.6,
      });
      marker.bindTooltip(`${point.region} · ${point.district}<br/>팝업 ${popup.toLocaleString()}건 · 대관 공간 ${space.toLocaleString()}개`);
      marker.on('click', () => {
        if (showRegionCenters) {
          callbacksRef.current.onSelectRegion?.(point.region);
        } else if (point.district !== '미상') {
          callbacksRef.current.onSelectDistrict?.(point.district);
        }
      });
      marker.addTo(layer);
    }
    if (showRegionCenters) {
      for (const center of payload.region_centers || []) {
        const position = [center.latitude, center.longitude];
        bounds.push(position);
        const marker = L.circleMarker(position, {
          radius: center.region === region ? 15 : 11,
          fillColor: REGION_COLORS[center.region] || '#8c82a0',
          color: '#fff', weight: 2.5, fillOpacity: 0.96,
        });
        marker.bindTooltip(`<b>${center.region}</b><br/>팝업 ${center.popup_count.toLocaleString()}건`, { permanent: false });
        marker.on('click', () => callbacksRef.current.onSelectRegion?.(center.region));
        marker.addTo(layer);
      }
    }
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: showRegionCenters && region === '전체' ? 11 : 14 });
    } else {
      map.setView(SEOUL, 11);
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [payload, region, showRegionCenters]);

  return <div className="benchmark-map-shell bm-map-light">
    <div ref={elementRef} className="benchmark-real-map" role="application" aria-label="팝업 개최 위치 및 등록 공간 분포 지도" />
    {loading && <div className="benchmark-map-message">지도 좌표를 불러오는 중...</div>}
    {error && <div className="benchmark-map-message is-error">{error}</div>}
    {!loading && !error && payload?.truncated &&
      <div className="benchmark-map-notice">지도 표시를 위해 밀집도 상위 1,500개 격자를 표시합니다.</div>}
    <div className="benchmark-map-caption">● 개최 위치 격자 · ◯ 등록 공간 포함 · 점을 클릭하여 지역 선택</div>
    <div className="benchmark-map-caveat">개별 공간의 개최 이력 또는 행정동 경계선이 아닌 위치 분포도입니다.</div>
  </div>;
}
