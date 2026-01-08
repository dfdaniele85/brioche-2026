import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../lib/supabase";

type ProductKey =
  | "Vuote"
  | "Farcite"
  | "Krapfen"
  | "Trancio focaccia"
  | "Focaccine"
  | "Pizzette";

const PRODUCTS: ProductKey[] = [
  "Vuote",
  "Farcite",
  "Krapfen",
  "Trancio focaccia",
  "Focaccine",
  "Pizzette",
];

const WEEKLY_TEMPLATE: Record<number, Record<ProductKey, number>> = {
  1: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  2: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  3: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  4: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  5: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  6: { Vuote: 10, Farcite: 82, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  7: { Vuote: 10, Farcite: 65, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 5, Focaccine: 5 },
};

function weekdayIsoFromDate(dateIso: string) {
  const d = dayjs(dateIso);
  const dow = d.day(); // 0=dom ... 6=sab
  return dow === 0 ? 7 : dow; // 1..7
}

function Stepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="stepper">
      <button
        className="stepBtn"
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <div className="qty">{value}</div>
      <button className="stepBtn" type="button" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export default function StaffToday() {
  const todayIso = dayjs().format("YYYY-MM-DD");
  const title = dayjs().format("ddd DD/MM/YYYY");

  const expected = useMemo(() => {
    const wd = weekdayIsoFromDate(todayIso);
    return WEEKLY_TEMPLATE[wd];
  }, [todayIso]);

  const [values, setValues] = useState<Record<ProductKey, number>>(() => ({ ...expected }));
  const [note, setNote] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // carica dati già salvati di oggi (se esistono)
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);

      const { data: delivery, error: dErr } = await supabase
        .from("deliveries")
        .select("id, note")
        .eq("delivery_date", todayIso)
        .maybeSingle();

      if (!alive) return;

      if (dErr) {
        console.warn(dErr);
        setLoading(false);
        return;
      }

      if (!delivery) {
        setValues({ ...expected });
        setNote("");
        setLoading(false);
        return;
      }

      setNote(delivery.note ?? "");

      const { data: items, error: iErr } = await supabase
        .from("delivery_items")
        .select("product_id, received_qty")
        .eq("delivery_id", delivery.id);

      if (!alive) return;

      if (iErr) {
        console.warn(iErr);
        setLoading(false);
        return;
      }

      const next: Record<ProductKey, number> = { ...expected };
      for (const row of items ?? []) {
        const k = row.product_id as ProductKey;
        if (PRODUCTS.includes(k)) next[k] = row.received_qty ?? 0;
      }
      setValues(next);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [todayIso, expected]);

  async function handleSave() {
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("deliveries")
        .upsert({ delivery_date: todayIso, note: note || null }, { onConflict: "delivery_date" })
        .select("id")
        .single();

      if (error) throw error;

      for (const p of PRODUCTS) {
        const { error: itemErr } = await supabase
          .from("delivery_items")
          .upsert(
            {
              delivery_id: data.id,
              product_id: p,
              expected_qty: expected[p],
              received_qty: values[p] ?? 0,
            },
            { onConflict: "delivery_id,product_id" }
          );

        if (itemErr) throw itemErr;
      }

      alert("Salvato ✅");
    } catch (e) {
      console.error(e);
      alert("Errore salvataggio ❌ (guarda console)");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card">Caricamento…</div>
      </div>
    );
  }

  return (
    <div className="container">
      <h2 style={{ textTransform: "capitalize" }}>Oggi • {title}</h2>
      <div style={{ height: 12 }} />

      <div className="card">
        <div className="row space">
          <strong>Quantità</strong>
          <span className="muted">Atteso → Ricevuto</span>
        </div>

        <hr />

        {PRODUCTS.map((p) => (
          <div key={p} className="itemRow">
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{p}</div>
              <div className="muted" style={{ fontSize: 13 }}>
                Atteso: {expected[p]}
              </div>
            </div>

            <Stepper
              value={values[p] ?? 0}
              onChange={(v) => setValues((prev) => ({ ...prev, [p]: v }))}
            />
          </div>
        ))}

        <hr />

        <div style={{ marginBottom: 10, fontWeight: 900 }}>Note</div>
        <textarea
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note"
        />

        <div style={{ height: 12 }} />

        <div className="row" style={{ justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setValues({ ...expected });
              setNote("");
            }}
          >
            Tutto OK
          </button>

          <button className="btn btnPrimary" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
