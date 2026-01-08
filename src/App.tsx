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

const APP_VERSION = "1.7.3";

function timeout(ms: number, label: string) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`TIMEOUT: ${label} (${ms}ms)`)), ms);
  });
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([p, timeout(ms, label)]);
}

function useAuth() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("user");
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchRole = async (uid: string): Promise<Role> => {
      const { data, error } = await withTimeout(
        supabase.from("profiles").select("role").eq("id", uid).single(),
        8000,
        "profiles.role"
      );

      if (error) throw error;
      return ((data?.role as Role) ?? "user");
    };

    const load = async () => {
      try {
        setFatal(null);
        const { data, error } = await withTimeout(supabase.auth.getSession(), 8000, "auth.getSession");
        if (error) throw error;

        const uid = data.session?.user?.id ?? null;
        if (!mounted) return;

        setUserId(uid);

        if (!uid) {
          setRole("user");
          return;
        }

        const r = await fetchRole(uid);
        if (!mounted) return;
        setRole(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("AUTH ERROR:", e);
        if (!mounted) return;
        setFatal(msg);
        setUserId(null);
        setRole("user");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        setFatal(null);
        const uid = session?.user?.id ?? null;

        setUserId(uid);

        if (!uid) {
          setRole("user");
          return;
        }

        const r = await fetchRole(uid);
        setRole(r);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("AUTH CHANGE ERROR:", e);
        setFatal(msg);
        setUserId(null);
        setRole("user");
      } finally {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { loading, userId, role, fatal };
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
          {role === "admin" ? <Link className="btn" to="/impostazioni">Impostazioni</Link> : null}

          <span className="badge">v{APP_VERSION}</span>

          <button
            className="btn btnPrimary"
            type="button"
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
  const { loading, userId, role, fatal } = useAuth();
  const isAuthed = useMemo(() => !!userId, [userId]);

  if (loading) {
    return (
      <div className="container">
        <div className="card">Caricamento… <span className="muted">v{APP_VERSION}</span></div>
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Errore</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{fatal}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Controlla su Vercel le ENV: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {isAuthed ? <Nav role={role} /> : null}

      <Routes>
        <Route path="/login" element={!isAuthed ? <Login /> : <Navigate to="/mesi" replace />} />

        <Route path="/mesi" element={isAuthed ? <Months /> : <Navigate to="/login" replace />} />
        <Route path="/mese/:month" element={isAuthed ? <MonthView /> : <Navigate to="/login" replace />} />

        <Route path="/oggi" element={isAuthed ? <StaffToday /> : <Navigate to="/login" replace />} />

        <Route path="/riepilogo" element={isAuthed ? <Summary /> : <Navigate to="/login" replace />} />

        <Route
          path="/impostazioni"
          element={
            isAuthed ? (role === "admin" ? <Settings /> : <Navigate to="/mesi" replace />) : <Navigate to="/login" replace />
          }
        />

        <Route path="*" element={<Navigate to={isAuthed ? "/mesi" : "/login"} replace />} />
      </Routes>
    </>
  );
}
