# 브랜드 URL 분석

공식 URL → GPT 웹 검색 → Firecrawl 홈페이지 텍스트·이미지 → GPT 시각 분석 → 150자 이내 설명 → 고정 NLI Trait 7개 → 기존 유클리디언 분위기 점수 순서로 처리한다.

첨부 POPCAST-Firecrawl-Test 노트북의 최종 파이프라인과 프롬프트를 사용했다. URL만 입력하므로 브랜드 식별은 공식 URL을 기준으로 수행한다. 이미지는 최대 5개, 다운로드 후보는 최대 20개다. 분석 가능한 이미지가 없으면 경고와 함께 텍스트로 분석한다.

## 설정과 실행

저장소 최상위의 .env에 OPENAI_API_KEY, FIRECRAWL_API_KEY를 설정한다. 셸 환경변수가 우선한다. POPCAST_NLI_DEVICE 기본값은 cpu이며 Mac에서 mps를 지정할 수 있다.

백엔드 추천 API까지 실행하려면 Python 3.12 이상 가상환경에서 한 번 설치한다.
`backend/requirements.txt`가 브랜드 분석 목록을 함께 포함한다.

    python -m pip install -r backend/requirements.txt

브랜드 CLI만 별도로 사용하는 경우에는 `python -m pip install -r ml/requirements-brand.txt`로
브랜드 패키지만 설치할 수 있다.

    python -m ml.brand https://romand.co.kr/ --spaces /path/to/final_spaces.csv --output /tmp/brand-result.json

## 추천 API 연결

brand_space_fit을 선택하고 hard_filters.brand_url을 전달하면 백엔드가 후보의 trait_scores JSON을 읽어 분석 결과와 비교한다. 최신 CSR·팝업 이력 변경을 통합한 요청 계약은 soft_filters.selected와 soft_filters.importance_gaps다. 인접 중요도 차이를 서버에서 CSR 가중치로 계산하며, 응답의 weights는 0~1이다. 분위기 항목 한 개를 선택하면 importance_gaps는 빈 배열이다.

백엔드 실행은 저장소 최상위에서 한다.

    python -m uvicorn app.main:app --app-dir backend --reload

공간 로더는 POPCAST_SPACE_CSV에 지정한 UTF-8 최종 CSV를 읽는다. 미지정 시 data/popup_spaces.csv를 사용한다. 각 행에 seq와 trait_scores가 필요하다.

## Trait 산출 기준

trait_config.json은 기존 공간 파이프라인과 같은 mDeBERTa 모델·revision·Trait 키를 사용하되, 가설 문장은 2026-11-07 사용자가 승인한 브랜드용 7개를 사용한다. 공간용 가설과 공간 CSV는 변경하지 않는다. GPT가 점수를 직접 생성하지 않으며 각 점수는 독립적인 entailment 확률이다. 브랜드와 공간은 가설 문장이 다르므로 같은 Trait 축에서의 점수 보정 및 추천 타당성은 별도 검증 대상이다.

브랜드 분석이 실패하면 API가 오류를 반환한다.

    python -m unittest discover -s ml/brand/tests -v

## 접속 차단과 대체 공식몰

응답의 HTTP 상태·최종 URL·접속 제한 문구로 차단 화면을 판별한다. 차단 화면의 텍스트와 로고는 브랜드 근거에서 제외한다. 차단된 호스트가 official_sources.json에 등록되어 있으면 검증된 대체 공식몰에서 이미지를 수집한다. 현재 romand.co.kr 및 www.romand.co.kr에 대해 미국 공식몰 romandbeauty.com만 등록되어 있으며, 공식 여부 확인 근거는 https://linktr.ee/romandyou 이다. 임의 검색 결과를 자동 등록하지 않는다.

대체 공식몰은 이미지 출처로 사용하며, 그 홈페이지 텍스트로 국내 홈페이지 텍스트를 대체하지 않는다. 분석 결과 image_collection에 원본 차단 사유·실제 이미지 수집 페이지·대체 여부·공식 확인 근거·지역 범위를 기록한다. 미국 공식몰 캠페인·제품 구성은 국내와 다를 수 있으며, 이미지 분석과 최종 설명 생성에도 이 출처 정보를 전달한다. 대체 페이지도 차단되거나 수집에 실패하면 경고와 함께 텍스트 기반으로 계속한다. 입력 페이지 자체의 API 호출 오류(인증·요금 등)는 숨기지 않고 기존 오류 경로로 전달한다.

