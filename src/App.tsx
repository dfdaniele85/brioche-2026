// /src/App.tsx
import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";

import Login from "./pages/Login";
import Months from "./pages/Months";
import MonthView from "./pages/MonthView";
import StaffToday from "./pages/StaffToday";
import Summary from "./pages/Summary";
import Settings from "./pages/Settings";

const APP_VERSION = "v1.7.6";

export default function App() {
  const nav = useNavigate();
  const loc = useLocation();

  const [sessionChecked, setSessionChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setUserId(data.session?.user?.id ?? null);
      setSessionChecked(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setSessionChecked(true);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const active = useMemo(() => {
    const p = loc.pathname;
    if (p.startsWith("/mesi")) return "mesi";
    if (p.startsWith("/mese/")) return "mesi";
    if (p.startsWith("/oggi")) return "oggi";
    if (p.startsWith("/riepilogo")) return "riepilogo";
    if (p.startsWith("/impostazioni")) return "impostazioni";
    return "";
  }, [loc.pathname]);

  if (!sessionChecked) {
    return (
      <div className="page">
        <div className="card">
          <div className="muted">Caricamento...</div>
          <div className="muted">{APP_VERSION}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="topbar">
        <div className="brand">
          <div className="brandTitle">Brioche 2026</div>
          <div className="brandVersion">{APP_VERSION}</div>
        </div>

        {userId ? (
          <div className="nav">
            <button
              className={`navBtn ${active === "mesi" ? "navBtnActive" : ""}`}
              type="button"
              onClick={() => nav("/mesi")}
            >
              Mesi
            </button>
            <button
              className={`navBtn ${active === "oggi" ? "navBtnActive" : ""}`}
              type="button"
              onClick={() => nav("/oggi")}
            >
              Oggi
            </button>
            <button
              className={`navBtn ${active === "riepilogo" ? "navBtnActive" : ""}`}
              type="button"
              onClick={() => nav("/riepilogo")}
            >
              Riepilogo
            </button>
            <button
              className={`navBtn ${active === "impostazioni" ? "navBtnActive" : ""}`}
              type="button"
              onClick={() => nav("/impostazioni")}
            >
              Impostazioni
            </button>
            <button
              className="navBtn navBtnDanger"
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                nav("/login");
              }}
            >
              Esci
            </button>
          </div>
        ) : null}
      </div>

      <Routes>
        <Route path="/login" element={userId ? <Navigate to="/mesi" replace /> : <Login />} />

        <Route path="/" element={userId ? <Navigate to="/mesi" replace /> : <Navigate to="/login" replace />} />

        <Route path="/mesi" element={userId ? <Months /> : <Navigate to="/login" replace />} />
        <Route path="/mese/:month" element={userId ? <MonthView /> : <Navigate to="/login" replace />} />

        <Route path="/oggi" element={userId ? <StaffToday /> : <Navigate to="/login" replace />} />
        <Route path="/riepilogo" element={userId ? <Summary /> : <Navigate to="/login" replace />} />
        <Route path="/impostazioni" element={userId ? <Settings /> : <Navigate to="/login" replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
