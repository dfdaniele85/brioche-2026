import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../lib/supabase";
import { weekdayIso } from "../lib/date";

type ProductRow = {
  id: string;
  name: string;
  unit_price_cents: number | null;
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

// TEMPLATE SETTIMANALE (atteso) — nomi devono matchare products.name in Supabase
const WEEKLY_TEMPLATE: Record<number, Record<string, number>> = {
  1: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Lun
  2: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Mar
  3: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Mer
  4: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Gio
  5: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Ven
  6: { Vuote: 10, Farcite: 82, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Sab
  7: { Vuote: 10, Farcite: 65, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 5, Focaccine: 5 }, // Dom
};

export default function StaffToday() {
  const today = useMemo(() => dayjs(), []);
  const dateStr = useMemo(() => today.format("YYYY-MM-DD"), [today]);
  const titleDate = useMemo(() => today.format("dddd DD/MM/YYYY"), [today]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [note, setNote] = useState("");
  const [values, setValues] = useState<Record<string, number>>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const wd = useMemo(() => weekdayIso(dateStr), [dateStr]);
  const expectedByName = useMemo(() => WEEKLY_TEMPLATE[wd] ?? {}, [wd]);

  const expectedByProductId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of products) map[p.id] = expectedByName[p.name] ?? 0;
    return map;
  }, [products, expectedByName]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setErrorMsg(null);
      setOkMsg(null);

      try {
        // 1) prodotti
        const pr = await supabase
          .from("products")
          .select("id,name,unit_price_cents")
          .order("name", { ascending: true });

        if (pr.error) throw pr.error;
        const prods = (pr.data ?? []) as ProductRow[];
        if (!mounted) return;

        setProducts(prods);

        // 2) delivery di oggi (se esiste)
        const dr = await supabase
          .from("deliveries")
          .select("id, note")
          .eq("delivery_date", dateStr)
          .maybeSingle();

        if (dr.error) throw dr.error;

        const deliveryId = dr.data?.id as string | undefined;
        setNote((dr.data?.note as string) ?? "");

        // 3) items
        if (deliveryId) {
          const ir = await supabase
            .from("delivery_items")
            .select("product_id, received_qty")
            .eq("delivery_id", deliveryId);

          if (ir.error) throw ir.error;

          const received: Record<string, number> = {};
          for (const row of ir.data ?? []) {
            received[String(row.product_id)] = Number(row.received_qty ?? 0);
          }

          // inizializza fallback su atteso se mancano righe
          const merged: Record<string, number> = {};
          for (const p of prods) merged[p.id] = received[p.id] ?? (expectedByName[p.name] ?? 0);

          setValues(merged);
        } else {
          // se non esiste delivery: inizializza tutto su atteso
          const init: Record<string, number> = {};
          for (const p of prods) init[p.id] = expectedByName[p.name] ?? 0;
          setValues(init);
        }
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setErrorMsg("Errore caricamento ❌");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [dateStr, expectedByName]);

  const onAllOk = () => {
    const next: Record<string, number> = {};
    for (const p of products) next[p.id] = expectedByProductId[p.id] ?? 0;
    setValues(next);
  };

  const onSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setOkMsg(null);

    try {
      // 1) upsert delivery (by delivery_date) e prendi id
      const dres = await supabase
        .from("deliveries")
        .upsert(
          { delivery_date: dateStr, note: note?.trim() ? note.trim() : null },
          { onConflict: "delivery_date" }
        )
        .select("id")
        .single();

      if (dres.error) throw dres.error;
      const deliveryId = dres.data.id as string;

      // 2) upsert items (delivery_id + product_id)
      for (const p of products) {
        const expected_qty = expectedByProductId[p.id] ?? 0;
        const received_qty = Number(values[p.id] ?? 0);

        const ires = await supabase
          .from("delivery_items")
          .upsert(
            {
              delivery_id: deliveryId,
              product_id: p.id,
              expected_qty,
              received_qty,
              unit_price_cents: p.unit_price_cents ?? 0,
              note: null,
            },
            { onConflict: "delivery_id,product_id" }
          );

        if (ires.error) throw ires.error;
      }

      setOkMsg("Salvato ✅");
    } catch (e) {
      console.error(e);
      setErrorMsg("Errore salvataggio ❌ (guarda console)");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className="card">Caricamento…</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="card">
        <h2 style={{ margin: 0 }}>Oggi</h2>
        <div className="muted" style={{ textTransform: "capitalize" }}>
          {titleDate}
        </div>

        <div style={{ height: 14 }} />

        {products.map((p) => (
          <div key={p.id} className="row space" style={{ padding: "12px 0" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 22 }}>{p.name}</div>
              <div className="muted">Atteso: {expectedByProductId[p.id] ?? 0}</div>
            </div>

            <Stepper
              value={Number(values[p.id] ?? 0)}
              onChange={(v) => setValues((prev) => ({ ...prev, [p.id]: v }))}
            />
          </div>
        ))}

        <div style={{ height: 10 }} />

        <div className="muted">Note</div>
        <textarea
          className="input"
          placeholder="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          style={{ width: "100%", resize: "vertical" }}
        />

        <div style={{ height: 12 }} />

        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button className="btn" type="button" onClick={onAllOk} disabled={saving}>
            Tutto OK
          </button>
          <button className="btn btnPrimary" type="button" onClick={onSave} disabled={saving}>
            {saving ? "Salvataggio…" : "Salva"}
          </button>
        </div>

        <div style={{ height: 10 }} />

        {errorMsg ? <div style={{ color: "#b91c1c", fontWeight: 800 }}>{errorMsg}</div> : null}
        {okMsg ? <div style={{ color: "#047857", fontWeight: 800 }}>{okMsg}</div> : null}
      </div>
    </div>
  );
}
