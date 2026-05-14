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
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (match) return decodeURIComponent(match.split("=")[1]);

  const id = uuid();
  // 1 year
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  return id;
}
