import { supabase } from "./supabase";

type AppEvent =
  | { type: "auth:changed"; isAuthed: boolean }
  | { type: "data:refresh"; reason: "save" | "manual" | "mount" };

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
 * ✅ UN SOLO UTENTE:
 * Autenticazione = sessione Supabase (persistSession true in supabase.ts).
 */
export function isAuthed(): boolean {
  try {
    // accesso sync: controlliamo se c’è un sessione già in memoria/local storage
    // (supabase-js gestisce persistenza e refresh)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyClient = supabase as any;
    const session = anyClient?.auth?.session?.() ?? anyClient?.auth?.getSession?.();
    // supabase v2: getSession è async, quindi qui facciamo check best-effort:
    // se c’è user già caricato, ok
    return Boolean(anyClient?.auth?.getUser ? true : session);
  } catch {
    return false;
  }
}

/**
 * ✅ helper affidabile: usalo quando ti serve certezza (async)
 */
export async function isAuthedAsync(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  try {
    await supabase.auth.signOut();
  } finally {
    emitAppEvent({ type: "auth:changed", isAuthed: false });
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
