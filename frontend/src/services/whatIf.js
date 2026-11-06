import { getMockWhatIf } from '../mocks/whatIf';

// 동일한 환경변수로 추천 및 What-if를 동시에 Mock/실제 API 모드로 전환합니다.
// 실제 API가 연결되면 baselineRecommendation은 클라이언트에서 요청에 포함하지 않습니다.
export async function createWhatIfAnalysis(payload, baselineRecommendation) {
  if (import.meta.env.VITE_USE_MOCK_RECOMMENDATIONS !== 'false') {
    return getMockWhatIf(payload, baselineRecommendation);
  }
  const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/analyses/what-if`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`What-if API 오류 (${response.status})`);
  return response.json();
}
