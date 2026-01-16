import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type LocationState = {
  from?: string;
};

export default function Login(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data } = await supabase.auth.getSession();
      if (!cancelled && data.session) {
        navigate("/today", { replace: true });
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) throw error;
      if (!data.session) throw new Error("Sessione non creata");

      const target = state.from && typeof state.from === "string" ? state.from : "/today";
      navigate(target, { replace: true });
    } catch (e) {
      console.error(e);
      setError("Credenziali non valide o login non abilitato in Supabase.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="stack" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="cardInner">
            <div className="title">Brioche 2026</div>
            <div className="subtle">Accedi</div>

            <form onSubmit={onSubmit} className="stack" style={{ marginTop: 14 }}>
              <label className="srOnly" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                inputMode="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
              />

              <label className="srOnly" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                className="input"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
              />

              {error ? (
                <div className="pill pillErr" role="alert">
                  {error}
                </div>
              ) : (
                <div className="subtle">Usa l’utente creato in Supabase → Authentication → Users</div>
              )}

              <button type="submit" className="btn btnPrimary" disabled={loading}>
                {loading ? "Accesso…" : "Entra"}
              </button>
            </form>
          </div>
        </div>

        <div className="subtle">
          Nota: ora l’accesso è gestito da Supabase Auth (sessione condivisa su tutti i dispositivi).
        </div>
      </div>
    </div>
  );
}
