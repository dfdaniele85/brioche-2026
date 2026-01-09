import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../lib/supabase";

type Row = {
  product_name: string;
  qty: number;
  euro: number;
};

const APP_VERSION = "v1.7.7";

function eur(n: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export default function Summary() {
  const [date, setDate] = useState<string>(dayjs().format("YYYY-MM-DD"));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const totals = useMemo(() => {
    const pezzi = rows.reduce((s, r) => s + r.qty, 0);
    const euro = rows.reduce((s, r) => s + r.euro, 0);
    return { pezzi, euro };
  }, [rows]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 1) prendo la delivery del giorno
        const d = await supabase
          .from("deliveries")
          .select("id, delivery_date")
          .eq("delivery_date", date)
          .maybeSingle();

        if (d.error) throw d.error;

        if (!d.data?.id) {
          if (!cancelled) setRows([]);
          return;
        }

        // 2) prendo gli items + nome prodotto (NO products.unit_price_cents!)
        const items = await supabase
          .from("delivery_items")
          .select("received_qty, unit_price_cents, product:products(name)")
          .eq("delivery_id", d.data.id);

        if (items.error) throw items.error;

        const map = new Map<string, { qty: number; euro: number }>();

        for (const it of items.data ?? []) {
          const name = (it as any)?.product?.name ?? "Prodotto";
          const qty = Number((it as any)?.received_qty ?? 0);
          const cents = Number((it as any)?.unit_price_cents ?? 0);
          const e = (qty * cents) / 100;

          const prev = map.get(name) ?? { qty: 0, euro: 0 };
          map.set(name, { qty: prev.qty + qty, euro: prev.euro + e });
        }

        const out: Row[] = Array.from(map.entries())
          .map(([product_name, v]) => ({ product_name, qty: v.qty, euro: v.euro }))
          .sort((a, b) => a.product_name.localeCompare(b.product_name, "it"));

        if (!cancelled) setRows(out);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Errore caricamento riepilogo");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [date]);

  return (
    <div className="container">
      <div className="pageHeader">
        <h1>Riepilogo</h1>
        <div className="muted">{APP_VERSION}</div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="rowBetween">
          <div>
            <div className="muted">Data</div>
            <div style={{ fontWeight: 800 }}>{dayjs(date).format("DD/MM/YYYY")}</div>
          </div>

          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ maxWidth: 180 }}
          />
        </div>
      </div>

      {loading && <div className="card">Caricamento…</div>}
      {error && <div className="card errorBar">Errore caricamento riepilogo ❌ — {error}</div>}

      {!loading && !error && (
        <>
          {rows.length === 0 ? (
            <div className="card">Nessun dato per questa data.</div>
          ) : (
            <div className="card">
              <div className="list">
                {rows.map((r) => (
                  <div className="listRow" key={r.product_name}>
                    <div>
                      <div className="title">{r.product_name}</div>
                      <div className="muted">Totale pezzi: {r.qty}</div>
                    </div>
                    <div className="value">{eur(r.euro)}</div>
                  </div>
                ))}
              </div>

              <div className="divider" />

              <div className="rowBetween">
                <div>
                  <div className="title">Totale</div>
                  <div className="muted">Pezzi: {totals.pezzi}</div>
                </div>
                <div className="value">{eur(totals.euro)}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
