import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: 420, margin: "60px auto" }}>
        <h2 style={{ marginTop: 0 }}>Accesso</h2>

        <label className="muted">Email</label>
        <input
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@bar.it"
        />

        <div style={{ height: 12 }} />

        <label className="muted">Password</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <div style={{ height: 16 }} />

        <button
          className="btn btnPrimary"
          disabled={loading || !email || !password}
          onClick={async () => {
            setLoading(true);
            setError(null);
            const { error } = await supabase.auth.signInWithPassword({
              email,
              password,
            });
            if (error) setError(error.message);
            setLoading(false);
          }}
        >
          {loading ? "Accesso..." : "Entra"}
        </button>

        {error && (
          <p style={{ color: "#b91c1c", marginTop: 12 }}>{error}</p>
        )}
      </div>
    </div>
  );
}
