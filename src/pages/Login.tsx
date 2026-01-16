import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { emitAppEvent } from "../lib/storage";

type LocationState = { from?: string };

export default function Login(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signErr) {
        setError("Credenziali non valide");
        return;
      }

      emitAppEvent({ type: "auth:changed", isAuthed: true });

      const target = state.from && typeof state.from === "string" ? state.from : "/today";
      navigate(target, { replace: true });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      setError("Errore login");
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
              <input
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

              <input
                className="input"
                type="password"
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
                <div className="subtle">Usa le credenziali Supabase (1 utente)</div>
              )}

              <button type="submit" className="btn btnPrimary" disabled={loading || !email || !password}>
                {loading ? "Accesso…" : "Entra"}
              </button>
            </form>
          </div>
        </div>

        <div className="subtle">Suggerimento: salva la password sul telefono per entrare più velocemente.</div>
      </div>
    </div>
  );
}
