import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth";
import { supabase } from "@/integrations/supabase/client";
import { parseDxdiagSpecs, isDxdiagSpecsUsable } from "@/lib/dxdiag-parse";
import { sendPreciseDiagnosisMessage, type ChatMessage } from "@/lib/gemini";
import type { ParsedSpecs } from "@/lib/diagnosis-types";

export const Route = createFileRoute("/diagnose-pro")({
  head: () => ({
    meta: [
      { title: "정밀진단 — PCFixer" },
      { name: "description", content: "AI 상담사와 1:1 대화로 PC를 정밀 진단하세요." },
    ],
  }),
  component: DiagnosePro,
});

// ---------------------------------------------------------
// 타입
// ---------------------------------------------------------

/** UI 렌더링용 메시지 (Gemini API 타입과 분리) */
type DisplayMessage = {
  id: string;
  role: "user" | "model";
  text: string;
  fileName?: string;
  timestamp: Date;
};

type PendingFile = {
  name: string;
  mimeType: string;
  text?: string;    // .txt 파일 내용
  dataUrl?: string; // 이미지 미리보기
  base64?: string;  // Gemini inlineData용 raw base64
};

// ---------------------------------------------------------
// 컴포넌트
// ---------------------------------------------------------

function DiagnosePro() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [apiMessages, setApiMessages] = useState<ChatMessage[]>([]);
  const [parsedSpecs, setParsedSpecs] = useState<ParsedSpecs | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);
  const [inputText, setInputText] = useState("");
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [sending, setSending] = useState(false);
  const [initializing, setInitializing] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 비로그인 → /auth 리다이렉트
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth", search: { redirect: "/diagnose-pro" } });
    }
  }, [authLoading, user, navigate]);

  // 초기화: 기존 세션 복원 또는 새 세션 생성
  useEffect(() => {
    if (!user) return;

    const init = async () => {
      // 1. 기존 chat_session 조회 (가장 최근 것)
      const { data: existing } = await supabase
        .from("chat_sessions")
        .select("id, messages, diagnosis_id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing && Array.isArray(existing.messages) && existing.messages.length > 0) {
        // 기존 세션 복원
        type StoredMsg = { role: "user" | "model"; text: string; fileName?: string; timestamp: string };
        const stored = existing.messages as StoredMsg[];

        const restoredDisplay: DisplayMessage[] = stored.map((m) => ({
          id: crypto.randomUUID(),
          role: m.role,
          text: m.text,
          fileName: m.fileName,
          timestamp: new Date(m.timestamp),
        }));
        const restoredApi: ChatMessage[] = stored.map((m) => ({
          role: m.role,
          parts: [{ text: m.text }],
        }));

        setDisplayMessages(restoredDisplay);
        setApiMessages(restoredApi);
        setSessionId(existing.id);

        // diagnosis_id가 있으면 parsed_specs 복원
        if (existing.diagnosis_id) {
          setDiagnosisId(existing.diagnosis_id);
          const { data: diag } = await supabase
            .from("diagnoses")
            .select("parsed_specs")
            .eq("id", existing.diagnosis_id)
            .maybeSingle();
          if (diag?.parsed_specs) {
            const p = diag.parsed_specs as Record<string, unknown>;
            if (typeof p.CPU === "string" && typeof p.GPU === "string" && typeof p.RAM === "string") {
              setParsedSpecs({ CPU: p.CPU, GPU: p.GPU, RAM: p.RAM });
            }
          }
        }

        setInitializing(false);
        return;
      }

      // 2. 기존 세션 없음 → 새로 초기화
      const { data: latest } = await supabase
        .from("diagnoses")
        .select("id, parsed_specs")
        .eq("user_id", user.id)
        .not("parsed_specs", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let specs: ParsedSpecs | null = null;
      let latestDiagnosisId: string | null = null;

      if (latest?.parsed_specs) {
        const p = latest.parsed_specs as Record<string, unknown>;
        if (typeof p.CPU === "string" && typeof p.GPU === "string" && typeof p.RAM === "string") {
          specs = { CPU: p.CPU, GPU: p.GPU, RAM: p.RAM };
          latestDiagnosisId = latest.id;
        }
      }

      setParsedSpecs(specs);
      setDiagnosisId(latestDiagnosisId);

      const initText = specs
        ? `안녕하세요! 기존 사양 정보를 확인했어요. 정밀진단을 시작할게요!\n\n• CPU: ${specs.CPU}\n• GPU: ${specs.GPU}\n• RAM: ${specs.RAM}\n\n어떤 용도로 주로 사용하시나요? (예: 게임, 영상편집, 일반 업무 등) 그리고 업그레이드 예산은 어느 정도로 생각하고 계신가요?`
        : `안녕하세요! PCFixer AI 상담사입니다.\n\n정밀진단을 위해 먼저 dxdiag.txt 파일을 업로드해 주세요.\n\n📋 파일 생성 방법\n1. Windows 키 + R → dxdiag 입력 → 확인\n2. "모든 정보 저장" 클릭\n3. 저장된 .txt 파일을 아래 📎 버튼으로 첨부`;

      const initDisplay: DisplayMessage = {
        id: crypto.randomUUID(),
        role: "model",
        text: initText,
        timestamp: new Date(),
      };
      const initApi: ChatMessage = { role: "model", parts: [{ text: initText }] };

      setDisplayMessages([initDisplay]);
      setApiMessages([initApi]);

      const { data: session } = await supabase
        .from("chat_sessions")
        .insert({
          user_id: user.id,
          diagnosis_id: latestDiagnosisId,
          messages: [{ role: "model", text: initText, timestamp: new Date().toISOString() }],
        })
        .select("id")
        .single();

      if (session) setSessionId(session.id);

      setInitializing(false);
    };

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 새 메시지 시 스크롤 하단 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, sending]);

  // 파일 선택 처리
  const handleFileSelect = useCallback((file: File) => {
    if (file.type === "text/plain" || file.name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPendingFile({
          name: file.name,
          mimeType: "text/plain",
          text: e.target?.result as string,
        });
      };
      reader.readAsText(file);
    } else if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1] ?? "";
        setPendingFile({ name: file.name, mimeType: file.type, dataUrl, base64 });
      };
      reader.readAsDataURL(file);
    }
  }, []);

  // 메시지 전송
  const handleSend = useCallback(async () => {
    if ((!inputText.trim() && !pendingFile) || sending) return;
    setSending(true);

    const text = inputText.trim();
    const file = pendingFile;
    setInputText("");
    setPendingFile(null);

    try {
      // dxdiag 감지: .txt 파일 → 파싱 시도
      let currentSpecs = parsedSpecs;
      let currentDiagnosisId = diagnosisId;

      if (file?.mimeType === "text/plain" && file.text) {
        const parsed = parseDxdiagSpecs(file.text);
        if (isDxdiagSpecsUsable(parsed)) {
          currentSpecs = parsed;
          setParsedSpecs(parsed);

          const { data: newDiag } = await supabase
            .from("diagnoses")
            .insert({
              user_id: user!.id,
              session_id: null,
              diagnosis_type: "pro",
              parsed_specs: parsed,
              bottleneck_result: null,
            })
            .select("id")
            .single();

          if (newDiag) {
            currentDiagnosisId = newDiag.id;
            setDiagnosisId(newDiag.id);
            // chat_session에 diagnosis_id 업데이트
            if (sessionId) {
              supabase
                .from("chat_sessions")
                .update({ diagnosis_id: newDiag.id })
                .eq("id", sessionId)
                .then(() => {});
            }
          }
        }
      }

      // 유저 DisplayMessage 생성
      let displayText = text;
      if (file && !displayText) displayText = `[파일: ${file.name}]`;
      else if (file) displayText = `${text}\n[파일: ${file.name}]`;

      const userDisplay: DisplayMessage = {
        id: crypto.randomUUID(),
        role: "user",
        text: displayText,
        fileName: file?.name,
        timestamp: new Date(),
      };

      // 유저 API parts 생성
      const userParts: ChatMessage["parts"] = [];
      if (text) userParts.push({ text });
      if (file?.text) {
        userParts.push({ text: `\n\n[첨부 파일: ${file.name}]\n${file.text}` });
      }
      if (file?.base64) {
        userParts.push({ inlineData: { mimeType: file.mimeType, data: file.base64 } });
      }
      if (userParts.length === 0) userParts.push({ text: displayText });

      const userApi: ChatMessage = { role: "user", parts: userParts };

      const newDisplay = [...displayMessages, userDisplay];
      const newApi = [...apiMessages, userApi];
      setDisplayMessages(newDisplay);
      setApiMessages(newApi);

      // Gemini 호출
      const responseText = await sendPreciseDiagnosisMessage(newApi, currentSpecs);

      const modelDisplay: DisplayMessage = {
        id: crypto.randomUUID(),
        role: "model",
        text: responseText,
        timestamp: new Date(),
      };
      const modelApi: ChatMessage = { role: "model", parts: [{ text: responseText }] };

      const finalDisplay = [...newDisplay, modelDisplay];
      const finalApi = [...newApi, modelApi];
      setDisplayMessages(finalDisplay);
      setApiMessages(finalApi);

      // chat_sessions 메시지 업데이트
      if (sessionId) {
        const dbMessages = finalDisplay.map((m) => ({
          role: m.role,
          text: m.text,
          fileName: m.fileName,
          timestamp: m.timestamp.toISOString(),
        }));
        supabase
          .from("chat_sessions")
          .update({
            messages: dbMessages,
            updated_at: new Date().toISOString(),
            diagnosis_id: currentDiagnosisId,
          })
          .eq("id", sessionId)
          .then(() => {});
      }
    } catch (e) {
      const errText =
        e instanceof Error ? e.message : "오류가 발생했습니다. 다시 시도해 주세요.";
      setDisplayMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "model",
          text: `⚠️ ${errText}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [inputText, pendingFile, sending, parsedSpecs, diagnosisId, displayMessages, apiMessages, sessionId, user]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 로딩 / 비로그인 상태
  if (authLoading || (initializing && !!user)) {
    return (
      <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </main>
    );
  }
  if (!user) return null;

  const canSend = (inputText.trim().length > 0 || !!pendingFile) && !sending;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* 헤더 */}
      <header className="flex flex-none items-center gap-3 border-b border-border/60 px-6 py-3">
        <Link
          to="/"
          className="rounded-lg border border-border bg-card/50 px-3 py-2 text-sm text-muted-foreground transition hover:bg-card hover:text-foreground"
        >
          ← 홈으로
        </Link>
        <div className="min-w-0">
          <h1 className="text-base font-bold tracking-tight">정밀진단</h1>
          {parsedSpecs && (
            <p className="truncate text-xs text-muted-foreground">
              {parsedSpecs.CPU} · {parsedSpecs.GPU} · {parsedSpecs.RAM}
            </p>
          )}
        </div>
      </header>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {displayMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "model" && (
                <div className="mr-2 mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  AI
                </div>
              )}
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-card text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.fileName && msg.role === "user" && (
                  <p className="mt-1.5 text-xs opacity-70">📎 {msg.fileName}</p>
                )}
              </div>
            </div>
          ))}

          {/* 로딩 버블 */}
          {sending && (
            <div className="flex justify-start">
              <div className="mr-2 mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                AI
              </div>
              <div className="rounded-2xl border border-border bg-card px-4 py-3">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  분석 중...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* 입력 영역 */}
      <div className="flex-none border-t border-border/60 bg-background px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {/* 첨부 파일 미리보기 */}
          {pendingFile && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-card/50 px-3 py-2 text-sm">
              {pendingFile.dataUrl ? (
                <img
                  src={pendingFile.dataUrl}
                  alt={pendingFile.name}
                  className="h-8 w-8 flex-none rounded object-cover"
                />
              ) : (
                <span className="flex-none text-base">📄</span>
              )}
              <span className="min-w-0 flex-1 truncate text-foreground">{pendingFile.name}</span>
              <button
                onClick={() => setPendingFile(null)}
                className="flex-none text-muted-foreground transition hover:text-foreground"
              >
                ✕
              </button>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* 파일 첨부 버튼 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-none rounded-xl border border-border bg-card/50 p-2.5 text-muted-foreground transition hover:bg-card hover:text-foreground"
              title="파일 첨부 (.txt, 이미지)"
            >
              <PaperclipIcon />
            </button>

            {/* 텍스트 입력 */}
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요 (Enter 전송 / Shift+Enter 줄바꿈)"
              rows={1}
              className="flex-1 resize-none rounded-xl border border-input bg-card/40 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              style={{ maxHeight: "8rem", overflowY: "auto" }}
            />

            {/* 전송 버튼 */}
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="flex-none rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              전송
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}

function PaperclipIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
