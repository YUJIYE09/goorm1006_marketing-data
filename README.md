# CSV 자동 EDA 웹앱 (v2.1)

CSV 하나를 올리면 열 유형 판별, 분포, 타깃과의 연관, 데이터 품질 경고, 권장 전처리 목록을 자동으로 만드는 웹앱입니다.
기술명세서 10장 로드맵의 **v2.0 기반 구축 + v2.1 분류 지원**까지 구현했고, v2.2 품질 경고(특수 코드·겹침·시간 변화·누수·배너)와 v2.3 일부(열 유형·문제 유형 수정, EUC-KR 재시도, 중복 업로드 감지)도 들어 있습니다.

- 프런트엔드: React 19 + Vite + TypeScript, React Router, TanStack Query, Chart.js 4, CSS Modules + CSS 변수(라이트·다크)
- API 서버: Vercel Functions (`api/`, Web 표준 `Request → Response` 핸들러)
- 저장소: Neon Postgres(Drizzle ORM, `neon()` HTTP 모드), Vercel Blob(클라이언트 직접 업로드, 비공개)
- 계산: `lib/`의 순수 함수 (서버와 테스트가 같이 씀)

## 바로 실행 (로컬 개발 모드, 키 필요 없음)

```bash
npm install
npm run dev          # http://localhost:5173
```

환경 변수가 없으면 자동으로 로컬 모드로 돕니다.

| 항목 | 배포 (키 있음) | 로컬 모드 (키 없음) |
| --- | --- | --- |
| DB | Neon (`DATABASE_URL`) | `.local-data/db.json` |
| 원본 CSV | Vercel Blob (`BLOB_READ_WRITE_TOKEN`) | `.local-data/blobs/` (`PUT /api/uploads/local`) |
| API | Vercel Functions | Vite 개발 서버가 같은 `api/` 핸들러를 그대로 호출 (`server/dev-plugin.ts`) |

`GET /api/health`가 지금 어느 모드인지 알려 줍니다.

## 테스트

```bash
npm test             # Vitest 45개: 통계·파싱 경계 사례·bank-full 수용 기준·인사이트 규칙·API
npm run typecheck
PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e   # Playwright: 업로드→리포트→타깃 변경→이력→삭제, 400px 폭
```

### 9.1절 수용 기준 (bank-full.csv) — 모두 통과

| 항목 | 기대값 | 결과 |
| --- | --- | --- |
| 파싱 | 구분자 `;` 자동 인식, 45,211행 × 17열, 따옴표 제거 | 통과 |
| 타깃 | 이진 분류, 양성 = yes, 양성 비율 11.70% (5,289건) | 통과 |
| 연관 | poutcome V 0.312, month V 0.260, duration r 0.395 | 통과 (pandas와 소수 셋째 자리 일치) |
| 특수 코드 | pdays −1 81.7%, poutcome unknown 81.7%, 두 열 겹침 감지 | 통과 (99.99% 일치) |
| 경고 | duration 누수 의심(R-02), 시간 변화(R-03), 불균형(R-04) | 통과, R-02·R-03은 배너 |
| 성능 | 서버 계산 1.5초 이하 | 약 0.9~1.1초 (이 환경 기준) |

6장 기대 결과(R-01 또는 R-02, R-03, R-04, R-06 balance·campaign·previous, R-08 poutcome·pdays·contact, R-09, R-15)도 테스트에 들어 있습니다.

## 배포 (Vercel + Neon + Blob)

1. 이 폴더를 GitHub 저장소로 올리고 Vercel 프로젝트에 연결합니다 (Framework preset: Vite, 출력 `dist/`).
2. Vercel Marketplace에서 **Neon**을 연결하면 `DATABASE_URL`이, **Blob** 스토어를 연결하면 `BLOB_READ_WRITE_TOKEN`이 들어갑니다.
3. `CRON_SECRET`을 추가합니다 (Vercel Cron이 `Authorization: Bearer …`로 보냄).
4. 마이그레이션: `DATABASE_URL=… npm run db:migrate` (파일: `db/migrations/0000_init.sql`).
5. 배포 후 `/api/health`가 `{"ok":true,"storage":{"db":"neon","blob":"vercel"}}`인지 확인합니다.

`vercel.json`: `api/analyses/**` 60초·2GB, 그 밖 10초, 리전 `iad1`, 매시간 Blob 정리 Cron, SPA 라우팅.

## 구조

```text
src/                     React 앱
  pages/                 NewAnalysis(예시 리포트 + 업로드), Report, History
  components/charts/     V-01 ~ V-12
  components/report/     섹션, 경고 배너, 열 유형 표, 작업 막대, 정렬 표
  api/client.ts          fetch 래퍼 + TanStack Query 훅 (Zod로 응답 검증)
  example/bank-sample.json  첫 화면 예시 (npm run build:example 로 다시 생성)
api/                     Vercel Functions (uploads/token, analyses, analyses/[id], [id]/summary, cron, health)
server/                  API 공용 코드 (Neon/로컬 저장소, Blob/로컬 파일, 오류 형식, 개발 서버 플러그인)
lib/                     순수 계산: parse, profile, target, analyze/(A~I), insights(R-01~R-15), summary, schema(Zod)
db/                      Drizzle 스키마와 마이그레이션
tests/                   Vitest (fixtures에 bank.csv·bank-full.csv)
e2e/                     Playwright
```

## 명세와 다르거나 남은 것

- **벤츠 train.csv 수용 기준은 검증하지 못했습니다.** 데이터가 없어서입니다. 파일을 주시면 `tests/`에 같은 형식으로 추가합니다.
- **시간 변화 수치**: 명세 예시는 "5% → 46%"인데, 4.3절 정의(행 순서 5등분)로 계산하면 3.4% → 31.6%입니다 (pandas로도 같음). 이동평균(창 5%)의 최소·최대는 2.1% → 53.2%입니다. 어느 쪽이든 2배 기준을 넘어 R-03은 걸립니다. 문장에는 5등분 값을 씁니다.
- **V-12 월·요일 패턴**: 명세는 이중 축이지만, 두 척도를 한 차트에 겹치면 잘못 읽히기 쉬워 건수 차트와 타깃 평균 차트를 나란히 두었습니다.
- **왜도**는 명세대로 모집단 공식입니다. pandas `skew()`(표본 보정)와는 작은 표본에서 조금 다릅니다.
- **남용 방지**(IP당 업로드 20회/시간, 분석 10회/분)는 함수 인스턴스 메모리 기준이라 대략적입니다. 정확히 하려면 Vercel WAF 규칙이나 공유 저장소(예: Upstash)로 바꿔야 합니다.
- **Vercel Hobby 요금제는 Cron을 하루 1회만 허용**해서, 매시간 일정(`0 * * * *`)이면 배포가 거절될 수 있습니다. Hobby라면 `vercel.json`의 일정을 `0 3 * * *`처럼 바꾸세요. 그러면 원본이 최대 약 48시간 남습니다. 매시간 정리(F-43)는 Pro가 필요합니다.
- **진행 상황 스트리밍(F-54, P1)**과 **v3 OpenAI 해설**은 아직입니다 (`llm_explanations` 테이블만 만들어 둠).
- 실제 Vercel·Neon·Blob 배포는 키가 없어 확인하지 못했습니다. 로컬 모드에서 같은 핸들러로 전체 흐름을 확인했습니다.

## 데이터 출처

Bank Marketing: S. Moro, R. Laureano, P. Cortez (2011), UCI Machine Learning Repository, CC BY 4.0. `public/samples/bank.csv`, `tests/fixtures/`.
