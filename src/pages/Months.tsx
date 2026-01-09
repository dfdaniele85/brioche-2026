import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";

export default function Months() {
  const nav = useNavigate();

  const months = Array.from({ length: 12 }).map((_, i) => {
    const name = dayjs(new Date(2026, i, 1)).format("MMMM");
    return { i, name };
  });

  return (
    <div className="fiuriContainer">
      <h1 className="fiuriTitle">Mesi 2026</h1>
      <div style={{ height: 12 }} />
      {months.map((m) => (
        <div
          key={m.i}
          className="monthCard"
          onClick={() => nav(`/mesi/${m.i + 1}`)}
        >
          <div>
            <div style={{ fontSize: 30, fontWeight: 900, textTransform: "capitalize" }}>
              {m.name}
            </div>
            <div className="muted" style={{ fontWeight: 900 }}>
              Apri giorni del mese
            </div>
          </div>
          <div className="monthArrow">→</div>
        </div>
      ))}
    </div>
  );
}
