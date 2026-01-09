import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../lib/supabase";
import { formatEurFromCents } from "../lib/prices";

type ItemRow = {
  product_id: string;
  received_qty: number | null;
  unit_price_cents: number | null;
};

type ProductRow = {
  id: string;
  name: string;
};

type ViewRow = ItemRow & {
  product_name: string;
};

export default function Summary() {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [rows, setRows] = useState<ViewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load(d: string) {
      setLoading(true);
      setErr(null);

      try {
        // 1) Trova delivery del giorno (compatibile anche senza maybeSingle)
        const { data: delivs, error: delErr } = await supabase
          .from("deliveries")
          .select("id")
          .eq("delivery_date", d)
          .limit(1);

        if (delErr) throw delErr;

        const deliveryId = delivs?.[0]?.id as string | undefined;
        if (!deliveryId) {
          if (alive) setRows([]);
          return;
        }

        // 2) Carica items del delivery
        const { data: items, error: itErr } = await supabase
          .from("delivery_items")
          .select("product_id,received_qty,unit_price_cents")
          .eq("delivery_id", deliveryId);

        if (itErr) throw itErr;

        const safeItems = (items ?? []) as ItemRow[];

        // 3) Carica nomi prodotti (niente join: sempre stabile)
        const productIds = Array.from(new Set(safeItems.map((x) => x.product_id))).filter(Boolean);

        let nameById: Record<string, string> = {};
        if (productIds.length > 0) {
          const { data: prods, error: pErr } = await supabase
            .from("products")
            .select("id,name")
            .in("id", productIds);

          if (pErr) throw pErr;

          (prods ?? []).forEach((p: any) => {
            nameById[p.id] = p.name;
          });
        }

        const view: ViewRow[] = safeItems.map((r) => ({
          ...r,
          product_name: nameById[r.product_id] ?? "Prodotto",
        }));

        if (alive) setRows(view);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Errore caricamento riepilogo");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load(date);

    return () => {
      alive = false;
    };
  }, [date]);

  const byProduct = useMemo(() => {
    const map = new Map<string, { id: string; name: string; qty: number; cents: number }>();

    for (const r of rows) {
      const id = r.product_id;
      const name = r.product_name ?? "Prodotto";
      const qty = Number(r.received_qty ?? 0);
      const price = Number(r.unit_price_cents ?? 0);
      const cents = price * qty;

      const prev = map.get(id);
      if (!prev) map.set(id, { id, name, qty, cents });
      else map.set(id, { ...prev, qty: prev.qty + qty, cents: prev.cents + cents });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const totalCents = byProduct.reduce((s, p) => s + p.cents, 0);
  const totalQty = byProduct.reduce((s, p) => s + p.qty, 0);

  return (
    <div className="fiuriContainer">
      <h1 className="fiuriTitle">Riepilogo</h1>

      <div className="fiuriCard" style={{ marginTop: 12 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <div className="rowLeft">
            <div style={{ fontWeight: 900 }}>Data</div>
            <div className="muted" style={{ fontWeight: 900 }}>
              {dayjs(date).format("DD/MM/YYYY")}
            </div>
          </div>

          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        {loading && (
          <div style={{ padding: "10px 0", fontWeight: 900, color: "#6b7280" }}>
            Caricamento...
          </div>
        )}

        {err && <div className="noticeErr">Errore caricamento riepilogo ✖ — {err}</div>}

        {!loading && !err && (
          <>
            {byProduct.map((p) => (
              <div key={p.id} className="row" style={{ padding: "10px 0" }}>
                <div className="rowLeft">
                  <div style={{ fontWeight: 900, fontSize: 26 }}>{p.name}</div>
                  <div className="muted" style={{ fontWeight: 900 }}>
                    Totale pezzi: {p.qty}
                  </div>
                </div>
                <div style={{ fontWeight: 900, fontSize: 28 }}>
                  {formatEurFromCents(p.cents)}
                </div>
              </div>
            ))}

            <hr />

            <div className="row" style={{ paddingTop: 6 }}>
              <div className="rowLeft">
                <div style={{ fontWeight: 900, fontSize: 28 }}>Totale</div>
                <div className="muted" style={{ fontWeight: 900 }}>Pezzi: {totalQty}</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 30 }}>
                {formatEurFromCents(totalCents)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
