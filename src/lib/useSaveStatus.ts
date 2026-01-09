import { useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export function useSaveStatus() {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<number | null>(null);

  const markDirty = () => {
    if (status !== "saving") {
      setStatus("dirty");
    }
  };

  const markSaving = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus("saving");
  };

  const markSaved = () => {
    setStatus("saved");
    timerRef.current = window.setTimeout(() => {
      setStatus("idle");
    }, 1500);
  };

  const markError = () => {
    setStatus("error");
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    status,
    markDirty,
    markSaving,
    markSaved,
    markError,
  };
}
