import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../lib/supabase";
import { formatDayRow, weekdayIso } from "../lib/date";

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

// weekdayIso: 1=Lun ... 7=Dom
const WEEKLY_TEMPLATE: Record<number, Record<ProductKey, number>> = {
  1: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  2: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  3: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  4: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  5: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  6: { Vuote: 10, Farcite: 82, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  7: { Vuote: 10, Farcite: 65, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 5, Focaccine: 5 },
};

type ProductRow = { id: string; name: string; default_price_cents: number | null; active: boolean };
type PriceSettingRow = { product_id: string; price_cents: number };

export default function StaffToday() {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const wd = useMemo(() => weekdayIso(today), [today]);
  const expected = useMemo(() => WEEKLY_TEMPLATE[wd], [wd]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});
  const [priceByProductId, setPriceByProductId] = useState<Record<string, number>>({});

  const [values, setValues] = useState<Record<ProductKey, number>>({ ...expected });
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      const [{ data: products, error: pErr }, { data: priceSettings, error: psErr }] =
        await Promise.all([
          supabase
            .from("products")
            .select("id,name,default_price_cents,active")
            .eq("active", true),
          supabase.from("price_settings").select("product_id,price_cents"),
        ]);

      if (!alive) return;

      if (pErr) {
        console.error("products error", pErr);
        setLoading(false);
        return;
      }
      if (psErr) {
        console.error("price_settings error", psErr);
        // continuiamo comunque (useremo default_price_cents)
      }

      const idMap: Record<string, string> = {};
      const defaultPriceById: Record<string, number> = {};
      (products ?? []).forEach((p: ProductRow) => {
        idMap[p.name] = p.id;
        defaultPriceById[p.id] = typeof p.default_price_cents === "number" ? p.default_price_cents : 0;
      });

      const priceMap: Record<string, number> = { ...defaultPriceById };
      (priceSettings ?? []).forEach((ps: PriceSettingRow) => {
        priceMap[ps.product_id] = ps.price_cents;
      });

      setProductIdByName(idMap);
      setPriceByProductId(priceMap);

      // carica eventuale delivery già salvato per oggi
      const { data: delivery, error: dErr } = await supabase
        .from("deliveries")
        .select("id,delivery_date,note")
        .eq("delivery_date", today)
        .maybeSingle();

      if (!alive) return;

      if (dErr) {
        console.error("deliveries load error", dErr);
        setLoading(false);
        return;
      }

      if (delivery?.id) {
        const { data: items, error: iErr } = await supabase
          .from("delivery_items")
          .select("product_id,received_qty")
          .eq("delivery_id", delivery.id);

        if (!alive) return;

        if (iErr) {
          console.error("delivery_items load error", iErr);
          setLoading(false);
          return;
        }

        // ricostruisci values per nome
        const receivedByProductId: Record<string, number> = {};
        (items ?? []).forEach((it: any) => {
          receivedByProductId[it.product_id] = it.received_qty ?? 0;
        });

        const next: Record<ProductKey, number> = { ...expected };
        PRODUCTS.forEach((name) => {
          const pid = idMap[name];
          if (pid && typeof receivedByProductId[pid] === "number") next[name] = receivedByProductId[pid];
        });

        setValues(next);
        setNote(delivery.note ?? "");
      } else {
        setValues({ ...expected });
        setNote("");
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [today, expected]);

  const canSave = useMemo(() => {
    // serve la mappa id per tutti i prodotti
    return PRODUCTS.every((p) => !!productIdByName[p]);
  }, [productIdByName]);

  if (loading) {
    return (
      <div className="container">
        <div className="card">Caricamento…</div>
      </div>
    );
  }

  return (
    <div className="container">
      <h2>Oggi</h2>
      <div className="muted" style={{ marginTop: 4 }}>
        {formatDayRow(today)}
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        {PRODUCTS.map((p) => (
          <div key={p} className="row space" style={{ padding: "10px 0" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 18 }}>{p}</div>
              <div className="muted">Atteso: {expected[p]}</div>
            </div>

            <input
              className="input"
              style={{ width: 110, textAlign: "right" }}
              type="number"
              min={0}
              value={values[p] ?? 0}
              onChange={(e) => {
                const n = Number(e.target.value);
                setValues((prev) => ({ ...prev, [p]: Number.isFinite(n) ? n : 0 }));
              }}
            />
          </div>
        ))}

        <div style={{ height: 12 }} />

        <label className="label">Note</label>
        <textarea
          className="textarea"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
        />

        <div style={{ height: 12 }} />

        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setValues({ ...expected });
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
              try {
                setSaving(true);

                const {
                  data: { user },
                  error: uErr,
                } = await supabase.auth.getUser();
                if (uErr) throw uErr;
                if (!user) throw new Error("Utente non autenticato");

                // upsert deliveries (una riga per giorno)
                const { data: deliv, error: dErr } = await supabase
                  .from("deliveries")
                  .upsert(
                    {
                      delivery_date: today,
                      note: note?.trim() ? note.trim() : null,
                      created_by: user.id,
                      updated_by: user.id,
                    },
                    { onConflict: "delivery_date" }
                  )
                  .select("id")
                  .single();

                if (dErr) throw dErr;

                // upsert delivery_items (una riga per prodotto)
                for (const name of PRODUCTS) {
                  const product_id = productIdByName[name];
                  const unit_price_cents = priceByProductId[product_id] ?? 0;

                  const { error: iErr } = await supabase
                    .from("delivery_items")
                    .upsert(
                      {
                        delivery_id: deliv.id,
                        product_id,
                        expected_qty: expected[name],
                        received_qty: values[name] ?? 0,
                        unit_price_cents,
                        note: null,
                      },
                      { onConflict: "delivery_id,product_id" }
                    );

                  if (iErr) throw iErr;
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
            {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
