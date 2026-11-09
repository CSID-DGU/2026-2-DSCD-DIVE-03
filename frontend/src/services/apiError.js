export async function recommendationError(response) {
  const fallback = `추천 API 오류 (${response.status})`;
  try {
    const { detail } = await response.json();
    if (typeof detail === 'string') return new Error(detail);
    if (detail && typeof detail.message === 'string') {
      return new Error([detail.message, typeof detail.action === 'string' ? detail.action : ''].filter(Boolean).join(' '));
    }
  } catch { /* Non-JSON failures retain the HTTP status. */ }
  return new Error(fallback);
}
