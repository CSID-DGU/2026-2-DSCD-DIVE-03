
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
