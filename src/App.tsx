import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "./lib/supabase";

import Login from "./pages/Login";
import Months from "./pages/Months";
import MonthView from "./pages/MonthView";
import Summary from "./pages/Summary";
import Settings from "./pages/Settings";
import StaffToday from "./pages/StaffToday";

const APP_VERSION = "v1.7.6";

export default function App() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);

      supabase.auth.onAuthStateChange((_event, newSession) => {
        setSession(newSession ?? null);
      });

      setLoading(false);
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const onLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const showNav = !!userId;

  const brandTitle = useMemo(() => {
    return (
      <div className="brand">
        <div className="brandTitle">Brioche 2026</div>
        <div className="brandMeta">{APP_VERSION}</div>
      </div>
    );
  }, []);

  if (loading) {
    return (
      <div className="appShell">
        <div className="container">
          <div className="card">
            <div className="muted">Caricamento…</div>
            <div className="muted">{APP_VERSION}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="appShell">
      {showNav ? (
        <header className="topBar">
          <div className="topBarInner">
            {brandTitle}

            <nav className="topNav">
              <NavLink to="/mesi" className={({ isActive }) => (isActive ? "navBtn active" : "navBtn")}>
                Mesi
              </NavLink>

              <NavLink to="/oggi" className={({ isActive }) => (isActive ? "navBtn active" : "navBtn")}>
                Oggi
              </NavLink>

              <NavLink
                to="/riepilogo"
                className={({ isActive }) => (isActive ? "navBtn active" : "navBtn")}
              >
                Riepilogo
              </NavLink>

              <NavLink
                to="/impostazioni"
                className={({ isActive }) => (isActive ? "navBtn active" : "navBtn")}
              >
                Impostazioni
              </NavLink>

              <button className="navBtn danger" type="button" onClick={onLogout}>
                Esci
              </button>
            </nav>
          </div>
        </header>
      ) : null}

      <main className="appMain">
        <Routes>
          <Route path="/login" element={userId ? <Navigate to="/mesi" replace /> : <Login />} />
          <Route path="/" element={<Navigate to={userId ? "/mesi" : "/login"} replace />} />

          <Route path="/mesi" element={userId ? <Months /> : <Navigate to="/login" replace />} />
          <Route path="/mese/:month" element={userId ? <MonthView /> : <Navigate to="/login" replace />} />

          <Route path="/oggi" element={userId ? <StaffToday /> : <Navigate to="/login" replace />} />

          <Route path="/riepilogo" element={userId ? <Summary /> : <Navigate to="/login" replace />} />
          <Route path="/impostazioni" element={userId ? <Settings /> : <Navigate to="/login" replace />} />

          <Route path="*" element={<Navigate to={userId ? "/mesi" : "/login"} replace />} />
        </Routes>
      </main>
    </div>
  );
}
