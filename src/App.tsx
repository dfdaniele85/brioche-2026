import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";

import Login from "./pages/Login";
import Months from "./pages/Months";
import MonthView from "./pages/MonthView";
import Summary from "./pages/Summary";
import Settings from "./pages/Settings";
import StaffToday from "./pages/StaffToday";

type Role = "user" | "admin";

const APP_VERSION = "1.7.4";

function useAuth() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("user");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        setError(null);

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError) throw sessionError;

        const uid = sessionData.session?.user?.id ?? null;
        if (!mounted) return;

        setUserId(uid);

        if (!uid) {
          setRole("user");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .single();

        if (profileError) throw profileError;

        setRole((profile?.role as Role) ?? "user");
      } catch (e) {
        console.error("AUTH ERROR", e);
        setUserId(null);
        setRole("user");
        setError("Errore di autenticazione");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const uid = session?.user?.id ?? null;
        setUserId(uid);

        if (!uid) {
          setRole("user");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .single();

        setRole((profile?.role as Role) ?? "user");
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { loading, userId, role, error };
}

function Nav({ role }: { role: Role }) {
  const navigate = useNavigate();

  return (
    <div className="nav">
      <div className="navInner">
        <div className="brand">
          <span className="brandDot" />
          <span>Brioche 2026</span>
          <span className="rolePill">{role}</span>
        </div>

        <div className="navRight">
          <Link className="btn" to="/mesi">Mesi</Link>
          <Link className="btn" to="/oggi">Oggi</Link>
          <Link className="btn" to="/riepilogo">Riepilogo</Link>

          {role === "admin" && (
            <Link className="btn" to="/impostazioni">Impostazioni</Link>
          )}

          <span className="badge">v{APP_VERSION}</span>

          <button
            className="btn btnPrimary"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate("/login", { replace: true });
            }}
          >
            Esci
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { loading, userId, role, error } = useAuth();
  const isAuthed = useMemo(() => !!userId, [userId]);

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          Caricamento…
          <div className="muted">v{APP_VERSION}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="card">
          <strong>Errore</strong>
          <div className="muted">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {isAuthed && <Nav role={role} />}

      <Routes>
        <Route
          path="/login"
          element={!isAuthed ? <Login /> : <Navigate to="/mesi" replace />}
        />

        <Route
          path="/mesi"
          element={isAuthed ? <Months /> : <Navigate to="/login" replace />}
        />

        <Route
          path="/mese/:month"
          element={isAuthed ? <MonthView /> : <Navigate to="/login" replace />}
        />

        <Route
          path="/oggi"
          element={isAuthed ? <StaffToday /> : <Navigate to="/login" replace />}
        />

        <Route
          path="/riepilogo"
          element={isAuthed ? <Summary /> : <Navigate to="/login" replace />}
        />

        <Route
          path="/impostazioni"
          element={
            isAuthed && role === "admin"
              ? <Settings />
              : <Navigate to="/mesi" replace />
          }
        />

        <Route
          path="*"
          element={<Navigate to={isAuthed ? "/mesi" : "/login"} replace />}
        />
      </Routes>
    </>
  );
}
