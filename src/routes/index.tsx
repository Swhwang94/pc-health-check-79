import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PCFixer — 내 PC 병목 진단 + 업그레이드 추천" },
      {
        name: "description",
        content:
          "dxdiag 파일 하나로 30초 만에 내 PC 병목을 진단하고 업그레이드 부품을 추천받으세요. 설치 없음, 회원가입 없음, 무료.",
      },
      { property: "og:title", content: "PCFixer — 내 PC 병목 진단" },
      {
        property: "og:description",
        content: "dxdiag 파일 하나로 30초 만에 내 PC 병목 진단 + 업그레이드 추천",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="absolute left-1/2 top-1/3 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[120px]" />

      <div className="absolute top-8 text-lg font-semibold tracking-tight">
        <span className="text-primary">PC</span>
        <span className="text-foreground">Fixer</span>
      </div>

      <h1 className="max-w-3xl text-5xl font-bold leading-tight tracking-tight md:text-6xl">
        내 PC, 지금{" "}
        <span className="bg-gradient-to-r from-primary to-[var(--accent2)] bg-clip-text text-transparent">
          뭐가 막히고
        </span>{" "}
        있을까?
      </h1>

      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        dxdiag 파일 하나로 30초 만에 내 PC 병목 진단 + 업그레이드 추천
      </p>

      <Link
        to="/diagnose"
        className="mt-10 inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:scale-[1.02] hover:bg-primary/90"
      >
        내 PC 진단하기 <span aria-hidden>→</span>
      </Link>

      <p className="mt-8 text-sm text-muted-foreground">
        설치 없음 · 회원가입 없음 · 무료
      </p>
    </main>
  );
}
