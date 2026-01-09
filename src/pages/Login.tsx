import { useState } from "react";

type Props = {
  onLogin: () => void;
};

export default function Login({ onLogin }: Props) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    // PIN semplice (puoi cambiarlo)
    if (pin.trim() === "2026") {
      localStorage.setItem("brioche_auth", "ok");
      onLogin();
    } else {
      setErr("PIN errato");
    }
  };

  return (
    <div className="fiuriContainer">
      <h1 className="fiuriTitle">Brioche 2026</h1>
      <div className="fiuriCard" style={{ marginTop: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Inserisci PIN</div>
        <input
          className="input"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="PIN"
          inputMode="numeric"
        />
        <div style={{ height: 10 }} />
        <button className="btn btnPrimary" type="button" onClick={submit}>
          Entra
        </button>
        {err && <div className="noticeErr" style={{ marginTop: 12 }}>{err}</div>}
        <div className="muted" style={{ marginTop: 12, fontWeight: 900 }}>
          (PIN attuale: 2026)
        </div>
      </div>
    </div>
  );
}
