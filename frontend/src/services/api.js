
const API_BASE_URL = 'http://127.0.0.1:8000';

export async function getHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error('백엔드 서버 연결 실패');
  }

  return response.json();
}
