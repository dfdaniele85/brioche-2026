import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import dayjs from "dayjs";

type ItemRow = {
  received_qty: number | null;
  expected_qty: number | null;
  unit_price_cents: number | null;
  products?: {
    name?: string | null;
    category?: string | null;
  } | null;
};

function euro(cents: number) {
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

export default function Summary() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error } = await supabase
          .from("delivery_items")
          .select("received_qty,expected_qty,unit_price_cents,products(name,category)");

        if (error) throw error;

        if (!mounted) return;
        setRows((data ?? []) as ItemRow[]);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setError("Errore caricamento riepilogo ❌");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const totals = useMemo(() => {
    const byCategory: Record<string, { pieces: number; cents: number }> = {};

    for (const r of rows) {
      const name = r.products?.name ?? "Senza nome";
      const cat = r.products?.category ?? name;

      const qty = Number(r.received_qty ?? 0);
      const price = Number(r.unit_price_cents ?? 0);

      if (!byCategory[cat]) byCategory[cat] = { pieces: 0, cents: 0 };
      byCategory[cat].pieces += qty;
      byCategory[cat].cents += qty * price;
    }

    const grandPieces = Object.values(byCategory).reduce((a, x) => a + x.pieces, 0);
    const grandCents = Object.values(byCategory).reduce((a, x) => a + x.cents, 0);

    return { byCategory, grandPieces, grandCents };
  }, [rows]);

  if (loading) {
    return (
      <div className="container">
        <div className="card">Caricamento…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <div className="card">{error}</div>
      </div>
    );
  }

  const categories = Object.keys(totals.byCategory).sort((a, b) => a.localeCompare(b));

  return (
    <div className="container">
      <h1 style={{ marginBottom: 6 }}>Riepilogo</h1>
      <div className="muted" style={{ marginBottom: 14 }}>
        Aggiornato: {dayjs().format("DD/MM/YYYY HH:mm")}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row space">
          <div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Totale pezzi</div>
            <div className="muted">{totals.grandPieces}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Totale €</div>
            <div className="muted">{euro(totals.grandCents)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        {categories.map((c) => (
          <div key={c} className="row space" style={{ padding: "10px 0" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{c}</div>
              <div className="muted">Pezzi: {totals.byCategory[c].pieces}</div>
            </div>
            <div style={{ fontWeight: 900 }}>{euro(totals.byCategory[c].cents)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
