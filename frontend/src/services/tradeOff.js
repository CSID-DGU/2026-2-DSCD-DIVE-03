import { getMockTradeOff } from '../mocks/tradeOff';

// 기존 추천 및 What-if와 같은 Mock/실제 API 전환 플래그를 사용합니다.
// 실제 API에 baselineRecommendation을 전송하지 않고 명세의 두 필드만 보냅니다.
export async function createTradeOffAnalysis(payload, baselineRecommendation) {
  if (import.meta.env.VITE_USE_MOCK_RECOMMENDATIONS !== 'false') {
    return getMockTradeOff(payload, baselineRecommendation);
  }
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/analyses/trade-off`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Trade-off API 오류 (${response.status})`);
  return response.json();
}
