export type ToastKind = "success" | "error" | "info" | "warning";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  createdAt: number;
};

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(items);
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function push(kind: ToastKind, message: string, ttlMs = 2600) {
  const id = uid();
  const it: ToastItem = { id, kind, message, createdAt: Date.now() };
  items = [...items, it];
  emit();

  window.setTimeout(() => {
    items = items.filter((x) => x.id !== id);
    emit();
  }, ttlMs);
}

export const toast = {
  success: (m: string) => push("success", m),
  error: (m: string) => push("error", m, 3600),
  info: (m: string) => push("info", m),
  warning: (m: string) => push("warning", m, 3200),
};

export function subscribeToToasts(listener: Listener) {
  listeners.add(listener);
  listener(items);
  return () => {
    listeners.delete(listener);
  };
}
