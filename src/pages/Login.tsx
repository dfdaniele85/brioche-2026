import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isAuthed, loginWithPin } from "../lib/storage";

type LocationState = {
  from?: string;
};

export default function Login(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (isAuthed()) {
      navigate("/today", { replace: true });
    }
  }, [navigate]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const ok = loginWithPin(pin);
    if (!ok) {
      setError("PIN non valido");
      return;
    }

    const target = state.from && typeof state.from === "string" ? state.from : "/today";
    navigate(target, { replace: true });
  }

  return (
    <div className="container">
      <div className="stack" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="cardInner">
            <div className="title">Brioche 2026</div>
            <div className="subtle">Accedi con PIN</div>

            <form onSubmit={onSubmit} className="stack" style={{ marginTop: 14 }}>
              <label className="srOnly" htmlFor="pin">
                PIN
              </label>
              <input
                id="pin"
                className="input"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Inserisci PIN"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  if (error) setError(null);
                }}
              />

              {error ? (
                <div className="pill pillErr" role="alert">
                  {error}
                </div>
              ) : (
                <div className="subtle">Suggerimento (demo): PIN predefinito 2026</div>
              )}

              <button type="submit" className="btn btnPrimary">
                Entra
              </button>
            </form>
          </div>
        </div>

        <div className="subtle">
          Nota: per la demo il PIN è gestito localmente (no account). Lo renderemo modificabile in Impostazioni.
        </div>
      </div>
    </div>
  );
}
