import { useEffect, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../lib/supabase";
import { formatEurFromCents } from "../lib/prices";

type Totals = {
  qty: number;
  cents: number;
};

export default function Summary() {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [dayTotals, setDayTotals] = useState<Totals>({ qty: 0, cents: 0 });
  const [monthTotals, setMonthTotals] = useState<Totals>({ qty: 0, cents: 0 });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function load(d: string) {
      setLoading(true);
      setErr(null);

      try {
        /* =======================
           TOTALE GIORNO
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

        if (deliveryId) {
          const { data: items, error: itErr } = await supabase
            .from("delivery_items")
            .select("received_qty,unit_price_cents")
            .eq("delivery_id", deliveryId);

          if (itErr) throw itErr;

          (items ?? []).forEach((r: any) => {
            const q = Number(r.received_qty ?? 0);
            const p = Number(r.unit_price_cents ?? 0);
            dayQty += q;
            dayCents += q * p;
          });
        }

        if (alive) setDayTotals({ qty: dayQty, cents: dayCents });

        /* =======================
           TOTALE MESE
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

        if (monthIds.length > 0) {
          const { data: monthItems, error: mItErr } = await supabase
            .from("delivery_items")
            .select("received_qty,unit_price_cents")
            .in("delivery_id", monthIds);

          if (mItErr) throw mItErr;

          (monthItems ?? []).forEach((r: any) => {
            const q = Number(r.received_qty ?? 0);
            const p = Number(r.unit_price_cents ?? 0);
            monthQty += q;
            monthCents += q * p;
          });
        }

        if (alive) setMonthTotals({ qty: monthQty, cents: monthCents });
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

        {err && <div className="noticeErr">Errore caricamento ✖ — {err}</div>}

        {!loading && !err && (
          <>
            {/* ===== TOTALE GIORNO ===== */}
            <div className="row" style={{ marginTop: 16 }}>
              <div className="rowLeft">
                <div style={{ fontWeight: 900, fontSize: 26 }}>Totale giorno</div>
                <div className="muted" style={{ fontWeight: 900 }}>
                  Pezzi: {dayTotals.qty}
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
                <div className="muted" style={{ fontWeight: 900 }}>
                  Pezzi: {monthTotals.qty}
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
