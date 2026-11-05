
import { useEffect, useState } from 'react';
import { getHealth } from './services/api';

function App() {
  const [status, setStatus] = useState('연결 확인 중...');

  useEffect(() => {
    getHealth()
      .then((data) => {
        setStatus(data.status === 'ok' ? '연결 성공!' : '응답 확인 필요');
      })
      .catch(() => {
        setStatus('연결 실패');
      });
  }, []);

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>POPCAST</h1>
      <h2>React + FastAPI 연결 테스트</h2>
      <p>백엔드 상태: {status}</p>
    </main>
  );
}

export default App;
