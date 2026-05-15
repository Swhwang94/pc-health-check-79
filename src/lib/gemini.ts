import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import type { BottleneckResult, ParsedSpecs, Recommendation } from "@/lib/fake-diagnosis";

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

export type DiagnosisReportInput = {
  parsed_specs: Partial<ParsedSpecs>;
  bottleneck_result: Partial<BottleneckResult>;
};

/**
 * `parsed_specs`와 `bottleneck_result`를 바탕으로 Gemini가 작성한
 * 한국어 자연어 분석 리포트(마크다운 없이 일반 문단 위주 권장) 문자열을 반환합니다.
 */
export async function generateKoreanDiagnosisReport(
  parsed_specs: Partial<ParsedSpecs>,
  bottleneck_result: Partial<BottleneckResult>,
): Promise<string> {
  const model = getGeminiClient().getGenerativeModel({
    model: GEMINI_MODEL_ID,
    systemInstruction: [
      "당신은 PC 하드웨어·게이밍·생산성 워크로드에 정통한 시스템 분석가입니다.",
      "사용자에게 전달되는 최종 답변은 반드시 한국어(존댓말)로만 작성합니다.",
      "입력 JSON에 없는 사실은 추측하지 말고, 일반적인 업그레이드·사용 팁 수준으로만 보완합니다.",
      "출력은 마크다운 제목·코드블록 없이 읽기 좋은 여러 문단으로 구성합니다.",
    ].join("\n"),
  });

  const payload: DiagnosisReportInput = { parsed_specs, bottleneck_result };
  const userPrompt = [
    "아래는 한 대의 PC에 대한 파싱된 사양(parsed_specs)과 병목 진단 결과(bottleneck_result)입니다.",
    "이 데이터를 근거로 다음을 포함한 자연어 리포트를 작성해 주세요.",
    "1) 사양 요약과 전체적인 성격(대략 어떤 용도에 적합한지)",
    "2) 병목 부품과 그 이유를 사용자 관점에서 풀어 설명",
    "3) recommendations가 있으면 우선순위와 기대 효과를 정리",
    "4) 추가로 점검해 보면 좋은 설정·모니터링 팁(과장 없이)",
    "",
    JSON.stringify(payload, null, 2),
  ].join("\n");

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: 4096,
    },
  });

  const text = result.response.text();
  if (!text?.trim()) {
    throw new Error("Gemini 응답 본문이 비어 있습니다.");
  }
  return text.trim();
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
