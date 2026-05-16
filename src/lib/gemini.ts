import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import type { BottleneckResult, ParsedSpecs, Recommendation } from "@/lib/diagnosis-types";

const geminiBottleneckJsonSchema = z.object({
  bottleneck_part: z.string().min(1),
  reason: z.string().min(1),
  recommendations: z
    .array(
      z.object({
        rank: z.number().int().positive(),
        name: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .min(1)
    .max(5),
});

function extractJsonFromModelText(raw: string): unknown {
  const t = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(t);
  const body = (fenced?.[1] ?? t).trim();
  return JSON.parse(body) as unknown;
}

function normalizeRecommendations(recs: Recommendation[]): Recommendation[] {
  const sorted = [...recs].sort((a, b) => a.rank - b.rank);
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Gemini API에서 사용할 모델 ID (.env의 키와 함께 사용) */
export const GEMINI_MODEL_ID = "gemini-2.5-flash-lite" as const;

let geminiClient: GoogleGenerativeAI | null = null;

function getGeminiApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  if (typeof key !== "string" || !key.trim()) {
    throw new Error(
      "VITE_GEMINI_API_KEY가 비어 있습니다. 프로젝트 루트의 .env.local에 키를 설정해 주세요.",
    );
  }
  return key.trim();
}

/**
 * `.env.local`의 `VITE_GEMINI_API_KEY`로 초기화된 Gemini 클라이언트를 반환합니다.
 * 동일 프로세스 내에서는 한 번만 생성합니다.
 */
export function getGeminiClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(getGeminiApiKey());
  }
  return geminiClient;
}

/**
 * dxdiag에서 추출한 `parsed_specs`만으로 병목 분석 JSON을 Gemini에 요청합니다.
 * 상위 몇 %·등급(S~F)은 호출 측에서 `parts.benchmark_score` 기반으로 별도 계산합니다.
 */
export async function analyzeBottleneckFromParsedSpecs(
  parsed_specs: ParsedSpecs,
): Promise<{ bottleneck_result: BottleneckResult }> {
  const model = getGeminiClient().getGenerativeModel({
    model: GEMINI_MODEL_ID,
    systemInstruction: [
      "당신은 PC 하드웨어 밸런스와 게이밍·일반 워크로드 병목을 분석하는 전문가입니다.",
      "반드시 요청된 필드만 가진 JSON 한 개만 출력합니다. 앞뒤 설명·마크다운·코드펜스는 금지입니다.",
      "한국어(존댓말)로 reason과 recommendations[].reason을 작성합니다.",
      "상위 몇 %·등급(S~F)은 출력하지 마세요. 병목 분석과 추천만 작성합니다.",
      "recommendations는 우선순위가 높은 순으로 1~5개, rank는 1부터 연속 번호로 매깁니다.",
    ].join("\n"),
  });

  const schemaHint = `{
  "bottleneck_part": "CPU | GPU | RAM | 기타 중 하나 (짧은 한글 또는 영문 라벨)",
  "reason": "한국어 병목 분석 본문",
  "recommendations": [
    { "rank": 1, "name": "업그레이드·조치 제목", "reason": "한국어 설명" }
  ]
}`;

  const userPrompt = [
    "아래 parsed_specs(JSON)만 근거로 이 PC의 병목과 업그레이드 추천을 분석하세요.",
    "사양 문자열에 없는 정확한 벤치 수치는 지어내지 말고, 일반적인 제품군 지식으로만 판단하세요.",
    "",
    "출력 JSON 스키마(필드 이름·타입을 정확히 지킬 것):",
    schemaHint,
    "",
    "입력:",
    JSON.stringify({ parsed_specs }, null, 2),
  ].join("\n");

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  });

  const text = result.response.text();
  if (!text?.trim()) {
    throw new Error("Gemini 병목 분석 응답이 비어 있습니다.");
  }

  let parsed: unknown;
  try {
    parsed = extractJsonFromModelText(text);
  } catch {
    throw new Error("Gemini 응답 JSON을 파싱할 수 없습니다.");
  }

  const decoded = geminiBottleneckJsonSchema.safeParse(parsed);
  if (!decoded.success) {
    throw new Error(`Gemini JSON 검증 실패: ${decoded.error.message}`);
  }

  const d = decoded.data;
  const bottleneck_result: BottleneckResult = {
    bottleneck_part: d.bottleneck_part.trim(),
    reason: d.reason.trim(),
    recommendations: normalizeRecommendations(d.recommendations),
  };

  return { bottleneck_result };
}

// -------------------------------------------------------
// 정밀진단 챗봇 — 멀티턴 대화
// -------------------------------------------------------

export type ChatPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type ChatMessage = {
  role: "user" | "model";
  parts: ChatPart[];
};

