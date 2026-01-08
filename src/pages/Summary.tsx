import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../lib/supabase";

type ProductName =
  | "Vuote"
  | "Farcite"
  | "Krapfen"
  | "Trancio focaccia"
  | "Focaccine"
  | "Pizzette";

const PRODUCTS: ProductName[] = [
  "Vuote",
  "Farcite",
  "Krapfen",
  "Trancio focaccia",
  "Focaccine",
  "Pizzette",
];

type ProductRow = { id: string; name: string };
type DeliveryRow = { id: string; delivery_date: string };
type ItemRow = {
  delivery_id: string;
  product_id: string;
  received_qty: number | null;
  unit_price_cents: number | null;
};

function eur(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

export default function Summary() {
  const months = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, i) => ({
        month: i + 1,
        label: dayjs(new Date(2026, i, 1)).format("MMMM"),
      })),
    []
  );

  const [month, setMonth] = useState<number>(new Date().getFullYear() === 2026 ? new Date().getMonth() + 1 : 1);

  const [loading, setLoading] = useState(true);
  const [totalsQty, setTotalsQty] = useState<Record<ProductName, number>>(() =>
    Object.fromEntries(PRODUCTS.map((p) => [p, 0])) as Record<ProductName, number>
  );
  const [totalEuroCents, setTotalEuroCents] = useState(0);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // products (id -> name)
        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name")
          .in("name", PRODUCTS);

        if (prodErr) throw prodErr;

        const products = (prodData ?? []) as ProductRow[];
        const nameById: Record<string, ProductName> = {};
        products.forEach((p) => {
          nameById[p.id] = p.name as ProductName;
        });

        // deliveries del mese
        const start = dayjs(new Date(2026, month - 1, 1)).format("YYYY-MM-DD");
        const end = dayjs(new Date(2026, month, 1)).format("YYYY-MM-DD");

        const { data: delData, error: delErr } = await supabase
          .from("deliveries")
          .select("id,delivery_date")
          .gte("delivery_date", start)
          .lt("delivery_date", end);

        if (delErr) throw delErr;

        const deliveries = (delData ?? []) as DeliveryRow[];
        const deliveryIds = deliveries.map((d) => d.id);

        const initQty = Object.fromEntries(PRODUCTS.map((p) => [p, 0])) as Record<ProductName, number>;
        let euroCents = 0;

        if (deliveryIds.length > 0) {
          const { data: itemsData, error: itemsErr } = await supabase
            .from("delivery_items")
            .select("delivery_id,product_id,received_qty,unit_price_cents")
            .in("delivery_id", deliveryIds);

          if (itemsErr) throw itemsErr;

          const items = (itemsData ?? []) as ItemRow[];

          for (const it of items) {
            const name = nameById[it.product_id];
            if (!name) continue;

            const qty = it.received_qty ?? 0;
            const price = it.unit_price_cents ?? 0;

            initQty[name] = (initQty[name] ?? 0) + qty;
            euroCents += qty * price;
          }
        }

        if (!alive) return;
        setTotalsQty(initQty);
        setTotalEuroCents(euroCents);
      } catch (e) {
        console.error(e);
        alert("Errore riepilogo ❌ (guarda console)");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [month]);

  const totalPieces = useMemo(
    () => PRODUCTS.reduce((sum, p) => sum + (totalsQty[p] ?? 0), 0),
    [totalsQty]
  );

  return (
    <div className="container">
      <div className="row space" style={{ alignItems: "center" }}>
        <h2>Riepilogo 2026</h2>

        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {months.map((m) => (
            <option key={m.month} value={m.month}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ height: 12 }} />

      <div className="card" style={{ borderRadius: 14 }}>
        {loading ? (
          <div>Caricamento...</div>
        ) : (
          <>
            <div className="row space" style={{ alignItems: "baseline" }}>
              <div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Totale mese
                </div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>{eur(totalEuroCents)}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div className="muted" style={{ fontSize: 12 }}>
                  Totale pezzi
                </div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>{totalPieces}</div>
              </div>
            </div>

            <hr />

            {PRODUCTS.map((p) => (
              <div key={p} className="row space" style={{ padding: "10px 0" }}>
                <div style={{ fontWeight: 800 }}>{p}</div>
                <div style={{ fontWeight: 900 }}>{totalsQty[p] ?? 0}</div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
