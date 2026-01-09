import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { weekdayIso } from "../lib/date";
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

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
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

type ProductRow = { id: string; name: string; default_price_cents: number | null };
type PriceSettingRow = { product_id: string; price_cents: number };

export default function StaffToday() {
  const date = dayjs().format("YYYY-MM-DD");
  const dayLabel = useMemo(() => dayjs(date).format("dddd DD/MM/YYYY"), [date]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});
  const [priceCentsByName, setPriceCentsByName] = useState<Record<string, number>>({});
  const [values, setValues] = useState<Record<ProductKey, number>>(
    WEEKLY_TEMPLATE[weekdayIso(date)]
  );

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const wd = weekdayIso(date);
        const expected = WEEKLY_TEMPLATE[wd];
        setValues(expected);

        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name,default_price_cents")
          .in("name", PRODUCTS);

        if (prodErr) throw prodErr;
        const products = (prodData ?? []) as ProductRow[];

        const idByName: Record<string, string> = {};
        const defaultPriceByName: Record<string, number> = {};
        for (const p of products) {
          idByName[p.name] = p.id;
          defaultPriceByName[p.name] = p.default_price_cents ?? 0;
        }

        const { data: psData, error: psErr } = await supabase
          .from("price_settings")
          .select("product_id,price_cents");

        if (psErr) throw psErr;
        const ps = (psData ?? []) as PriceSettingRow[];

        const priceByName: Record<string, number> = { ...defaultPriceByName };
        for (const row of ps) {
          const name = products.find((p) => p.id === row.product_id)?.name;
          if (name) priceByName[name] = row.price_cents;
        }

        // carica eventuale delivery già presente per oggi
        const { data: del, error: delErr } = await supabase
          .from("deliveries")
          .select("id,note")
          .eq("delivery_date", date)
          .maybeSingle();

        if (delErr) throw delErr;

        if (del?.id) {
          if (del.note) setNote(del.note);

          const { data: items, error: itErr } = await supabase
            .from("delivery_items")
            .select("product_id,received_qty")
            .eq("delivery_id", del.id);

          if (itErr) throw itErr;

          const byName: Record<ProductKey, number> = { ...expected };
          for (const it of items ?? []) {
            const name = products.find((p) => p.id === it.product_id)?.name as ProductKey | undefined;
            if (!name) continue;
            byName[name] = it.received_qty ?? 0;
          }
          setValues(byName);
        }

        if (!alive) return;
        setProductIdByName(idByName);
        setPriceCentsByName(priceByName);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        alert("Errore caricamento Oggi (guarda console)");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [date]);

  const save = async () => {
    try {
      setSaving(true);

      const wd = weekdayIso(date);
      const expected = WEEKLY_TEMPLATE[wd];

      const { data: delivery, error: delErr } = await supabase
        .from("deliveries")
        .upsert({ delivery_date: date, note: note || null }, { onConflict: "delivery_date" })
        .select("id")
        .single();

      if (delErr) throw delErr;
      const deliveryId = delivery.id as string;

      for (const p of PRODUCTS) {
        const productId = productIdByName[p];
        if (!productId) continue;

        const unitPrice = priceCentsByName[p] ?? 0;

        const { error: itErr } = await supabase
          .from("delivery_items")
          .upsert(
            {
              delivery_id: deliveryId,
              product_id: productId,
              expected_qty: expected[p] ?? 0,
              received_qty: values[p] ?? 0,
              unit_price_cents: unitPrice,
              note: null,
            },
            { onConflict: "delivery_id,product_id" }
          );

        if (itErr) throw itErr;
      }

      alert("Salvato ✅");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      alert("Errore salvataggio ❌ (guarda console)");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fiuriContainer">
        <div className="fiuriCard">Caricamento...</div>
      </div>
    );
  }

  const wd = weekdayIso(date);
  const expected = WEEKLY_TEMPLATE[wd];

  return (
    <div className="fiuriContainer">
      <h1 className="fiuriTitle">Oggi</h1>
      <div className="muted" style={{ fontWeight: 900 }}>{dayLabel}</div>
      <div style={{ height: 12 }} />

      <div className="fiuriCard">
        {PRODUCTS.map((p) => (
          <div key={p} className="row" style={{ padding: "10px 0" }}>
            <div className="rowLeft">
              <div style={{ fontWeight: 900, fontSize: 22 }}>{p}</div>
              <div className="muted" style={{ fontWeight: 900 }}>Atteso: {expected[p]}</div>
            </div>

            <Stepper
              value={values[p] ?? 0}
              onChange={(v) => setValues((prev) => ({ ...prev, [p]: v }))}
            />
          </div>
        ))}

        <hr />

        <div className="muted" style={{ fontWeight: 900, marginBottom: 6 }}>Note</div>
        <textarea
          className="input"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          style={{ minHeight: 70 }}
        />

        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button className="btn" type="button" onClick={() => setValues({ ...expected })}>
            Tutto OK
          </button>
          <button className="btn btnPrimary" type="button" onClick={save} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
