
import { getMockWhatIf } from '../mocks/whatIf';

// What-if는 추천 API와 독립적으로 Mock/실제 API 모드를 설정합니다.
export async function createWhatIfAnalysis(payload, baselineRecommendation) {
  if (import.meta.env.VITE_USE_MOCK_WHAT_IF !== 'false') {
    return getMockWhatIf(payload, baselineRecommendation);
  }

  const baseUrl = (
    import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'
  ).replace(/\/$/, '');

  const response = await fetch(`${baseUrl}/analyses/what-if`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`What-if API 오류 (${response.status})`);
  }

  return response.json();
}


export async function explainWhatIfSpace(scenarioId, spaceId) {
  const baseUrl = (
    import.meta.env.VITE_API_BASE_URL ||
    'http://127.0.0.1:8000'
  ).replace(/\/$/, '');

  const response = await fetch(
    `${baseUrl}/analyses/what-if/explain-space`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scenario_id: scenarioId,
        space_id: String(spaceId),
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `선택 공간 LLM 분석 오류 (${response.status})`
    );
  }

  return response.json();
}
