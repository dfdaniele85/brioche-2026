import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import { supabase } from "../lib/supabase";

dayjs.extend(isoWeek);

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

function Stepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="stepper">
      <button className="stepBtn" type="button" onClick={() => onChange(Math.max(0, value - 1))}>
        −
      </button>
      <div className="qty">{value}</div>
      <button className="stepBtn" type="button" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

type ProductRow = {
  id: string;
  name: string;
  unit_price_cents?: number | null;
  category?: string | null;
};

export default function StaffToday() {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const wd = useMemo(() => dayjs(today).isoWeekday(), [today]); // 1..7
  const expected = useMemo(() => WEEKLY_TEMPLATE[wd] ?? WEEKLY_TEMPLATE[1], [wd]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [productsMap, setProductsMap] = useState<Record<string, ProductRow>>({});
  const [values, setValues] = useState<Record<ProductKey, number>>(() => ({ ...expected }));
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setStatus(null);

      try {
        // products (serve id UUID, NON il nome)
        const { data: products, error: prodErr } = await supabase
          .from("products")
          .select("id,name,unit_price_cents,category");

        if (prodErr) throw prodErr;

        const map: Record<string, ProductRow> = {};
        (products ?? []).forEach((p: any) => {
          if (p?.name) map[p.name] = p as ProductRow;
        });

        if (!mounted) return;
        setProductsMap(map);

        // carica eventuale delivery già salvata oggi
        const { data: delivery, error: delErr } = await supabase
          .from("deliveries")
          .select("id, note")
          .eq("delivery_date", today)
          .maybeSingle();

        if (delErr) throw delErr;

        if (!mounted) return;

        if (delivery?.note) setNote(delivery.note);

        if (delivery?.id) {
          const { data: items, error: itemsErr } = await supabase
            .from("delivery_items")
            .select("product_id, expected_qty, received_qty")
            .eq("delivery_id", delivery.id);

          if (itemsErr) throw itemsErr;

          // reverse map id->name
          const idToName = new Map<string, string>();
          (products ?? []).forEach((p: any) => idToName.set(p.id, p.name));

          const next: Record<ProductKey, number> = { ...expected };
          (items ?? []).forEach((it: any) => {
            const name = idToName.get(it.product_id);
            if (name && (PRODUCTS as string[]).includes(name)) {
              next[name as ProductKey] = Number(it.received_qty ?? 0);
            }
          });

          setValues(next);
        } else {
          setValues({ ...expected });
        }
      } catch (e) {
        console.error(e);
        setStatus("Errore caricamento ❌");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [today]);

  const canSave = useMemo(() => {
    // se manca qualche product_id (uuid) blocchiamo
    return PRODUCTS.every((p) => !!productsMap[p]?.id);
  }, [productsMap]);

  if (loading) {
    return (
      <div className="container">
        <div className="card">Caricamento…</div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1 style={{ marginBottom: 6 }}>Oggi</h1>
      <div className="muted" style={{ marginBottom: 14 }}>
        {dayjs(today).format("dddd DD/MM/YYYY")}
      </div>

      <div className="card">
        {PRODUCTS.map((p) => (
          <div key={p} className="row space" style={{ padding: "10px 0" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 20 }}>{p}</div>
              <div className="muted">Atteso: {expected[p]}</div>
            </div>

            <Stepper
              value={values[p] ?? 0}
              onChange={(v) => setValues((prev) => ({ ...prev, [p]: v }))}
            />
          </div>
        ))}

        <div style={{ height: 10 }} />
        <div className="muted" style={{ marginBottom: 6 }}>
          Note
        </div>
        <textarea
          className="input"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note"
        />

        <div style={{ height: 12 }} />

        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setValues({ ...expected });
              setStatus(null);
            }}
            disabled={saving}
          >
            Tutto OK
          </button>

          <button
            className="btn btnPrimary"
            type="button"
            disabled={saving || !canSave}
            onClick={async () => {
              setSaving(true);
              setStatus(null);

              try {
                if (!canSave) {
                  setStatus("Mancano prodotti su Supabase (tabella products) ❌");
                  return;
                }

                // 1) upsert delivery (1 riga per data)
                const { data: delRow, error: delErr } = await supabase
                  .from("deliveries")
                  .upsert(
                    { delivery_date: today, note: note?.trim() ? note.trim() : null },
                    { onConflict: "delivery_date" }
                  )
                  .select("id")
                  .single();

                if (delErr) throw delErr;

                const deliveryId = delRow.id as string;

                // 2) upsert items (1 riga per prodotto)
                for (const p of PRODUCTS) {
                  const pr = productsMap[p];
                  const productId = pr.id;
                  const unitPrice = Number(pr.unit_price_cents ?? 0);

                  const { error: itemErr } = await supabase
                    .from("delivery_items")
                    .upsert(
                      {
                        delivery_id: deliveryId,
                        product_id: productId,
                        expected_qty: expected[p],
                        received_qty: values[p] ?? 0,
                        unit_price_cents: unitPrice,
                        note: null,
                      },
                      { onConflict: "delivery_id,product_id" }
                    );

                  if (itemErr) throw itemErr;
                }

                setStatus("Salvato ✅");
              } catch (e) {
                console.error(e);
                setStatus("Errore salvataggio ❌ (guarda console)");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>

        {status ? (
          <div className="muted" style={{ marginTop: 10 }}>
            {status}
          </div>
        ) : null}
      </div>
    </div>
  );
}
