import { getMockTradeOff } from '../mocks/tradeOff';
import { sharePendingRequest } from './pendingRequests';

// Trade-off는 추천 API와 독립적으로 Mock/실제 API 모드를 설정합니다.
export async function createTradeOffAnalysis(payload, baselineRecommendation) {
  if (import.meta.env.VITE_USE_MOCK_TRADE_OFF !== 'false') {
    return getMockTradeOff(payload, baselineRecommendation);
  }
  const recommendationId = payload?.recommendation_id;
  const spaceIds = payload?.space_ids;
  if (typeof recommendationId !== 'string' || !recommendationId.trim()) {
    throw new Error('추천 결과를 찾을 수 없습니다. 추천을 다시 실행해 주세요.');
  }
  if (!Array.isArray(spaceIds) || spaceIds.length !== 2 ||
      spaceIds.some((id) => typeof id !== 'string' || !id.trim()) ||
      spaceIds[0] === spaceIds[1]) {
    throw new Error('서로 다른 두 공간을 선택해 주세요.');
  }

  const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const body = JSON.stringify({ recommendation_id: recommendationId, space_ids: spaceIds });
  return sharePendingRequest(`trade-off\n${baseUrl}\n${body}`, async () => {
    const response = await fetch(`${baseUrl}/analyses/trade-off`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      const detail = typeof result?.detail === 'string' ? result.detail : null;
      const message = response.status === 404
        ? detail || '추천 결과가 만료되었습니다. 추천을 다시 실행해 주세요.'
        : detail || `Trade-off API 오류 (${response.status}). 잠시 후 다시 시도해 주세요.`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    const result = await response.json();
    if (!Array.isArray(result?.spaces) || result.spaces.length !== 2) {
      throw new Error('서버에서 올바른 공간 비교 결과를 받지 못했습니다.');
    }
    return result;
  });
}
