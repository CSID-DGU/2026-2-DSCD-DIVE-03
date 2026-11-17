import { getMockTradeOff } from '../mocks/tradeOff';

// Trade-off는 추천 API와 독립적으로 Mock/실제 API 모드를 설정합니다.
export async function createTradeOffAnalysis(payload, baselineRecommendation) {
  if (import.meta.env.VITE_USE_MOCK_TRADE_OFF !== 'false') {
    return getMockTradeOff(payload, baselineRecommendation);
  }

  const baseUrl = (
    import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  ).replace(/\/$/, '');

  const response = await fetch(`${baseUrl}/analyses/trade-off`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Trade-off API 오류 (${response.status})`);
  }

  return response.json();
}