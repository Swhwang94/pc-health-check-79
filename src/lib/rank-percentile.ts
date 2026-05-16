/**
 * rank-percentile.ts
 *
 * PassMark + Steam 하드웨어 서베이 기반 고정 임계값으로 백분위 계산
 * parts 테이블은 부품명 → benchmark_score 조회용으로만 사용
 *
 * percentile_rank: 1~99 (숫자가 클수록 상위 성능)
 *   ex) 85 = "상위 15%"
 *
 * 확장: 다른 데이터 소스(예: 실측 Steam API)가 생기면 이 파일에 형제 함수를 두고
 * `diagnose.tsx`에서 필요한 조합(가중 평균 등)만 호출부에서 이어 붙이면 됩니다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { searchPartBenchmarkWithGrounding } from "@/lib/gemini";

type DbClient = SupabaseClient<Database>;

/** `computePercentileAndGradeFromParts` 반환 형태 — DB `diagnoses` 컬럼과 동일 의미 */
export type RankPercentileFromPartsResult = {
  /** null = 두 부품 모두 정보를 찾지 못한 경우 (진단불가) */
  percentile_rank: number | null;
  rank_grade: string | null;
};

// -------------------------------------------------------
// 1. 고정 임계값 테이블
//    기준: PassMark 전 세계 측정 데이터 (2025년 상반기)
//    percentile = 상위 N% 진입 기준점
//    ex) CPU_THRESHOLDS[0] → 점수 50000 이상이면 상위 5% = percentile 95
// -------------------------------------------------------

const CPU_THRESHOLDS: { minScore: number; percentile: number }[] = [
  { minScore: 50000, percentile: 95 }, // 상위  5%  → S
  { minScore: 38000, percentile: 90 }, // 상위 10%  → A+
  { minScore: 24000, percentile: 75 }, // 상위 25%  → A
  { minScore: 14000, percentile: 50 }, // 상위 50%  → B
  { minScore: 8000, percentile: 30 }, // 상위 70%  → C
  { minScore: 4000, percentile: 15 }, // 상위 85%  → D
  { minScore: 0, percentile: 5 }, // 하위 10%  → F
];

const GPU_THRESHOLDS: { minScore: number; percentile: number }[] = [
  { minScore: 26000, percentile: 95 }, // 상위  5%  → S  (RTX 4080 이상)
  { minScore: 18000, percentile: 90 }, // 상위 10%  → A+ (RTX 3080 / RX 6800XT 이상)
  { minScore: 12000, percentile: 75 }, // 상위 25%  → A  (RTX 3060Ti / RX 6600XT 이상)
  { minScore: 8000, percentile: 50 }, // 상위 50%  → B  (GTX 1080Ti / RX 5700 이상)
  { minScore: 5000, percentile: 30 }, // 상위 70%  → C  (GTX 1060 6GB 이상)
  { minScore: 2500, percentile: 15 }, // 상위 85%  → D  (GTX 1050Ti 이상)
  { minScore: 0, percentile: 5 }, // 하위 10%  → F
];

// -------------------------------------------------------
// 2. 점수 → percentile 변환
// -------------------------------------------------------

function scoreToPercentile(
  score: number,
  thresholds: { minScore: number; percentile: number }[],
): number {
  for (const t of thresholds) {
    if (score >= t.minScore) return t.percentile;
  }
  return 5; // 안전 fallback
}

// -------------------------------------------------------
// 3. percentile → 등급 변환
// -------------------------------------------------------

export function gradeFromPercentile(percentile: number): string {
  if (percentile >= 95) return "S";
  if (percentile >= 85) return "A+";
  if (percentile >= 70) return "A";
  if (percentile >= 50) return "B";
  if (percentile >= 30) return "C";
  if (percentile >= 10) return "D";
  return "F";
}

// -------------------------------------------------------
// 4. 부품명 → parts 테이블에서 benchmark_score 조회
//    aliases 배열 포함 부분 문자열 매칭 (가장 길게 겹치는 후보 우선)
//    DB 미스 시 Gemini Search Grounding으로 폴백
// -------------------------------------------------------