모든 브랜드의 웹 검색 출처를 검사한다. 입력 호스트의 선행 www.만 제거한 도메인과 그 하위 도메인을 허용하며, 사전 검증된 대체 공식몰 도메인만 추가 허용한다. 예를 들어 www.muji.com 입력에는 muji.com 및 그 하위 도메인을 허용하되 notmuji.com, muji.com.evil.example은 허용하지 않는다. HTTP(S) 이외의 URL·사용자정보가 포함된 주소·잘못된 주소도 거절한다. 사용자가 입력한 주소가 해당 브랜드의 공식 주소라는 전제이며 도메인 일치 자체가 개별 문장의 사실성을 보증하지는 않는다.

사용 모델이 검색 도메인 필터를 지원하지 않아 검색어에 site: 조건을 넣고 반환된 출처를 코드로 검사한다. 출처가 없거나 외부 출처가 하나라도 섞이면 요약 전체를 최종 분석에서 제외한다. 모든 참고 검색 후보와 인용 URL을 함께 검사하는 보수적인 규칙이므로 유효한 정보도 함께 제외될 수 있다. 제외 후에도 공식 홈페이지 텍스트와 실제 이미지 관찰이 있으면 이를 근거로 계속한다. 확인되지 않은 외부 회사·지역몰 도메인을 자동 허용하지 않는다.

응답의 research_domains, research_rejected, research_source_validation에 허용 범위·검색 요약 제외 여부·검사 건수·허용 건수·제외 URL을 남긴다. 요약이 제외된 경우 research_summary와 research_sources는 빈 값이다. 롬앤에 한정된 대체 이미지 공식몰 등록과 모든 브랜드에 적용되는 검색 출처 검증은 별개다.

## 최종 문서 검증과 이미지 주소

원래 홈페이지와 대체 공식몰 모두 수집 결과의 최종 URL을 입력 공식 도메인·등록된 대체 공식 도메인과 대조한다. HTTP 상태가 제공되면 2xx만 정상 문서로 사용하고, 404·500 등 오류 페이지와 보안 확인 화면은 텍스트·이미지 근거에서 제외한다. 다른 도메인으로 이동한 페이지도 같은 방식으로 제외한다. 최종 URL 메타데이터가 없으면 요청 URL을 사용하며, 상태가 없으면 보안 문구·주소 검사를 수행한다.

검증된 최종 문서 URL을 image_page_url에 기록하고 상대 이미지 주소의 기준으로 사용한다. 원래 URL이 등록된 대체 공식몰로 직접 이동한 경우에도 대체 여부·지역 범위를 기록하고 그 페이지는 이미지 근거로만 사용한다. collection_failed는 최종 페이지 확보 실패 여부이며 original_failure_reason과 fallback_failure_reason으로 실패 경로를 구분한다. 정상 근거가 하나도 남지 않으면 설명이나 Trait을 생성하지 않고 오류를 반환한다.

## 이미지 중복 및 설명 제외 지침

이미지는 크기·품질 렌더링 옵션과 명시적인 반응형 파일명 변형을 정규화한 자산 주소, 동일 변환 데이터, 32×32 RGB 표본으로 중복을 검사한다. RGB 비교는 종횡비 차이 2% 이내이고 채널별 평균 절대 차이가 2/255 이내인 경우만 중복으로 판단한다. 콘텐츠 버전(v)·crop 등 의미 있는 인자는 유지하고, 일반적인 small/large 상품명은 같은 자산으로 취급하지 않는다. 서로 다른 구도나 큰 편집까지 같은 사진으로 판별하는 기능은 아니다. image_deduplication에 검사 수·선택 수·중복 제외 URL과 사유를 남긴다.

설명문은 기존 지침의 가격·요금·할인·매출·경영·연혁·배송·고객 소통, 직접적인 Trait 점수 표기를 규칙으로 검사한다. 이미지가 없는데 관찰했다고 쓰거나, 이미지 근거만 있는데 공식 철학으로 단정하는 표현도 검사한다. 기존의 공백·150자 제한은 유지한다. 위반 시 단어만 지우지 않고 같은 원래 근거와 위반 사유로 한 번 다시 작성한다. 두 번째도 실패하면 Trait 계산 전에 오류를 반환한다. description_validation에 시도별 설명·위반 사유·재작성 여부를 기록한다.

이는 기존 제외 지침을 적용하는 규칙 검사이며, 별도의 주관적 품질 점수나 개별 주장에 대한 사실 판정은 아니다. 규칙이 포괄하지 못하는 우회 표현이나 문맥 오류까지 모두 검출한다고 보장하지 않는다.

