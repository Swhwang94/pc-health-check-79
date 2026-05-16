# PCFixer — 프로젝트 컨텍스트

dxdiag.txt 파일 하나로 PC 병목을 진단하고 업그레이드 부품을 추천하는 웹 서비스.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | React 19 + TanStack Router/Start (SSR) |
| 스타일 | Tailwind CSS v4 |
| 데이터 | Supabase (PostgreSQL + Storage + Auth) |
| AI | Google Gemini 2.5 Flash Lite (`gemini-2.5-flash-lite`) |
| 배포 | Cloudflare Workers (`wrangler.jsonc`) |
| 빌드 | Vite 7 + `@lovable.dev/vite-tanstack-config` |
| 개발 포트 | 8082 (`vite.config.ts` → `strictPort: true`) |

---

## 환경 변수 (`.env.local`)

```
VITE_GEMINI_API_KEY=...
VITE_SUPABASE_URL=https://<project>.supabase.co          # /rest/v1/ 없이 베이스 URL만
VITE_SUPABASE_PUBLISHABLE_KEY=...                         # ANON KEY (VITE_SUPABASE_ANON_KEY 아님)
```

---

## 라우트 구조

```
/            → 랜딩 (src/routes/index.tsx)
/diagnose    → dxdiag 업로드 + 진단 실행 (src/routes/diagnose.tsx)
/result/$id  → 진단 결과 표시 (src/routes/result.$id.tsx)
/auth        → 이메일 + Google OAuth 로그인 (src/routes/auth.tsx)
/callback    → OAuth 리다이렉트 처리 (src/routes/callback.tsx)
```

---

## Supabase 스키마

### `parts` 테이블
```sql
id              UUID PRIMARY KEY
name            TEXT NOT NULL
aliases         TEXT[]           -- 부품명 별칭 배열 (검색 매칭용)
category        TEXT NOT NULL    -- 'CPU' | 'GPU'
brand           TEXT
benchmark_score INT              -- PassMark 점수
specs           JSONB            -- 스펙 + score_source + source_url 포함
created_at      TIMESTAMPTZ
```

### `diagnoses` 테이블
```sql
id              UUID PRIMARY KEY
user_id         UUID             -- NULL 허용 (비로그인 진단)
session_id      TEXT             -- localStorage 기반 익명 세션
diagnosis_type  TEXT             -- 'quick'
parsed_specs    JSONB            -- { CPU, GPU, RAM }
bottleneck_result JSONB          -- BottleneckResult (아래 참고)
percentile_rank INT              -- NULL = 진단불가
rank_grade      TEXT             -- 'S'|'A+'|'A'|'B'|'C'|'D'|'F' | NULL
created_at      TIMESTAMPTZ
```

### `diagnosis_inputs` 테이블
```sql
id              UUID PRIMARY KEY
diagnosis_id    UUID REFERENCES diagnoses(id)
input_type      TEXT             -- 'dxdiag'
file_url        TEXT             -- Supabase Storage public URL
created_at      TIMESTAMPTZ
```

---

## 핵심 타입 (`src/lib/diagnosis-types.ts`)

```typescript
type ParsedSpecs = { CPU: string; GPU: string; RAM: string };

type Recommendation = { rank: number; name: string; reason: string };

type BottleneckResult = {
  bottleneck_part: string;
  reason: string;
  recommendations: Recommendation[];
  percentile_rank?: number;   // undefined = 진단불가
  rank_grade?: string;
};
```

---

## 진단 흐름 (`src/routes/diagnose.tsx`)

```
1. dxdiag.txt 업로드
2. parseDxdiagSpecs()       → CPU / GPU / RAM 텍스트 추출
3. isDxdiagSpecsUsable()    → 최소 1개 이상 파싱됐는지 확인
4. Supabase Storage 업로드  → dxdiag-files 버킷
5. [병렬 실행]
   a. analyzeBottleneckFromParsedSpecs()       → Gemini 병목 분석
   b. computePercentileAndGradeFromParts()     → 백분위 + 등급 산출
6. diagnoses 테이블 INSERT
7. diagnosis_inputs 테이블 INSERT
8. /result/$id 로 이동
```

---

## 백분위 산출 로직 (`src/lib/rank-percentile.ts`)

### DB 조회 → Grounding 폴백 순서

