import type { SaveStatus } from "../lib/useSaveStatus";

type Props = {
  status: SaveStatus;
};

export default function SaveStatusBadge({ status }: Props) {
  if (status === "idle") return null;

  const map: Record<SaveStatus, { text: string; color: string }> = {
    idle: { text: "", color: "" },
    dirty: { text: "Modifiche non salvate", color: "#f59e0b" },
    saving: { text: "Salvataggio…", color: "#3b82f6" },
    saved: { text: "Salvato ✓", color: "#10b981" },
    error: { text: "Errore salvataggio", color: "#ef4444" },
  };

  const { text, color } = map[status];

  return (
    <div
      style={{
        fontSize: 12,
        color,
        marginLeft: 8,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}
