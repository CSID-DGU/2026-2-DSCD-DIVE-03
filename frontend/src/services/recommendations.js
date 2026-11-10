
import { getMockRecommendation } from '../mocks/recommendations';
import { recommendationError } from './apiError';
import { sharePendingRequest } from './pendingRequests';

// 기본값: Mock 모드.
// VITE_USE_MOCK_RECOMMENDATIONS=false 설정 시 실제 API 사용.
// 환경변수 변경 후에는 개발 서버 재시작 필요.

export async function createRecommendation(payload) {
  if (import.meta.env.VITE_USE_MOCK_RECOMMENDATIONS !== 'false') {
    return getMockRecommendation(payload);
  }

  const baseUrl = (
    import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  ).replace(/\/$/, '');

  const body = JSON.stringify(payload);

  return sharePendingRequest(`${baseUrl}\n${body}`, async () => {
    const response = await fetch(`${baseUrl}/recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body,
    });

    if (!response.ok) {
      throw await recommendationError(response);
    }

    return response.json();
  });
}