## CSR 요청 예시

추천 요청의 soft_filters는 다음 형식을 사용한다. 선택 순서는 중요도 순서이고 importance_gaps 길이는 선택 항목 수보다 1개 적다. 기존의 직접 weights 입력 대신 인접 중요도 차이를 전달한다.

```json
{
  "selected": ["brand_space_fit", "popup_history", "subway_accessibility"],
  "importance_gaps": [1, 2]
}
```

추천 서비스는 기존 5개 항목과 브랜드 분위기를 합친 6개 항목을 지원한다. 팝업 이력을 선택할 때는 category_id가 필요하며, 팝업 집계·점수와 브랜드 분석 결과는 함께 유지된다.

## 브랜드 프로필 저장과 재사용

추천 API와 CLI는 성공한 브랜드 분석 결과를 `data/private/brand-profiles/`의 JSON 파일에 저장한다.
기본 저장 위치는 `POPCAST_BRAND_PROFILE_DIR`로 변경할 수 있다. 이 폴더는 Git 추적에서 제외된다.
API의 `brand_analysis`에는 `profile_id`, `canonical_brand_url`, `analysis_version`, `analyzed_at`,
`profile_cache_hit`가 추가된다. 예산·지역·CSR 변경은 브랜드 프로필 키에 포함하지 않는다.

동일성은 정규화한 공식 URL과 분석 버전으로 판단한다. 호스트 대소문자·기본 포트·fragment·utm_*/gclid/fbclid는 정리한다.
국가별 도메인·경로·의미 있는 쿼리·www 유무·HTTP/HTTPS는 임의로 합치지 않는다.
브랜드명만으로 합치거나 같은 도메인의 모든 하위 브랜드를 합치지 않는다.

분석 버전은 모델 ID와 프롬프트·가설·수집/분석 코드의 해시다. 저장소 구현은 이 해시에서 제외한다. 성공한 프로필만 저장하며 TTL 자동갱신은 없다.
같은 URL/버전의 최초 분석은 파일 잠금으로 스레드·프로세스 간 한 번만 수행한다.
명시적으로 갱신하려면 기존 CLI에 `--refresh-brand`를 추가한다. 새 ID를 발급하고 이전 기록도 보존한다.
웹 화면의 재분석 버튼은 아직 추가하지 않았다. 최초 추천은 실제 분석을 하므로 외부 수집 실패가 발생할 수 있다.
서버 재시작 후에는 프로필을 재사용하지만, 현재 구조상 분석기·NLI 모델의 최초 로딩은 필요하다.

### 저장소 교체 경계와 서버 배치

`ProfileStore`는 분석 재사용·검증·ID 발급 정책만 담당한다. `ProfileRepository`의
`find_latest(url, version)`, `save(profile)`, `lock(url, version)`을 구현하면 저장소를 교체할 수 있다.
현재 구현은 `JsonProfileRepository`이며 PostgreSQL 어댑터는 아직 구현하지 않았다.
DB로 옮길 때도 URL/버전 단위의 동시 최초 생성 방지는 DB 잠금/트랜잭션으로 유지해야 한다.

JSON 한 파일은 같은 URL/분석 버전의 프로필 이력을 담는다. 새 파일을 같은 폴더에 임시 작성하고
flush·fsync 후 원자적으로 교체한다. 저장 실패 시 기존 정상 파일을 유지하며 손상 파일을
자동으로 무시하고 재분석하지 않는다. 기존 SQLite 파일은 읽거나 삭제하지 않는다.

`POPCAST_BRAND_PROFILE_DIR`의 상대 경로는 실행 위치가 아닌 저장소 최상위 기준으로 해석한다.
서버에서는 배포·컨테이너 교체 때 지워지지 않는 절대 경로를 지정하고 쓰기 권한을 부여한다.
여러 서버가 각자 다른 로컬 디스크를 사용하면 프로필도 공유되지 않는다. 일반적인 동일 호스트
파일시스템과 프로세스 간 잠금이 검증 범위이며, NFS 등의 잠금/원자성은 별도 검증해야 한다.

```dotenv
POPCAST_BRAND_PROFILE_DIR=/persistent/popcast/brand-profiles
```

로컬에서 생성된 프로필을 서버에서도 그대로 쓰려면 해당 JSON 파일도 별도로 옮겨야 한다.
코드만 배포하면 서버의 빈 저장소에서는 최초 분석을 새로 한다. Git에는 분석 산출물을 올리지 않는다.
