import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";

export const Route = createFileRoute("/diagnose")({
  head: () => ({
    meta: [
      { title: "PC 진단 — PCFixer" },
      {
        name: "description",
        content: "dxdiag.txt 파일을 업로드하여 PC 병목을 진단받으세요.",
      },
    ],
  }),
  component: Diagnose,
});

function Diagnose() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSelectFile = useCallback((f: File | null | undefined) => {
    if (f) setFile(f);
  }, []);

  const startDiagnose = () => {
    if (!file) return;
    setLoading(true);
    setTimeout(() => navigate({ to: "/result" }), 1500);
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10 flex items-center gap-4">
        <Link
          to="/"
          className="rounded-lg border border-border bg-card/50 px-3 py-2 text-sm text-muted-foreground transition hover:bg-card hover:text-foreground"
        >
          ← 뒤로
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">PC 진단</h1>
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Upload */}
        <section>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onSelectFile(e.dataTransfer.files?.[0]);
            }}
            className={`group flex h-80 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition ${
              dragOver
                ? "border-primary bg-primary/10"
                : "border-border bg-card/40 hover:border-primary/60 hover:bg-card/70"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".txt"
              hidden
              onChange={(e) => onSelectFile(e.target.files?.[0])}
            />
            <UploadIcon />
            {file ? (
              <>
                <p className="mt-4 text-lg font-semibold text-foreground">
                  {file.name}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  파일이 준비되었습니다
                </p>
              </>
            ) : (
              <>
                <p className="mt-4 text-lg font-semibold text-foreground">
                  dxdiag.txt 파일을 여기에 끌어다 놓으세요
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  또는 클릭하여 파일 선택
                </p>
              </>
            )}
          </div>

          <button
            disabled={!file || loading}
            onClick={startDiagnose}
            className="mt-6 w-full rounded-xl bg-primary px-6 py-4 text-base font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                진단 중...
              </span>
            ) : (
              "진단 시작하기"
            )}
          </button>
        </section>

        {/* Instructions */}
        <section className="rounded-2xl border border-border bg-card/40 p-8">
          <h2 className="text-xl font-bold tracking-tight">
            dxdiag 파일 추출 방법
          </h2>
          <ol className="mt-6 space-y-5">
            {[
              "윈도우 키 + R 키를 누릅니다",
              "실행 창에 dxdiag 를 입력하고 확인을 클릭합니다",
              "DirectX 진단 도구가 열리면 모든 정보 저장 버튼을 클릭합니다",
              "저장된 .txt 파일을 왼쪽 영역에 업로드합니다",
            ].map((step, i) => (
              <li key={i} className="flex gap-4">
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                  {i + 1}
                </span>
                <p className="pt-1 text-sm leading-relaxed text-muted-foreground">
                  {step}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}

function UploadIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className="text-primary"
    >
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
    </svg>
  );
}