function buildPreciseDiagnosisSystemInstruction(parsedSpecs: ParsedSpecs | null): string {
  const specsSection = parsedSpecs
    ? `사용자의 PC 사양:\n- CPU: ${parsedSpecs.CPU}\n- GPU: ${parsedSpecs.GPU}\n- RAM: ${parsedSpecs.RAM}\n\n`
    : "";

  return [
    "당신은 PCFixer의 AI PC 업그레이드 상담사입니다.",
    "",
    specsSection,
    "역할:",
    "1. dxdiag 정보가 없으면 먼저 dxdiag.txt 업로드를 요청하세요.",
    "   업로드 받으면 내용을 분석해 사양을 파악하세요.",
    "",
    "2. 사양 확인 후 아래 정보를 단계적으로 수집하세요",
    "   (한 번에 여러 개 묻지 말고 대화하듯 하나씩):",
    "   - 주 사용 목적(게임/작업/영상편집 등) + 예산",
    "   - RAM 클럭: wmic memorychip get speed 명령어 결과 요청",
    "   - 파워서플라이: 케이스 측면 라벨 사진 또는 모델명 직접 입력 안내",
    "   - 온도 이슈 의심 시: HWiNFO64 스크린샷 업로드 안내",
    "",
    "3. 충분한 정보 수집 후 우선순위와 이유를 명확히 한 종합 업그레이드 추천을 제시하세요.",
    "",
    "항상 한국어로, 친절하고 대화하듯 답변하세요.",
  ]
    .join("\n")
    .trim();
}

/**
 * 정밀진단 멀티턴 메시지를 Gemini에 전송하고 모델 응답 텍스트를 반환합니다.
 * 이미지 파트(inlineData)를 포함한 messages를 그대로 전달합니다.
 */
export async function sendPreciseDiagnosisMessage(
  messages: ChatMessage[],
  parsedSpecs: ParsedSpecs | null,
): Promise<string> {
  const model = getGeminiClient().getGenerativeModel({
    model: GEMINI_MODEL_ID,
    systemInstruction: buildPreciseDiagnosisSystemInstruction(parsedSpecs),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await model.generateContent({
    contents: messages as any,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  });

  const text = result.response.text();
  if (!text?.trim()) throw new Error("Gemini 응답이 비어 있습니다.");
  return text.trim();
}

// -------------------------------------------------------
// Google Search Grounding — parts DB 미스 시 벤치마크 검색
// -------------------------------------------------------

const partGroundingSchema = z.object({
  found: z.boolean(),
  canonical_name: z.string().min(1).optional(),
  benchmark_score: z.number().int().positive().optional(),
  score_inferred: z.boolean().optional(),
  specs: z.record(z.unknown()).optional(),
  source: z.string().optional(),
});

export type PartGroundingResult = {
  found: boolean;
  canonical_name: string | null;
  benchmark_score: number | null;
  score_inferred: boolean;
  specs: Record<string, unknown>;
  source: string | null;
};

const NOT_FOUND: PartGroundingResult = {
  found: false,
  canonical_name: null,
  benchmark_score: null,
  score_inferred: false,
  specs: {},
  source: null,
};

/**
 * Google Search Grounding으로 부품의 PassMark 점수와 스펙을 검색합니다.
 * DB에서 해당 부품을 찾지 못했을 때 호출됩니다.
 */
export async function searchPartBenchmarkWithGrounding(
  partName: string,
  category: "CPU" | "GPU",
): Promise<PartGroundingResult> {
  try {
    const model = getGeminiClient().getGenerativeModel({
      model: GEMINI_MODEL_ID,
      // googleSearch는 Gemini 2.x 전용 grounding 도구입니다.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ googleSearch: {} }] as any,
    });

    const schemaHint = `{
  "found": true,
  "canonical_name": "공식 모델명 (예: Intel Core i5-12400F)",
  "benchmark_score": 15000,
  "score_inferred": false,
  "specs": { "cores": 6, "clock_ghz": 2.5, "tdp_w": 65 },
  "source": "https://www.cpubenchmark.net/..."
}`;

    const prompt = [
      `다음 ${category}의 PassMark 벤치마크 점수와 주요 스펙을 검색해서 JSON으로만 반환하세요.`,
      `부품명: ${partName}`,
      "",
      "출력 형식 (마크다운·설명 없이 JSON만):",
      schemaHint,
      "",
      "규칙:",
      "- PassMark 점수를 직접 찾지 못하면 유사 제품군 대비 추정값을 넣고 score_inferred: true로 설정",
      "- 정보를 전혀 찾지 못하면 { \"found\": false } 만 반환",
    ].join("\n");

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
      },
    });

    const text = result.response.text();
    if (!text?.trim()) return NOT_FOUND;

    let parsed: unknown;
    try {
      parsed = extractJsonFromModelText(text);
    } catch {
      return NOT_FOUND;
    }

    const decoded = partGroundingSchema.safeParse(parsed);
    if (!decoded.success || !decoded.data.found) return NOT_FOUND;

    const d = decoded.data;
    return {
      found: true,
      canonical_name: d.canonical_name ?? partName,
      benchmark_score: d.benchmark_score ?? null,
      score_inferred: d.score_inferred ?? false,
      specs: (d.specs ?? {}) as Record<string, unknown>,
      source: d.source ?? null,
    };
  } catch {
    return NOT_FOUND;
  }
}
