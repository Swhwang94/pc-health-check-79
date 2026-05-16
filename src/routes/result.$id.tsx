import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BottleneckResult, ParsedSpecs, Recommendation } from "@/lib/diagnosis-types";

type DiagnosisRow = {
  parsed_specs?: unknown;
  bottleneck_result?: unknown;
  percentile_rank?: number | null;
  rank_grade?: string | null;
};

function resolveGeminiPercentile(
  row: DiagnosisRow,
  bottleneck: Partial<BottleneckResult>,
): number | null {
  const col = row.percentile_rank;
  if (typeof col === "number" && Number.isFinite(col)) return Math.round(col);
  const j = bottleneck.percentile_rank;
  if (typeof j === "number" && Number.isFinite(j)) return Math.round(j);
  return null;
}

function resolveGeminiGrade(
  row: DiagnosisRow,
  bottleneck: Partial<BottleneckResult>,
): string | null {
  const col = row.rank_grade;
  if (typeof col === "string" && col.trim()) return col.trim();
  const j = bottleneck.rank_grade;
  if (typeof j === "string" && j.trim()) return j.trim();
  return null;
}

export const Route = createFileRoute("/result/$id")({
  head: () => ({
    meta: [
      { title: "진단 결과 — PCFixer" },
      { name: "description", content: "내 PC 병목 진단 결과와 업그레이드 추천" },
    ],
  }),
  component: Result,
});

function Result() {
  const { id } = Route.useParams();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["diagnosis", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("diagnoses")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-muted-foreground">
        진단 결과 불러오는 중...
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">진단 결과를 찾을 수 없습니다</h1>
        <p className="mt-3 text-muted-foreground">
          링크가 잘못되었거나 결과가 삭제되었을 수 있어요.
        </p>
        <Link
          to="/diagnose"
          className="mt-8 inline-block rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          새 진단 시작하기
        </Link>
      </main>
    );
  }

  const parsed = (data.parsed_specs ?? {}) as Partial<ParsedSpecs>;
  const bottleneck = (data.bottleneck_result ?? {}) as Partial<BottleneckResult>;
  const recs: Recommendation[] = bottleneck.recommendations ?? [];

  const percentileDisplay = resolveGeminiPercentile(data, bottleneck);
  const gradeDisplay = resolveGeminiGrade(data, bottleneck);

  const specs = [
    { label: "CPU", value: parsed.CPU ?? "-" },
    { label: "GPU", value: parsed.GPU ?? "-" },
    { label: "RAM", value: parsed.RAM ?? "-" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center gap-4">
        <Link
          to="/"
          className="rounded-lg border border-border bg-card/50 px-3 py-2 text-sm text-muted-foreground transition hover:bg-card hover:text-foreground"
        >
          ← 홈으로
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">진단 결과</h1>
      </header>

      {/* Ranking banner */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/20 via-card to-card p-8">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              {percentileDisplay != null
                ? "PassMark 벤치마크 기준 · 카탈로그 내 상대 순위 (추정)"
                : "부품 정보를 찾을 수 없어 순위를 산출할 수 없습니다"}
            </p>
            {percentileDisplay != null ? (
              <p className="mt-2 text-5xl font-bold tracking-tight md:text-6xl">
                상위{" "}
                <span className="bg-gradient-to-r from-primary to-[var(--accent2)] bg-clip-text text-transparent">
                  {100 - percentileDisplay}%
                </span>
              </p>
            ) : (
              <p className="mt-2 text-4xl font-bold tracking-tight text-muted-foreground">
                진단불가
              </p>
            )}
          </div>
          <div
            className={`flex h-24 w-24 items-center justify-center rounded-2xl text-5xl font-bold ring-2 ${
              gradeDisplay != null
                ? "bg-[var(--success)]/15 text-[var(--success)] ring-[var(--success)]/30"
                : "bg-muted text-muted-foreground ring-muted/30"
            }`}
          >
            {gradeDisplay ?? "—"}
          </div>
        </div>
      </section>

      {/* Specs */}
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {specs.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card/50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">{s.value}</p>
          </div>
        ))}
      </section>

      {/* Bottleneck */}
      <section className="mt-8 rounded-2xl border border-border bg-card/40 p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent2)]">
          AI 병목 진단
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight">
          <span className="text-primary">{bottleneck.bottleneck_part ?? "-"}</span>이 병목입니다
        </h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">{bottleneck.reason ?? ""}</p>
      </section>

      {/* Upgrades */}
      {recs.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold tracking-tight">업그레이드 추천</h2>
          <div className="mt-4 space-y-3">
            {recs.map((u) => (
              <div
                key={u.rank}
                className="flex gap-5 rounded-xl border border-border bg-card/50 p-5 transition hover:border-primary/40"
              >
                <div
                  className={`flex h-12 w-12 flex-none items-center justify-center rounded-lg text-lg font-bold ${
                    u.rank === 1 ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {u.rank}
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">{u.name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{u.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10 flex justify-center">
        <button
          onClick={copyLink}
          className="rounded-xl border border-border bg-card/50 px-6 py-3 text-sm font-semibold text-foreground transition hover:border-primary/60 hover:bg-card"
        >
          {copied ? "✓ 복사 완료" : "🔗 결과 링크 복사"}
        </button>
      </div>
    </main>
  );
}
