// 기존 benchmark.js는 변경하지 않고 별도 읽기 전용 API 모듈로 분리합니다.
const BASE = 'http://127.0.0.1:8000/api/benchmark/popup-grid-history';
export async function getBenchmarkPopupGridHistory({ region, district, latitude, longitude, page = 1, pageSize = 8, signal }) {
  const query = new URLSearchParams({ region, district, latitude: String(latitude), longitude: String(longitude), page: String(page), page_size: String(pageSize) });
  let response;
  try {
    response = await fetch(`${BASE}?${query}`, { headers: { Accept: 'application/json' }, signal });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('팝업 이력 서버에 연결할 수 없습니다.');
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try { const body = await response.json(); if (typeof body?.detail === 'string') detail = body.detail; } catch { /* JSON 아님 */ }
    throw new Error(`팝업 이력 조회에 실패했습니다: ${detail}`);
  }
  return response.json();
}
