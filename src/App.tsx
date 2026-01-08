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

const APP_VERSION = "1.7.1";

function useAuth() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("user");
  const [fatal, setFatal] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchRole(uid: string) {
      const pr = await supabase.from("profiles").select("role").eq("id", uid).single();
      const r = (pr.data?.role ?? "user") as Role;
      return r;
    }

    async function load() {
      try {
        setFatal(null);

        const { data, error } = await supabase.auth.getSession();
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
      } catch (e: any) {
        console.error("AUTH LOAD ERROR:", e);
        if (!mounted) return;
        setFatal(e?.message ?? String(e));
        setUserId(null);
        setRole("user");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

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
      } catch (e: any) {
        console.error("AUTH CHANGE ERROR:", e);
        setFatal(e?.message ?? String(e));
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
    <div className="topbar">
      <div className="topbarLeft">
        <div className="brand">Brioche 2026</div>
        <span className="pill">{role}</span>
      </div>

      <div className="topbarRight">
        <Link className="navLink" to="/mesi">Mesi</Link>
        <Link className="navLink" to="/riepilogo">Riepilogo</Link>
        {role === "admin" ? <Link className="navLink" to="/impostazioni">Impostazioni</Link> : null}

        <span className="versionBadge">v{APP_VERSION}</span>

        <button
          className="navBtn"
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
  );
}

export default function App() {
  const { loading, userId, role, fatal } = useAuth();
  const isAuthed = useMemo(() => !!userId, [userId]);

  if (loading) {
    return (
      <div className="container">
        <div className="card">Caricamento…</div>
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="container">
        <div className="card">
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Errore login</div>
          <div style={{ opacity: 0.8, marginBottom: 12 }}>{fatal}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            (Quasi sempre è ENV su Vercel: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY mancanti o sbagliate)
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
            isAuthed
              ? role === "admin"
                ? <Settings />
                : <Navigate to="/mesi" replace />
              : <Navigate to="/login" replace />
          }
        />

        <Route path="*" element={<Navigate to={isAuthed ? "/mesi" : "/login"} replace />} />
      </Routes>
    </>
  );
}
