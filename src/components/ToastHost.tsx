import { useEffect, useState } from "react";
import { subscribeToToasts } from "../lib/toast";
import type { ToastItem } from "../lib/toast";

type Kind = ToastItem["kind"];

function stylesFor(kind: Kind) {
  if (kind === "success") {
    return { bg: "rgba(16,185,129,0.14)", br: "rgba(16,185,129,0.28)", tx: "#065f46" };
  }
  if (kind === "error") {
    return { bg: "rgba(239,68,68,0.14)", br: "rgba(239,68,68,0.28)", tx: "#991b1b" };
  }
  if (kind === "warning") {
    return { bg: "rgba(245,158,11,0.14)", br: "rgba(245,158,11,0.28)", tx: "#92400e" };
  }
  return { bg: "rgba(59,130,246,0.14)", br: "rgba(59,130,246,0.28)", tx: "#1e40af" };
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const unsub = subscribeToToasts(setItems);
    return () => unsub();
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 72,
        right: 14,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 360,
      }}
    >
      {items.map((t) => {
        const s = stylesFor(t.kind);
        return (
          <div
            key={t.id}
            style={{
              background: s.bg,
              border: `1px solid ${s.br}`,
              color: s.tx,
              borderRadius: 14,
              padding: "10px 12px",
              fontWeight: 900,
              fontSize: 13,
              boxShadow: "0 10px 26px rgba(17,24,39,0.10)",
              backdropFilter: "blur(10px)",
            }}
          >
            {t.message}
          </div>
        );
      })}
    </div>
  );
}
