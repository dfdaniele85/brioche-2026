import dayjs from "dayjs";
import "dayjs/locale/it";
import { Link } from "react-router-dom";

dayjs.locale("it");

export default function Months() {
  const months = Array.from({ length: 12 }, (_, i) => i);

  return (
    <div className="container">
      <h1 style={{ marginBottom: 12 }}>Mesi 2026</h1>

      <div className="grid2">
        {months.map((m) => {
          const label = dayjs(new Date(2026, m, 1)).format("MMMM");
          return (
            <Link key={m} to={`/mese/${m + 1}`} className="card cardLink">
              <div className="row space">
                <div>
                  <div style={{ fontWeight: 800, fontSize: 22, textTransform: "capitalize" }}>
                    {label}
                  </div>
                  <div className="muted">Apri giorni del mese</div>
                </div>
                <div style={{ fontSize: 22 }}>→</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
