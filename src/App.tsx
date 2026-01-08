import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import StaffToday from "./pages/StaffToday";


import Login from "./pages/Login";
import Months from "./pages/Months";
import MonthView from "./pages/MonthView";
import Summary from "./pages/Summary";
import Settings from "./pages/Settings";

export default function App() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setUserId(data.session?.user.id ?? null);
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="container">
        <div className="card">Caricamento...</div>
      </div>
    );
  }

  return (
    <div>
      {userId && (
        <div className="nav">
          <Link className="btn" to="/mesi">Mesi</Link>
          <Link className="btn" to="/riepilogo">Riepilogo</Link>
          <Link className="btn" to="/impostazioni">Impostazioni</Link>
          <Link className="btn" to="/oggi">Oggi</Link>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
            }}
          >
            Esci
          </button>
        </div>
      )}

      <Routes>
        <Route
          path="/login"
          element={userId ? <Navigate to="/mesi" replace /> : <Login />}
        />
        <Route
          path="/mesi"
          element={userId ? <Months /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/mese/:month"
          element={userId ? <MonthView /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/riepilogo"
          element={userId ? <Summary /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/impostazioni"
          element={userId ? <Settings /> : <Navigate to="/login" replace />}
        />
        <Route
          path="*"
          element={<Navigate to={userId ? "/mesi" : "/login"} replace />}
        />
        <Route path="/oggi" element={userId ? <StaffToday /> : <Navigate to="/login" />} />
      </Routes>
    </div>
  );
}
