const STORAGE_KEY = "pcfixer_sid";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "sid-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function clearSessionId(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing?.trim()) return existing.trim();
  const id = uuid();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}
