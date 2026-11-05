
# POPCAST GitHub 협업 가이드

## 1. 브랜치 전략 (Branch Strategy)

| 브랜치 | 용도 |
|---|---|
| `main` | 최종 안정 버전 및 배포 |
| `dev` | 개발 기능 통합 및 테스트 |
| `feat/*` | 신규 기능 개발 |
| `fix/*` | 버그 수정 |
| `chore/*` | 환경 설정 및 유지보수 |
| `hotfix/*` | 배포 버전 긴급 오류 수정 |

### 브랜치 네이밍 규칙

`type/issue-number-description`

예시:
- `feat/2-react-setup`
- `feat/3-fastapi-setup`
- `feat/12-recommendation-api`
- `fix/15-budget-filter`
- `chore/1-github-setup`

### 브랜치 사용 규칙

1. 일반 작업 브랜치는 최신 `dev`에서 생성한다.
2. `main`, `dev`에는 직접 Push하지 않는다.
3. 하나의 작업 브랜치는 하나의 Issue와 연결한다.
4. 기능 구현 후 Pull Request(PR)를 생성한다.
5. 최소 1명의 팀원 리뷰를 받은 뒤 `dev`에 병합한다.
6. 병합 방식은 `Squash and merge`를 사용한다.
7. 병합 완료된 작업 브랜치는 삭제한다.
8. `main`에는 검증된 `dev`의 내용을 PR로 반영한다.

## 2. 커밋 컨벤션 (Commit Convention)

### 기본 형식

`type(scope): 작업 내용`

### Commit Types

| Type | 설명 |
|---|---|
| `feat` | 새로운 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 작성 및 수정 |
| `refactor` | 기능 변경 없는 코드 개선 |
| `test` | 테스트 코드 추가·수정 |
| `style` | 코드 포맷 변경 |
| `chore` | 환경 설정 및 유지보수 |
| `perf` | 성능 개선 |
| `ci` | CI/CD 설정 |

### Scope 예시

- `frontend`: React
- `backend`: FastAPI
- `model`: 추천 알고리즘 및 NLI
- `data`: 데이터 수집·전처리
- `db`: PostgreSQL
- `api`: API 명세 및 연동

### 커밋 메시지 예시

- `feat(frontend): 출점 조건 입력 UI 구현`
- `feat(backend): 공간 추천 API 구현`
- `feat(model): 브랜드 Trait 분석 구현`
- `fix(backend): 예산 필터 오류 수정`
- `docs(api): What-if API 명세서 작성`
- `chore: GitHub 초기 환경 설정`

### 커밋 규칙

- 커밋 메시지는 작업 내용을 구체적으로 작성한다.
- 하나의 커밋에는 관련된 변경 사항만 포함한다.
- `수정`, `최종`, `작업중` 등 모호한 메시지는 사용하지 않는다.
- API 키, 비밀번호 등 민감정보를 커밋하지 않는다.

## 3. Issue 작성 규칙

### Issue 제목

`[TYPE] 작업 내용`

예시:
- `[SETUP] React + Vite 프로젝트 초기 구성`
- `[FEAT] 공간 추천 API 개발`
- `[BUG] CSR 가중치 계산 오류 수정`

### Issue 작성 원칙

1. 개발 작업 시작 전에 Issue를 생성한다.
2. 담당자(Assignee)를 지정한다.
3. 작업에 맞는 Label을 지정한다.
4. 작업 목적과 세부 작업, 완료 조건을 작성한다.
5. PR에 관련 Issue 번호를 연결한다.
6. 작업이 완료되면 Issue를 종료한다.

## 4. Pull Request 규칙

### PR 제목

`[TYPE] 작업 내용 (#이슈번호)`

예시:
- `[SETUP] GitHub 협업 환경 구성 (#1)`
- `[FEAT] 공간 추천 API 구현 (#12)`

### PR 작성 원칙

1. 일반 PR은 `dev` 브랜치를 대상으로 생성한다.
2. 작업 내용과 테스트 결과를 작성한다.
3. 관련 Issue를 연결한다.
4. 최소 1명의 팀원에게 리뷰를 요청한다.
5. 리뷰 지적 사항을 해결한 후 병합한다.
6. 병합 방식은 `Create a merge commit`을 사용하여 개별 커밋 이력을 유지한다.
7. 커밋은 의미 있는 작업 단위로 나누어 작성한다.
8. 병합 완료된 기능 브랜치는 삭제한다.
9. `main`에는 검증된 `dev`의 내용을 PR로 반영한다.

## 5. 코드 리뷰 규칙

다음 항목을 중점적으로 검토한다.

- Issue에서 정의한 요구사항 충족 여부
- 기존 기능과의 충돌 여부
- API Request/Response 명세 일치 여부
- 오류 및 예외 처리 여부
- 불필요한 파일 또는 민감정보 포함 여부
- 테스트 결과

## 6. 보안 및 데이터 관리

- `.env` 및 API 키를 GitHub에 업로드하지 않는다.
- 환경변수 예시는 `.env.example`로 관리한다.
- 대용량 데이터 및 모델 가중치는 별도로 저장한다.
- 데이터 원본 파일은 `.gitignore` 규칙에 따라 관리한다.
- 개인정보가 포함된 데이터는 저장소에 업로드하지 않는다.

## 7. 기본 협업 프로세스

1. GitHub Issue 생성
2. 로컬 `dev` 브랜치 최신화
3. `feat/*`, `fix/*`, `chore/*` 작업 브랜치 생성
4. 기능 개발 및 커밋
5. GitHub에 Push
6. Pull Request 생성
7. 팀원 코드 리뷰
8. `dev` 브랜치 병합
9. 관련 Issue 종료 확인
10. 기능 통합 테스트 후 `main` 브랜치 반영
