import React from "react";
import Topbar from "../components/Topbar";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { showToast } from "../components/ToastHost";

type LocationState = {
  from?: string;
};

type LoadState = "loading" | "ready";

export default function Login(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LocationState;

  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [email, setEmail] = React.useState<string>("");
  const [password, setPassword] = React.useState<string>("");
  const [busy, setBusy] = React.useState<boolean>(false);

  React.useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session) {
        const target = state.from && typeof state.from === "string" ? state.from : "/today";
        navigate(target, { replace: true });
        return;
      }

      setLoadState("ready");
    }

    void init();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        const target = state.from && typeof state.from === "string" ? state.from : "/today";
        navigate(target, { replace: true });
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const safeEmail = email.trim();
    if (!safeEmail || !password) {
      showToast({ message: "Inserisci email e password" });
      return;
    }

    try {
      setBusy(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: safeEmail,
        password
      });
      if (error) throw error;

      showToast({ message: "Accesso effettuato" });
      const target = state.from && typeof state.from === "string" ? state.from : "/today";
      navigate(target, { replace: true });
    } catch (err: any) {
      console.error(err);
      showToast({ message: err?.message ? `Errore: ${err.message}` : "Errore di accesso" });
      setBusy(false);
    }
  }

  if (loadState === "loading") {
    return (
      <>
        <Topbar title="Login" subtitle="Caricamento…" showNav={false} />
        <div className="container">Caricamento…</div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Login" subtitle="Accedi" showNav={false} />
      <div className="container">
        <div className="stack" style={{ marginTop: 24 }}>
          <div className="card">
            <div className="cardInner">
              <div className="title">Brioche 2026</div>
              <div className="subtle">Accedi con email e password</div>

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
                  onChange={(e) => setEmail(e.target.value)}
                />

                <label className="srOnly" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button type="submit" className="btn btnPrimary" disabled={busy}>
                  {busy ? "Accesso…" : "Entra"}
                </button>

                <div className="subtle">
                  Se vuoi, dopo aggiungiamo “Reset password” con email.
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
