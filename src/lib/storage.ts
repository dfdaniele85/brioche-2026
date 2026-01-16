import { supabase } from "./supabase";

type AppEvent =
  | { type: "auth:changed"; isAuthed: boolean }
  | { type: "data:refresh"; reason: "save" | "manual" | "mount" };

const AUTH_KEY = "brioche2026:authed";
const PIN_KEY = "brioche2026:pin";
const DEFAULT_PIN = "2026";

const BC_NAME = "brioche2026";
let bc: BroadcastChannel | null = null;

function getBroadcast(): BroadcastChannel | null {
  try {
    if (typeof window === "undefined") return null;
    if (!("BroadcastChannel" in window)) return null;
    if (!bc) bc = new BroadcastChannel(BC_NAME);
    return bc;
  } catch {
    return null;
  }
}

function emitLocal(event: AppEvent): void {
  if (typeof window === "undefined") return;
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
 * AUTH (PIN demo) — usa local flag per route protection.
 * (Supabase Auth serve per salvataggi cross-device; qui teniamo compatibilità demo.)
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

/**
 * ✅ FIX: logout deve SEMPRE togliere AUTH_KEY, altrimenti AuthedRoute ti rimanda su /today.
 */
export async function logout(): Promise<void> {
  // 1) Chiudi subito l'accesso locale (route protection)
  localStorage.removeItem(AUTH_KEY);
  emitAppEvent({ type: "auth:changed", isAuthed: false });

  // 2) Chiudi anche la sessione Supabase (per sicurezza / multi-device)
  try {
    await supabase.auth.signOut();
  } catch (e) {
    // non bloccare UX se signOut fallisce
    // eslint-disable-next-line no-console
    console.warn("supabase.auth.signOut() failed:", e);
  }
}

/**
 * Helper refresh dati
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
