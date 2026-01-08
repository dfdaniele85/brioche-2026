import { Link } from "react-router-dom";

const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export default function Months() {
  return (
    <div className="container">
      <div className="row space">
        <h2 style={{ margin: 0 }}>Mesi 2026</h2>
        <span className="badge">Seleziona un mese</span>
      </div>

      <div style={{ height: 12 }} />

      <div className="grid2">
        {MONTHS.map((m, idx) => (
          <Link key={m} to={`/mese/${idx + 1}`} className="card">
            <div className="row space">
              <strong>{m}</strong>
              <span className="muted">→</span>
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Apri giorni del mese
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
