import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/callback")({
  component: OAuthCallback,
});

function OAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let done = false;

    const go = (to: "/" | "/auth") => {
      if (done) return;
      done = true;
      navigate({ to });
    };

    // Supabase가 URL의 ?code= 를 자동으로 교환한다 (detectSessionInUrl 기본값 true).
    // SIGNED_IN 이벤트가 오면 메인으로 이동.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) go("/");
    });

    // 이미 세션이 있는 경우 (이벤트가 먼저 발생했을 때 대비)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go("/");
    });

    // 5초 내 세션이 없으면 로그인 페이지로 fallback
    const timer = setTimeout(() => go("/auth"), 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [navigate]);

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        로그인 처리 중...
      </div>
    </main>
  );
}