function extractBrand(name: string): string | null {
  if (/intel/i.test(name)) return "Intel";
  if (/amd|ryzen|epyc/i.test(name)) return "AMD";
  if (/nvidia|geforce|rtx|gtx|quadro/i.test(name)) return "NVIDIA";
  return null;
}

async function findByGrounding(
  supabase: DbClient,
  partName: string,
  category: "CPU" | "GPU",
): Promise<number | null> {
  const result = await searchPartBenchmarkWithGrounding(partName, category);
  if (!result.found || result.benchmark_score == null) return null;

  const canonicalName = result.canonical_name ?? partName;

  // fire-and-forget: 실패해도 진단 흐름을 막지 않음
  supabase
    .from("parts")
    .insert({
      name: canonicalName,
      aliases: canonicalName !== partName ? [partName] : null,
      category,
      brand: extractBrand(canonicalName),
      benchmark_score: result.benchmark_score,
      specs: {
        ...result.specs,
        score_source: result.score_inferred ? "gemini_inferred" : "gemini_grounding",
        source_url: result.source,
      },
    })
    .then(({ error }) => {
      if (error) console.error("[parts] Grounding 결과 저장 실패:", error.message);
    });

  return result.benchmark_score;
}

async function findBenchmarkScore(
  supabase: DbClient,
  partName: string,
  category: "CPU" | "GPU",
): Promise<number | null> {
  if (!partName || partName === "-") return null;

  const { data, error } = await supabase
    .from("parts")
    .select("name, aliases, benchmark_score")
    .ilike("category", category)
    .not("benchmark_score", "is", null);

  if (error || !data || data.length === 0) {
    return findByGrounding(supabase, partName, category);
  }

  const normalized = partName.toLowerCase();
  let bestMatch: { score: number; matchLength: number } | null = null;

  for (const part of data) {
    const bench = part.benchmark_score;
    if (bench == null || !Number.isFinite(bench)) continue;

    const candidates: string[] = [
      part.name,
      ...(Array.isArray(part.aliases) ? part.aliases : []),
    ].filter((s): s is string => typeof s === "string" && s.trim().length >= 2);

    for (const candidate of candidates) {
      const c = candidate.toLowerCase();
      if (normalized.includes(c) || c.includes(normalized)) {
        const matchLength = c.length;
        if (!bestMatch || matchLength > bestMatch.matchLength) {
          bestMatch = { score: bench, matchLength };
        }
      }
    }
  }

  if (bestMatch) return bestMatch.score;

  // DB에 데이터는 있지만 이 부품과 매칭되는 항목 없음 → Grounding 시도
  return findByGrounding(supabase, partName, category);
}

// -------------------------------------------------------
// 5. 메인 함수: parsed_specs → { percentile_rank, rank_grade }
// -------------------------------------------------------

export async function computePercentileAndGradeFromParts(
  supabase: DbClient,
  parsedSpecs: { CPU?: string; GPU?: string; RAM?: string },
): Promise<RankPercentileFromPartsResult> {
  const [cpuScore, gpuScore] = await Promise.all([
    parsedSpecs.CPU ? findBenchmarkScore(supabase, parsedSpecs.CPU, "CPU") : null,
    parsedSpecs.GPU ? findBenchmarkScore(supabase, parsedSpecs.GPU, "GPU") : null,
  ]);

  const cpuPercentile = cpuScore != null ? scoreToPercentile(cpuScore, CPU_THRESHOLDS) : null;

  const gpuPercentile = gpuScore != null ? scoreToPercentile(gpuScore, GPU_THRESHOLDS) : null;

  // 둘 다 있으면 평균, 하나만 있으면 그쪽만, 둘 다 없으면 null (진단불가)
  let percentile_rank: number | null;
  if (cpuPercentile != null && gpuPercentile != null) {
    percentile_rank = Math.round((cpuPercentile + gpuPercentile) / 2);
  } else if (cpuPercentile != null) {
    percentile_rank = cpuPercentile;
  } else if (gpuPercentile != null) {
    percentile_rank = gpuPercentile;
  } else {
    percentile_rank = null;
  }

  const rank_grade = percentile_rank != null ? gradeFromPercentile(percentile_rank) : null;

  return { percentile_rank, rank_grade };
}
