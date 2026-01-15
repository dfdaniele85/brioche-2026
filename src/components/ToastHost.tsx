import React from "react";

export type Toast = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

let pushToastFn: ((t: Omit<Toast, "id">) => void) | null = null;

/**
 * API globale minimale per mostrare un toast
 */
export function showToast(toast: Omit<Toast, "id">): void {
  pushToastFn?.(toast);
}

export default function ToastHost(): JSX.Element {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const idRef = React.useRef(1);

  React.useEffect(() => {
    pushToastFn = (t) => {
      const id = idRef.current++;
      const toast: Toast = { id, durationMs: 2200, ...t };
      setToasts((prev) => [...prev, toast]);

      const timeout = setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== id));
      }, toast.durationMs);

      return () => clearTimeout(timeout);
    };

    return () => {
      pushToastFn = null;
    };
  }, []);

  if (toasts.length === 0) return <></>;

  return (
    <div className="toastHost" aria-live="polite" aria-atomic="true">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <div className="toastMsg">{t.message}</div>
          {t.actionLabel && t.onAction ? (
            <button
              type="button"
              className="toastBtn"
              onClick={() => {
                t.onAction?.();
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
              }}
            >
              {t.actionLabel}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
