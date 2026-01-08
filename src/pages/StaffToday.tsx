import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
dayjs.extend(isoWeek);

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

// 1=Lun ... 7=Dom
const WEEKLY_TEMPLATE: Record<number, Record<ProductKey, number>> = {
  1: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  2: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  3: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  4: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  5: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  6: { Vuote: 10, Farcite: 82, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  7: { Vuote: 10, Farcite: 65, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 5, Focaccine: 5 },
};

function weekdayIso(dateStr: string) {
  const d = dayjs(dateStr);
  const wd = d.isoWeekday(); // 1..7
  return wd;
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
        aria-label="decrease"
      >
        −
      </button>
      <div className="qty">{value}</div>
      <button
        className="stepBtn"
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="increase"
      >
        +
      </button>
    </div>
  );
}

export default function StaffToday() {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const wd = useMemo(() => weekdayIso(today), [today]);
  const expected = useMemo(() => WEEKLY_TEMPLATE[wd], [wd]);

  const [values, setValues] = useState<Record<ProductKey, number>>({ ...expected });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // carica eventuali dati già salvati per oggi
  useEffect(() => {
    (async () => {
      const { data: d } = await supabase
        .from("deliveries")
        .select("id, note")
        .eq("delivery_date", today)
        .maybeSingle();

      if (d?.note) setNote(d.note);

      if (d?.id) {
        const { data: items } = await supabase
          .from("delivery_items")
          .select("product_id, received_qty")
          .eq("delivery_id", d.id);

        if (items && items.length) {
          const next: Record<ProductKey, number> = { ...expected };
          for (const it of items) {
            const k = it.product_id as ProductKey;
            if (PRODUCTS.includes(k)) next[k] = Number(it.received_qty ?? 0);
          }
          setValues(next);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <h2>Oggi</h2>

      <div className="card" style={{ borderRadius: 16 }}>
        <div className="row space">
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{dayjs(today).format("ddd DD/MM/YYYY")}</div>
            <div className="muted" style={{ marginTop: 4 }}>Atteso → Ricevuto</div>
          </div>
        </div>

        <hr />

        {PRODUCTS.map((p) => (
          <div key={p} className="row space" style={{ padding: "10px 0" }}>
            <div>
              <div style={{ fontWeight: 800 }}>{p}</div>
              <div className="muted" style={{ fontSize: 12 }}>
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

        <div style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Note</div>
          <textarea
            className="input"
            placeholder="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            style={{ width: "100%", resize: "vertical" }}
          />
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setValues({ ...expected });
              setNote("");
            }}
            disabled={saving}
          >
            Tutto OK
          </button>

          <button
            className="btn btnPrimary"
            type="button"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                // 1) upsert deliveries (una riga per giorno)
                const { data, error } = await supabase
                  .from("deliveries")
                  .upsert({ delivery_date: today, note: note || null }, { onConflict: "delivery_date" })
                  .select("id")
                  .single();

                if (error) throw error;

                // 2) upsert delivery_items (una riga per prodotto)
                for (const p of PRODUCTS) {
                  const { error: e2 } = await supabase
                    .from("delivery_items")
                    .upsert(
                      {
                        delivery_id: data.id,
                        product_id: p,
                        expected_qty: expected[p],
                        received_qty: values[p] ?? 0,
                        unit_price_cents: null,
                        note: null,
                      },
                      { onConflict: "delivery_id,product_id" }
                    );

                  if (e2) throw e2;
                }

                alert("Salvato ✅");
              } catch (e) {
                console.error(e);
                alert("Errore salvataggio ❌ (guarda console)");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
