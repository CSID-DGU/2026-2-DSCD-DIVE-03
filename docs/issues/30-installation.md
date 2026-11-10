# Issue #30 — 설치 경로 통합

Python 3.12 이상에서 `python -m pip install -r requirements.txt` 또는
`python -m pip install -r backend/requirements.txt`를 사용한다. 두 경로 모두 브랜드 의존성을 포함한다.
`.env.example`을 참고하되 실제 키가 든 `.env`와 가상환경은 커밋하지 않는다.
프로필 저장 경로 설정은 별도 Issue #33에서 추가한다.

검증: 두 진입점 설치 해석, 주요 import, pip check, .venv312 Git 제외 여부.
