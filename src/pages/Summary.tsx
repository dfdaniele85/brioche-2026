import { useEffect, useMemo, useState } from "react";
import dayjs from "../lib/dayjsIt";
import { supabase } from "../lib/supabase";
import { formatEurFromCents } from "../lib/prices";

type ItemRow = {
  product_id: string;
  received_qty: number | null;
  unit_price_cents: number | null;
};

type ViewRow = ItemRow & {
  product_name: string;
};

type Totals = {
  qty: number;
  cents: number;
  byProduct: Record<string, number>;
};

export default function Summary() {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [rows, setRows] = useState<ViewRow[]>([]);
  const [dayTotals, setDayTotals] = useState<Totals>({
    qty: 0,
    cents: 0,
    byProduct: {},
  });
  const [monthTotals, setMonthTotals] = useState<Totals>({
    qty: 0,
    cents: 0,
    byProduct: {},
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load(d: string) {
      setLoading(true);
      setErr(null);

      try {
        /* =======================
           GIORNO
        ======================= */

        const { data: delivs, error: delErr } = await supabase
          .from("deliveries")
          .select("id")
          .eq("delivery_date", d)
          .limit(1);

        if (delErr) throw delErr;

        const deliveryId = delivs?.[0]?.id as string | undefined;

        let dayQty = 0;
        let dayCents = 0;
        const dayByProduct: Record<string, number> = {};

        let viewRows: ViewRow[] = [];

        if (deliveryId) {
          const { data: items, error: itErr } = await supabase
            .from("delivery_items")
            .select("product_id,received_qty,unit_price_cents")
            .eq("delivery_id", deliveryId);

          if (itErr) throw itErr;

          const safeItems = (items ?? []) as ItemRow[];

          const productIds = Array.from(
            new Set(safeItems.map((x) => x.product_id))
          ).filter(Boolean);

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

          viewRows = safeItems.map((r) => {
            const name = nameById[r.product_id] ?? "Prodotto";
            const q = Number(r.received_qty ?? 0);
            const p = Number(r.unit_price_cents ?? 0);

            dayQty += q;
            dayCents += q * p;
            dayByProduct[name] = (dayByProduct[name] ?? 0) + q;

            return {
              ...r,
              product_name: name,
            };
          });
        }

        /* =======================
           MESE
        ======================= */

        const start = dayjs(d).startOf("month").format("YYYY-MM-DD");
        const end = dayjs(d).add(1, "month").startOf("month").format("YYYY-MM-DD");

        const { data: monthDelivs, error: mDelErr } = await supabase
          .from("deliveries")
          .select("id")
          .gte("delivery_date", start)
          .lt("delivery_date", end);

        if (mDelErr) throw mDelErr;

        const monthIds = (monthDelivs ?? []).map((x: any) => x.id);

        let monthQty = 0;
        let monthCents = 0;
        const monthByProduct: Record<string, number> = {};

        if (monthIds.length > 0) {
          const { data: monthItems, error: mItErr } = await supabase
            .from("delivery_items")
            .select("received_qty,unit_price_cents,product_id")
            .in("delivery_id", monthIds);

          if (mItErr) throw mItErr;

          const productIds = Array.from(
            new Set((monthItems ?? []).map((x: any) => x.product_id))
          ).filter(Boolean);

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

          (monthItems ?? []).forEach((r: any) => {
            const q = Number(r.received_qty ?? 0);
            const p = Number(r.unit_price_cents ?? 0);
            const name = nameById[r.product_id] ?? "Prodotto";

            monthQty += q;
            monthCents += q * p;
            monthByProduct[name] = (monthByProduct[name] ?? 0) + q;
          });
        }

        if (!alive) return;

        setRows(viewRows);
        setDayTotals({ qty: dayQty, cents: dayCents, byProduct: dayByProduct });
        setMonthTotals({ qty: monthQty, cents: monthCents, byProduct: monthByProduct });
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
    const map = new Map<string, { name: string; qty: number; cents: number }>();

    for (const r of rows) {
      const name = r.product_name;
      const qty = Number(r.received_qty ?? 0);
      const price = Number(r.unit_price_cents ?? 0);
      const cents = price * qty;

      const prev = map.get(name);
      if (!prev) map.set(name, { name, qty, cents });
      else map.set(name, { name, qty: prev.qty + qty, cents: prev.cents + cents });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

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

        {loading && <div className="muted" style={{ padding: "10px 0" }}>Caricamento…</div>}
        {err && <div className="noticeErr">Errore ✖ — {err}</div>}

        {!loading && !err && (
          <>
            {/* ===== DETTAGLIO GIORNO ===== */}
            {byProduct.map((p) => (
              <div key={p.name} className="row" style={{ padding: "10px 0" }}>
                <div className="rowLeft">
                  <div style={{ fontWeight: 900, fontSize: 26 }}>{p.name}</div>
                  <div className="muted" style={{ fontWeight: 900 }}>
                    Pezzi: {p.qty}
                  </div>
                </div>
                <div style={{ fontWeight: 900, fontSize: 28 }}>
                  {formatEurFromCents(p.cents)}
                </div>
              </div>
            ))}

            <hr />

            {/* ===== TOTALE GIORNO ===== */}
            <div className="row">
              <div className="rowLeft">
                <div style={{ fontWeight: 900, fontSize: 24 }}>Totale giorno</div>
                <div className="muted">
                  {Object.entries(dayTotals.byProduct).map(([k, v]) => (
                    <div key={k}>
                      {k}: {v}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 30 }}>
                {formatEurFromCents(dayTotals.cents)}
              </div>
            </div>

            <hr />

            {/* ===== TOTALE MESE ===== */}
            <div className="row">
              <div className="rowLeft">
                <div style={{ fontWeight: 900, fontSize: 26 }}>
                  Totale mese ({dayjs(date).format("MMMM YYYY")})
                </div>
                <div className="muted">
                  {Object.entries(monthTotals.byProduct).map(([k, v]) => (
                    <div key={k}>
                      {k}: {v}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 32 }}>
                {formatEurFromCents(monthTotals.cents)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
