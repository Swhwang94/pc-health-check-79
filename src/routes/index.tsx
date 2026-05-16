import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/auth";

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
  const { user } = useAuth();
  const navigate = useNavigate();

  const handlePreciseDiagnose = () => {
    if (user) {
      navigate({ to: "/diagnose-pro" });
    } else {
      navigate({ to: "/auth", search: { redirect: "/diagnose-pro" } });
    }
  };

  return (
    <main className="relative flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-6 text-center">
      <div className="absolute left-1/2 top-1/3 -z-10 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[120px]" />

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

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Link
          to="/diagnose"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition hover:scale-[1.02] hover:bg-primary/90"
        >
          빠른진단 <span aria-hidden>→</span>
        </Link>
        <button
          onClick={handlePreciseDiagnose}
          className="inline-flex items-center gap-2 rounded-xl border-2 border-primary px-8 py-4 text-lg font-semibold text-primary transition hover:scale-[1.02] hover:bg-primary/10"
        >
          정밀진단 <span aria-hidden className="text-sm opacity-70">(AI 상담)</span>
        </button>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        설치 없음 · 무료 · 정밀진단은 로그인 필요
      </p>
    </main>
  );
}
