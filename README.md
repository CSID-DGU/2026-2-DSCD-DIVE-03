
# POPCAST

### 데이터 기반 팝업스토어 공간 추천 및 의사결정 지원 서비스

POPCAST는 브랜드의 출점 조건과 상권·공간 데이터를 결합하여 적합한 팝업스토어 공간을 추천하고, What-if 및 Trade-off 분석을 통해 공간 선정 의사결정을 지원하는 웹서비스입니다.

## 주요 기능

### 1. 맞춤형 공간 추천
- 예산, 운영 기간, 지역, 면적 기반 Hard Filter
- 6가지 Soft Filter 기반 적합도 평가
- CSR 기반 중요도 가중치 적용
- 추천 공간 순위 및 근거 제공

### 2. What-if 분석
- 출점 조건 및 평가요소 중요도 변경
- 변경 전후 추천 후보 수와 순위 비교
- AI 기반 변화 요인 분석

### 3. Trade-off 분석
- 복수 추천 공간 비교
- 평가요소별 적합도 및 가중 기여도 비교
- 공간별 강점·약점과 AI 종합 요약 제공

## Tech Stack

| Category | Technology |
|---|---|
| Frontend | React |
| Backend | FastAPI |
| Database | PostgreSQL |
| ML / NLP | PyTorch, Hugging Face Transformers, mDeBERTa |
| AI API | OpenAI API |
| Web Crawling | Firecrawl |
| Frontend Hosting | AWS Amplify |
| ML Infrastructure | LAB FARM GPU Server |
| Version Control | GitHub |


## Project Structure

```text
frontend/     # React
backend/      # FastAPI
ml/           # NLI 및 추천 알고리즘
data/         # 데이터 수집 및 전처리
database/     # DB 스키마
docs/         # 프로젝트 문서
.github/      # 협업 템플릿
```

## Backend installation and local execution

Python **3.12 이상**을 사용합니다. `numpy==2.5.4`는 Python 3.11에서 설치되지 않습니다.
저장소 최상위에서 가상환경을 만들고 활성화한 뒤 설치합니다.

```bash
python3.12 -m venv backend/.venv
source backend/.venv/bin/activate
python -m pip install -r backend/requirements.txt
```

최상위에서 `python -m pip install -r requirements.txt`를 실행해도 같은 목록을 설치합니다.
최상위 → 백엔드 → 브랜드 목록 순서로 연결되어 버전 목록을 중복 관리하지 않습니다.

위 설치는 `ml/requirements-brand.txt`도 포함하므로 FastAPI뿐 아니라
Firecrawl·OpenAI·PyTorch·Transformers까지 함께 설치합니다. Windows Git Bash에서는
활성화 명령을 `source backend/.venv/Scripts/activate`로 바꿉니다.
기존 Python 3.12 가상환경이 있다면 새로 만들지 않고 활성화해 같은 설치 명령을 실행합니다.

루트 `.env`에 `OPENAI_API_KEY`, `FIRECRAWL_API_KEY`, `POPCAST_SPACE_CSV`를 설정합니다.
키 예시는 `.env.example`을 참고하며 실제 키는 커밋하지 않습니다.

```bash
PYTHONPATH=. python -m uvicorn app.main:app --app-dir backend --port 8001
```

브랜드 분석 첫 실행에는 NLI 모델 다운로드·로딩 시간이 추가될 수 있습니다.
패키지 설치 성공과 외부 API 인증·분석 성공은 별도로 확인합니다.
브랜드 처리 상세 내용은 [브랜드 분석 가이드](ml/brand/README.md)를 참고하세요.

## API

- POST `/recommendations`
- POST `/analyses/what-if`
- POST `/analyses/trade-off`

## GitHub Collaboration

브랜치, 커밋, Issue 및 PR 규칙은
[CONTRIBUTING.md](docs/CONTRIBUTING.md)를 참고하세요.

## Team

Dongguk University
Data Science Capstone Design

Team DIVE-03
