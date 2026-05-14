import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/result")({
  head: () => ({
    meta: [
      { title: "진단 결과 — PCFixer" },
      { name: "description", content: "내 PC 병목 진단 결과와 업그레이드 추천" },
    ],
  }),
  component: Result,
});

const specs = [
  { label: "CPU", value: "Intel Core i7-12700K" },
  { label: "GPU", value: "NVIDIA GeForce RTX 3080" },
  { label: "RAM", value: "16 GB" },
];

const upgrades = [
  {
    rank: 1,
    name: "DDR4 32GB (16GB×2) 3600MHz",
    reason: "가장 효율적인 업그레이드. 모든 작업의 응답성이 즉시 개선됩니다.",
  },
  {
    rank: 2,
    name: "NVMe SSD 1TB",
    reason: "로딩 시간 감소 및 시스템 응답성 향상.",
  },
  {
    rank: 3,
    name: "수랭 쿨러",
    reason: "장시간 작업 시 성능 저하 방지.",
  },
];

function Result() {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

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
              Steam 하드웨어 서베이 기준 · 전체 PC 유저 중
            </p>
            <p className="mt-2 text-5xl font-bold tracking-tight md:text-6xl">
              상위{" "}
              <span className="bg-gradient-to-r from-primary to-[var(--accent2)] bg-clip-text text-transparent">
                35%
              </span>
            </p>
          </div>
          <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-[var(--success)]/15 text-5xl font-bold text-[var(--success)] ring-2 ring-[var(--success)]/30">
            B
          </div>
        </div>
      </section>

      {/* Specs */}
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {specs.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border bg-card/50 p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {s.label}
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">
              {s.value}
            </p>
          </div>
        ))}
      </section>

      {/* Bottleneck */}
      <section className="mt-8 rounded-2xl border border-border bg-card/40 p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent2)]">
          AI 병목 진단
        </p>
        <h2 className="mt-3 text-3xl font-bold tracking-tight">
          <span className="text-primary">RAM</span>이 병목입니다
        </h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          현재 16GB RAM은 최신 게임 권장 사양 대비 부족합니다. CPU와 GPU 성능을
          충분히 활용하지 못하고 있습니다.
        </p>
      </section>

      {/* Upgrades */}
      <section className="mt-8">
        <h2 className="text-xl font-bold tracking-tight">업그레이드 추천</h2>
        <div className="mt-4 space-y-3">
          {upgrades.map((u) => (
            <div
              key={u.rank}
              className="flex gap-5 rounded-xl border border-border bg-card/50 p-5 transition hover:border-primary/40"
            >
              <div
                className={`flex h-12 w-12 flex-none items-center justify-center rounded-lg text-lg font-bold ${
                  u.rank === 1
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {u.rank}
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  {u.name}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {u.reason}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

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
