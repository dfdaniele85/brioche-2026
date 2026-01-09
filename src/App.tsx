import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, Link, useLocation } from "react-router-dom";
import { supabase } from "./lib/supabase";

import Login from "./pages/Login";
import Months from "./pages/Months";
import MonthView from "./pages/MonthView";
import Summary from "./pages/Summary";
import Settings from "./pages/Settings";
import StaffToday from "./pages/StaffToday";

const APP_VERSION = "v1.7.6";

function TopNav({ isAuthed }: { isAuthed: boolean }) {
  const loc = useLocation();
  if (!isAuthed) return null;

  const isActive = (path: string) => (loc.pathname.startsWith(path) ? "navBtn navBtnActive" : "navBtn");

  return (
    <div className="topbar">
      <div className="brand">
        <strong>Brioche 2026</strong>
        <span className="pill">{APP_VERSION}</span>
      </div>

      <div className="nav">
        <Link className={isActive("/mesi")} to="/mesi">
          Mesi
        </Link>
        <Link className={isActive("/oggi")} to="/oggi">
          Oggi
        </Link>
        <Link className={isActive("/riepilogo")} to="/riepilogo">
          Riepilogo
        </Link>
        <Link className={isActive("/impostazioni")} to="/impostazioni">
          Impostazioni
        </Link>
        <button
          className="navBtn"
          type="button"
          onClick={async () => {
            await supabase.auth.signOut();
          }}
        >
          Esci
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const isAuthed = useMemo(() => !!userId, [userId]);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      setLoading(true);
      setBootError(null);

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!mounted) return;
        setUserId(data.session?.user?.id ?? null);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setBootError("Errore inizializzazione (controlla Supabase env)");
        setUserId(null);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ fontWeight: 800, fontSize: 18 }}>Caricamento…</div>
          <div className="muted">{APP_VERSION}</div>
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ fontWeight: 900 }}>Errore</div>
          <div className="muted" style={{ marginTop: 6 }}>
            {bootError}
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            {APP_VERSION}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <TopNav isAuthed={isAuthed} />

      <Routes>
        <Route path="/login" element={isAuthed ? <Navigate to="/mesi" replace /> : <Login />} />

        <Route path="/mesi" element={isAuthed ? <Months /> : <Navigate to="/login" replace />} />
        <Route path="/mese/:month" element={isAuthed ? <MonthView /> : <Navigate to="/login" replace />} />

        <Route path="/oggi" element={isAuthed ? <StaffToday /> : <Navigate to="/login" replace />} />

        <Route path="/riepilogo" element={isAuthed ? <Summary /> : <Navigate to="/login" replace />} />

        <Route path="/impostazioni" element={isAuthed ? <Settings /> : <Navigate to="/login" replace />} />

        <Route path="/" element={<Navigate to={isAuthed ? "/mesi" : "/login"} replace />} />
        <Route path="*" element={<Navigate to={isAuthed ? "/mesi" : "/login"} replace />} />
      </Routes>
    </>
  );
}
