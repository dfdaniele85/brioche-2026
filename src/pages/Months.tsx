import { Link } from "react-router-dom";

const MONTHS = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

export default function Months() {
  return (
    <div className="page">
      <h1 className="page-title">Mesi 2026</h1>

      <div className="months-list">
        {MONTHS.map((m, i) => (
          <Link
            key={m}
            to={`/month/${i + 1}`}
            className="month-card"
          >
            <div>
              <div className="month-name">{m}</div>
              <div className="month-sub">Apri giorni del mese</div>
            </div>

            <div className="month-arrow">→</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
