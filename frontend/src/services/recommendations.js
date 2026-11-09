import { getMockRecommendation } from '../mocks/recommendations';
import { recommendationError } from './apiError';

// 기본값: Mock 모드. 추후 .env에 VITE_USE_MOCK_RECOMMENDATIONS=false를 지정하면 실제 API 사용.
// Vite 환경변수를 변경한 뒤에는 개발 서버 재시작이 필요합니다.
export async function createRecommendation(payload) {
  if (import.meta.env.VITE_USE_MOCK_RECOMMENDATIONS !== 'false') {
    return getMockRecommendation(payload);
  }

  const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await recommendationError(response);
  return response.json();
}
