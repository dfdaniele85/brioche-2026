type AppEvent =
  | { type: "auth:changed"; isAuthed: boolean }
  | { type: "data:refresh"; reason: "save" | "manual" | "mount" };

const AUTH_KEY = "brioche2026:authed";
const PIN_KEY = "brioche2026:pin"; // opzionale: per cambiare pin in futuro
const DEFAULT_PIN = "2026"; // Assunzione: pin demo. Lo renderemo configurabile in Settings se vuoi.

const BC_NAME = "brioche2026";
let bc: BroadcastChannel | null = null;

function getBroadcast(): BroadcastChannel | null {
  try {
    if (!("BroadcastChannel" in window)) return null;
    if (!bc) bc = new BroadcastChannel(BC_NAME);
    return bc;
  } catch {
    return null;
  }
}

function emitLocal(event: AppEvent): void {
  window.dispatchEvent(new CustomEvent<AppEvent>("brioche2026:event", { detail: event }));
}

export function emitAppEvent(event: AppEvent): void {
  emitLocal(event);
  const channel = getBroadcast();
  channel?.postMessage(event);
}

export function onAppEvent(handler: (event: AppEvent) => void): () => void {
  const onLocal = (e: Event) => {
    const ce = e as CustomEvent<AppEvent>;
    if (!ce.detail) return;
    handler(ce.detail);
  };
  window.addEventListener("brioche2026:event", onLocal);

  const channel = getBroadcast();
  const onBC = (msg: MessageEvent) => {
    const data = msg.data as AppEvent | undefined;
    if (!data) return;
    handler(data);
  };
  channel?.addEventListener("message", onBC);

  return () => {
    window.removeEventListener("brioche2026:event", onLocal);
    channel?.removeEventListener("message", onBC);
  };
}

/**
 * AUTH (PIN semplice) — demo.
 * Non usiamo Supabase Auth, per restare coerenti col requisito.
 */
export function isAuthed(): boolean {
  return localStorage.getItem(AUTH_KEY) === "1";
}

export function getPin(): string {
  return localStorage.getItem(PIN_KEY) ?? DEFAULT_PIN;
}

export function setPin(pin: string): void {
  localStorage.setItem(PIN_KEY, pin);
}

export function loginWithPin(pinAttempt: string): boolean {
  const pin = getPin();
  const ok = pinAttempt.trim() === pin;
  if (ok) {
    localStorage.setItem(AUTH_KEY, "1");
    emitAppEvent({ type: "auth:changed", isAuthed: true });
  }
  return ok;
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
  emitAppEvent({ type: "auth:changed", isAuthed: false });
}

/**
 * Helper refresh dati: usalo dopo save e on mount.
 */
export function requestDataRefresh(reason: "save" | "manual" | "mount"): void {
  emitAppEvent({ type: "data:refresh", reason });
}

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function saveStateLabel(state: SaveState): string {
  switch (state) {
    case "idle":
      return "—";
    case "dirty":
      return "Non salvato";
    case "saving":
      return "Salvataggio…";
    case "saved":
      return "Salvato";
    case "error":
      return "Errore";
  }
}
