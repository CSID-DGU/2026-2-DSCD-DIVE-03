import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './BenchmarkMapRefresh.css';
import { getBenchmarkMapPoints } from '../services/benchmark';
import BenchmarkPopupHistoryModal from './BenchmarkPopupHistoryModal';

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
  const [selectedGrid, setSelectedGrid] = useState(null);
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
    setSelectedGrid(null);
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
        // 작은 점은 격자 조회 메뉴, 큰 권역 마커는 기존 권역 선택 기능 유지
        const container = document.createElement('div');
        container.className = 'bm-grid-popup';
        const heading = document.createElement('strong');
        heading.textContent = `${point.region} · ${point.district}`;
        const counts = document.createElement('p');
        counts.textContent = `팝업 ${popup.toLocaleString()}건 · 대관 공간 ${space.toLocaleString()}개`;
        container.append(heading, counts);
        if (popup > 0) {
          const historyButton = document.createElement('button');
          historyButton.type = 'button';
          historyButton.className = 'bm-grid-popup-primary';
          historyButton.textContent = `개최 팝업 목록 보기 (${popup}건)`;
          historyButton.addEventListener('click', () => {
            map.closePopup();
            setSelectedGrid({ region: point.region, district: point.district,
              latitude: point.latitude, longitude: point.longitude });
          });
          container.append(historyButton);
        }
        if (!showRegionCenters && point.district !== '미상') {
          const districtButton = document.createElement('button');
          districtButton.type = 'button';
          districtButton.className = 'bm-grid-popup-secondary';
          districtButton.textContent = '이 행정동 선택';
          districtButton.addEventListener('click', () => {
            map.closePopup();
            callbacksRef.current.onSelectDistrict?.(point.district);
          });
          container.append(districtButton);
        }
        L.popup({ maxWidth: 260, minWidth: 190 }).setLatLng(position).setContent(container).openOn(map);
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
    <div className="benchmark-map-caption">● 개최 위치 격자 · ◯ 등록 공간 포함 · 작은 점을 클릭하면 과거 팝업 이력을 볼 수 있습니다.</div>
    <div className="benchmark-map-caveat">점 하나는 약 100m 격자입니다. 목록은 해당 격자에 포함된 팝업의 개최 이력입니다.</div>
    <BenchmarkPopupHistoryModal point={selectedGrid} onClose={() => setSelectedGrid(null)} />
  </div>;
}
