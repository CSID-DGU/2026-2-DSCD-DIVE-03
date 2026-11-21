// Commit 3: POPCAST 벤치마크 읽기 전용 API 클라이언트.
// 기존 추천 API 호출 로직과 분리합니다.
const BENCHMARK_BASE_URL = 'http://127.0.0.1:8000/api/benchmark';

async function requestBenchmark(endpoint, parameters, signal) {
  const url = new URL(`${BENCHMARK_BASE_URL}/${endpoint}`);
  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  let response;
  try {
    response = await fetch(url.toString(), { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('벤치마크 서버에 연결할 수 없습니다. 백엔드 실행 상태를 확인해주세요.');
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch { /* 비 JSON 응답 */ }
    throw new Error(`통계 조회에 실패했습니다: ${detail}`);
  }
  return response.json();
}

export function getBenchmarkRegions({ startDate, endDate, asOf, signal } = {}) {
  return requestBenchmark('regions', {
    start_date: startDate, end_date: endDate, as_of: asOf,
  }, signal);
}

export function getBenchmarkDistricts(region, { startDate, endDate, asOf, signal } = {}) {
  return requestBenchmark('districts', {
    region, start_date: startDate, end_date: endDate, as_of: asOf,
  }, signal);
}


// Commit 4: 실제 위경도 기반 위치 밀집도 API
export function getBenchmarkMapPoints({ region = '전체', district = '전체', startDate, endDate, asOf, signal } = {}) {
  return requestBenchmark('map-points', {
    region, district, start_date: startDate, end_date: endDate, as_of: asOf,
  }, signal);
}

// Commit 5: 행정동별 등록 대관 공간 목록 (기간 필터 미적용)
export function getBenchmarkSpaces(region, { district = '전체', minArea, maxArea, minPrice, maxPrice, page = 1, pageSize = 8, signal } = {}) {
  return requestBenchmark('spaces', { region, district, min_area: minArea, max_area: maxArea, min_price: minPrice, max_price: maxPrice, page, page_size: pageSize }, signal);
}
