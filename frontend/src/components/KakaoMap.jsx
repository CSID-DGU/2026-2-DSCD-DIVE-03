import { useEffect, useMemo, useRef, useState } from 'react';
import { loadKakaoMaps } from '../services/kakaoMaps';

const KAKAO_JS_KEY = import.meta.env.VITE_KAKAO_MAP_JAVASCRIPT_KEY?.trim() || '';
const MAX_MARKERS = 25;
const hasCoordinates = (space) =>
  Number.isFinite(space.latitude) && Number.isFinite(space.longitude) &&
  space.latitude >= -90 && space.latitude <= 90 && space.longitude >= -180 && space.longitude <= 180;

/**
 * 키가 없으면 기존 Mock 개념 위치도를 보여주고,
 * 키를 등록하면 실제 Kakao 지도에 상위 25개 공간 마커를 그립니다.
 */
export default function KakaoMap({ spaces, selectedId, onSelect, fallback }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [status, setStatus] = useState(KAKAO_JS_KEY ? 'loading' : 'not-configured');
  const [message, setMessage] = useState('');
  const plotted = useMemo(() => spaces.filter(hasCoordinates).slice(0, MAX_MARKERS), [spaces]);

  useEffect(() => {
    if (!KAKAO_JS_KEY || !plotted.length) return undefined;
    let cancelled = false;
    let createdMarkers = [];
    setStatus('loading');

    loadKakaoMaps(KAKAO_JS_KEY).then((kakao) => {
      if (cancelled || !mapContainerRef.current) return;
      const first = plotted[0];
      const map = new kakao.maps.Map(mapContainerRef.current, {
        center: new kakao.maps.LatLng(first.latitude, first.longitude),
        level: 6,
      });
      mapRef.current = map;
      const bounds = new kakao.maps.LatLngBounds();
      createdMarkers = plotted.map((space) => {
        const position = new kakao.maps.LatLng(space.latitude, space.longitude);
        bounds.extend(position);
        const marker = new kakao.maps.Marker({
          map,
          position,
          title: `${space.rank}위 · ${space.name}`,
          clickable: true,
        });
        kakao.maps.event.addListener(marker, 'click', () => onSelect(space.space_id));
        return { id: space.space_id, marker };
      });
      markersRef.current = createdMarkers;
      if (plotted.length > 1) map.setBounds(bounds, 36);
      setMessage('');
      setStatus('ready');
    }).catch((error) => {
      if (!cancelled) {
        setStatus('error');
        setMessage(error?.message || 'Kakao 지도를 표시하지 못했습니다.');
      }
    });

    return () => {
      cancelled = true;
      createdMarkers.forEach(({ marker }) => marker.setMap(null));
      markersRef.current = [];
      mapRef.current = null;
    };
  }, [plotted, onSelect]);

  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.kakao?.maps?.LatLng) return;
    const space = plotted.find((item) => item.space_id === selectedId);
    if (!space) return;
    mapRef.current.panTo(new window.kakao.maps.LatLng(space.latitude, space.longitude));
    markersRef.current.forEach(({ id, marker }) => marker.setZIndex(id === selectedId ? 10 : 1));
  }, [status, selectedId, plotted]);

  return (
    <div className="result-map-shell">
      <div ref={mapContainerRef} className="result-kakao-canvas" aria-label="카카오맵 추천 공간 위치" />
      {status !== 'ready' && (
        <div className="result-map-fallback">
          {fallback}
          {status === 'error' && <p className="result-map-fallback-notice" role="status">{message} 현재는 위치도 미리보기를 보여줍니다.</p>}
        </div>
      )}
    </div>
  );
}
