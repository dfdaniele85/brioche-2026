import { useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import "dayjs/locale/it";

import Login from "./pages/Login";
import Months from "./pages/Months";
import MonthView from "./pages/MonthView";
import StaffToday from "./pages/StaffToday";
import Summary from "./pages/Summary";
import Settings from "./pages/Settings";
import { APP_VERSION } from "./lib/version";

// 👇 lingua italiana globale
dayjs.locale("it");

function isAuthed(): boolean {
  return localStorage.getItem("brioche_auth") === "ok";
}

export default function App() {
  const nav = useNavigate();
  const loc = useLocation();

  const [authed, setAuthed] = useState(isAuthed());

  const current = useMemo(() => {
    const p = loc.pathname;
    if (p.startsWith("/mesi/")) return "Mesi";
    if (p === "/mesi") return "Mesi";
    if (p === "/oggi") return "Oggi";
    if (p === "/riepilogo") return "Riepilogo";
    if (p === "/impostazioni") return "Impostazioni";
    return "";
  }, [loc.pathname]);

  const go = (path: string) => nav(path);

  const logout = () => {
    localStorage.removeItem("brioche_auth");
    setAuthed(false);
    nav("/login");
  };

  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={() => setAuthed(true)} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div>
      <div className="topbar">
        <div className="topbarInner">
          <div className="brand">
            <div className="brandTitle">Brioche 2026</div>
            <div className="brandVersion">v{APP_VERSION}</div>
          </div>

          <div className="nav">
            <button
              className={`chip ${current === "Mesi" ? "chipActive" : ""}`}
              type="button"
              onClick={() => go("/mesi")}
            >
              Mesi
            </button>

            <button
              className={`chip ${current === "Oggi" ? "chipActive" : ""}`}
              type="button"
              onClick={() => go("/oggi")}
            >
              Oggi
            </button>

            <button
              className={`chip ${current === "Riepilogo" ? "chipActive" : ""}`}
              type="button"
              onClick={() => go("/riepilogo")}
            >
              Riepilogo
            </button>

            <button
              className={`chip ${current === "Impostazioni" ? "chipActive" : ""}`}
              type="button"
              onClick={() => go("/impostazioni")}
            >
              Impostazioni
            </button>

            <button className="chip chipDanger" type="button" onClick={logout}>
              Esci
            </button>
          </div>
        </div>
      </div>

      <Routes>
        <Route path="/" element={<Navigate to="/mesi" replace />} />
        <Route path="/mesi" element={<Months />} />
        <Route path="/mesi/:month" element={<MonthView />} />
        <Route path="/oggi" element={<StaffToday />} />
        <Route path="/riepilogo" element={<Summary />} />
        <Route path="/impostazioni" element={<Settings />} />
        <Route path="*" element={<Navigate to="/mesi" replace />} />
      </Routes>
    </div>
  );
}
