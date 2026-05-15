// Browser-side anonymous session ID via cookie.
const COOKIE_NAME = "pcfixer_sid";

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "sid-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getSessionId(): string {
  if (typeof document === "undefined") return "";
  const prefix = `${COOKIE_NAME}=`;
  const match = document.cookie.split("; ").find((c) => c.startsWith(prefix));
  if (match) {
    const raw = match.slice(prefix.length);
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded.trim()) return decoded.trim();
    } catch {
      /* malformed cookie — fall through and reissue */
    }
  }

  const id = uuid();
  // 1 year
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  return id;
}
