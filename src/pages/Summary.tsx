// /src/pages/Summary.tsx
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../lib/supabase";

type Row = {
  product_id: string;
  expected_qty: number | null;
  received_qty: number | null;
  unit_price_cents: number | null; // <-- viene da delivery_items
  note: string | null;
};

type Product = {
  id: string;
  name: string;
};

export default function Summary() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [items, setItems] = useState<Row[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      try {
        // prodotti (solo id + name)
        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name");

        if (prodErr) throw prodErr;

        // delivery_items + prezzi (unit_price_cents) + qty
        const { data: itemData, error: itemErr } = await supabase
          .from("delivery_items")
          .select("product_id,expected_qty,received_qty,unit_price_cents,note");

        if (itemErr) throw itemErr;

        if (!alive) return;
        setProducts((prodData as Product[]) ?? []);
        setItems((itemData as Row[]) ?? []);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Errore caricamento riepilogo");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) m.set(p.id, p.name);
    return m;
  }, [products]);

  const totals = useMemo(() => {
    // per prodotto: pezzi (ricevuti) + euro
    const byProduct: Record<
      string,
      { name: string; pieces: number; euros: number }
    > = {};

    for (const r of items) {
      const name = nameById.get(r.product_id) ?? r.product_id;
      const pieces = Number(r.received_qty ?? 0);
      const priceCents = Number(r.unit_price_cents ?? 0);
      const euros = (pieces * priceCents) / 100;

      if (!byProduct[r.product_id]) {
        byProduct[r.product_id] = { name, pieces: 0, euros: 0 };
      }
      byProduct[r.product_id].pieces += pieces;
      byProduct[r.product_id].euros += euros;
    }

    const list = Object.values(byProduct).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    const grandPieces = list.reduce((s, x) => s + x.pieces, 0);
    const grandEuros = list.reduce((s, x) => s + x.euros, 0);

    return { list, grandPieces, grandEuros };
  }, [items, nameById]);

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <div className="h2">Riepilogo</div>
          <div className="muted">Caricamento...</div>
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="page">
        <div className="card">
          <div className="h2">Riepilogo</div>
          <div className="alert">
            <span>Errore caricamento riepilogo</span>
            <span>❌</span>
          </div>
          <div style={{ height: 10 }} />
          <div className="muted" style={{ wordBreak: "break-word" }}>
            {err}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card">
        <div className="row" style={{ alignItems: "baseline" }}>
          <div className="h2" style={{ margin: 0 }}>
            Riepilogo
          </div>
          <div className="muted">{dayjs().format("DD/MM/YYYY")}</div>
        </div>

        <hr className="hr" />

        <div className="stack" style={{ gap: 12 }}>
          {totals.list.map((x) => (
            <div
              key={x.name}
              className="row"
              style={{
                padding: "10px 0",
                borderBottom: "1px solid rgba(17,24,39,.08)",
              }}
            >
              <div>
                <div style={{ fontWeight: 950, fontSize: 18 }}>{x.name}</div>
                <div className="muted" style={{ fontWeight: 800 }}>
                  Totale pezzi: {x.pieces}
                </div>
              </div>

              <div style={{ fontWeight: 950, fontSize: 18 }}>
                € {x.euros.toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ height: 12 }} />
        <div className="row">
          <div>
            <div style={{ fontWeight: 950, fontSize: 18 }}>Totale</div>
            <div className="muted" style={{ fontWeight: 900 }}>
              Pezzi: {totals.grandPieces}
            </div>
          </div>
          <div style={{ fontWeight: 950, fontSize: 20 }}>
            € {totals.grandEuros.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );
}