```
findBenchmarkScore(부품명, 카테고리)
  1. parts 테이블에서 name / aliases 부분 문자열 매칭
  2. 매칭 실패 → findByGrounding() 호출
     a. searchPartBenchmarkWithGrounding()  ← Gemini Search Grounding
     b. 점수 획득 시 → parts 테이블에 비동기 저장 (fire-and-forget)
     c. 정보 없음 → null 반환 (해당 부품 진단불가)
```

### PassMark 임계값 테이블 (고정, 2025년 상반기 기준)

| CPU 점수 | GPU 점수 | Percentile | 등급 |
|----------|----------|------------|------|
| ≥ 50,000 | ≥ 26,000 | 95 | S |
| ≥ 38,000 | ≥ 18,000 | 90 | A+ |
| ≥ 24,000 | ≥ 12,000 | 75 | A |
| ≥ 14,000 | ≥  8,000 | 50 | B |
| ≥  8,000 | ≥  5,000 | 30 | C |
| ≥  4,000 | ≥  2,500 | 15 | D |
| 그 외    | 그 외    | 5  | F |

- CPU·GPU 둘 다 점수 있으면 평균
- 하나만 있으면 그 값 사용
- **둘 다 null → `percentile_rank: null`, `rank_grade: null` (진단불가)**

---

## Gemini 함수 목록 (`src/lib/gemini.ts`)

### `analyzeBottleneckFromParsedSpecs(parsed_specs)`
- 병목 부품 + 이유 + 업그레이드 추천 JSON 반환
- `responseMimeType: "application/json"` 사용
- Zod로 응답 검증

### `searchPartBenchmarkWithGrounding(partName, category)`
- `tools: [{ googleSearch: {} }]` — Gemini 2.x Search Grounding
- PassMark 점수, 스펙, 출처 URL을 JSON으로 요청
- 직접 점수 없으면 유사 제품군 추정 (`score_inferred: true`)
- 실패 시 `{ found: false }` 반환 (예외 던지지 않음)

---

## 결과 화면 표시 규칙 (`src/routes/result.$id.tsx`)

| 상태 | 백분위 표시 | 등급 배지 |
|------|------------|----------|
| 정상 | "상위 N%" (녹색 그라데이션) | S~F (녹색) |
| 진단불가 | "진단불가" (회색 텍스트) | "—" (회색) |

---

## 주요 파일 목록

```
src/
├── lib/
│   ├── diagnosis-types.ts   # 공통 타입 (ParsedSpecs, BottleneckResult 등)
│   ├── dxdiag-parse.ts      # dxdiag.txt 파서
│   ├── gemini.ts            # Gemini API 호출 (병목 분석 + Search Grounding)
│   ├── rank-percentile.ts   # 백분위 산출 + Grounding 폴백 + DB 저장
│   ├── session.ts           # 익명 세션 ID (localStorage)
│   └── utils.ts             # cn() 등 유틸
├── routes/
│   ├── __root.tsx           # 레이아웃, 네비게이션, 메타태그
│   ├── index.tsx            # 랜딩
│   ├── diagnose.tsx         # 업로드 + 진단 실행
│   ├── result.$id.tsx       # 결과 표시
│   ├── auth.tsx             # 로그인/회원가입
│   └── callback.tsx         # OAuth 콜백
├── contexts/
│   └── auth.tsx             # AuthContext (Supabase Auth 래퍼)
└── integrations/
    └── supabase/
        ├── client.ts        # Supabase 클라이언트 (VITE_SUPABASE_PUBLISHABLE_KEY 사용)
        └── types.ts         # DB 자동 생성 타입
```

---

## 알려진 이슈 / 미완성 항목

1. **Gemini API 키 클라이언트 노출**: `VITE_GEMINI_API_KEY`는 브라우저 번들에 포함됨.
   TanStack Start SSR 환경이므로 Gemini 호출을 서버 함수로 이전하는 것이 권장됨.

2. **ESLint CRLF 경고**: Windows/OneDrive 환경의 줄 끝(CRLF) 문제.
   `npm run format` 실행 시 전체 정리 가능.

3. **parts 테이블 name 유니크 제약 없음**: Grounding 저장 시 동일 부품이 중복 삽입될 수 있음.
   빈도는 낮지만 필요하면 `UNIQUE(name, category)` 제약 마이그레이션 추가 권장.
