import { useEffect, useMemo, useState } from "react";
import dayjs from "../lib/dayjsIt";
import { supabase } from "../lib/supabase";
import { formatEurFromCents } from "../lib/prices";

type DeliveryRow = {
  id: string;
  delivery_date: string;
};

type ItemRow = {
  delivery_id: string;
  product_id: string;
  received_qty: number | null;
  unit_price_cents: number | null;
};

type ProductRow = {
  id: string;
  name: string;
};

type TotRow = {
  id: string;
  name: string;
  qty: number;
  cents: number;
};

type DayTotals = { qty: number; cents: number };

type CatKey = "Farcite" | "Vuote" | "Krapfen" | "Pizzette" | "Focaccine" | "Trancio focaccia";
type CatTot = { key: CatKey; qty: number; cents: number };

function categoryOfProductName(name: string): CatKey | null {
  const n = (name ?? "").trim();
  if (n.startsWith("Farcite -")) return "Farcite";
  if (n === "Vuote") return "Vuote";
  if (n === "Krapfen") return "Krapfen";
  if (n === "Pizzette") return "Pizzette";
  if (n === "Focaccine") return "Focaccine";
  if (n === "Trancio focaccia") return "Trancio focaccia";
  return null;
}

export default function Summary() {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const [date, setDate] = useState<string>(today);
  const [month, setMonth] = useState<string>(dayjs(today).format("YYYY-MM"));

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // dati mese
  const [monthByProduct, setMonthByProduct] = useState<TotRow[]>([]);
  const [monthTotals, setMonthTotals] = useState<DayTotals>({ qty: 0, cents: 0 });

  // totali mese per categoria
  const [monthByCategory, setMonthByCategory] = useState<CatTot[]>([]);

  // dati giorno (derivati dal mese)
  const [dayByProduct, setDayByProduct] = useState<TotRow[]>([]);
  const [dayTotals, setDayTotals] = useState<DayTotals>({ qty: 0, cents: 0 });

  // mappa interna: date -> TotRow[]
  const [dayMap, setDayMap] = useState<Record<string, TotRow[]>>({});
  const [dayTotalsMap, setDayTotalsMap] = useState<Record<string, DayTotals>>({});

  useEffect(() => {
    const m = dayjs(date).format("YYYY-MM");
    if (m !== month) setMonth(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    let alive = true;

    async function loadMonth(m: string) {
      setLoading(true);
      setErr(null);

      try {
        const start = dayjs(`${m}-01`).startOf("month").format("YYYY-MM-DD");
        const end = dayjs(`${m}-01`).add(1, "month").startOf("month").format("YYYY-MM-DD");

        const { data: delData, error: delErr } = await supabase
          .from("deliveries")
          .select("id,delivery_date")
          .gte("delivery_date", start)
          .lt("delivery_date", end);

        if (delErr) throw delErr;

        const delivs = (delData ?? []) as DeliveryRow[];
        const deliveryIds = delivs.map((d) => d.id);

        const dateByDeliveryId: Record<string, string> = {};
        delivs.forEach((d) => {
          dateByDeliveryId[d.id] = d.delivery_date;
        });

        let items: ItemRow[] = [];
        if (deliveryIds.length > 0) {
          const { data: itData, error: itErr } = await supabase
            .from("delivery_items")
            .select("delivery_id,product_id,received_qty,unit_price_cents")
            .in("delivery_id", deliveryIds);

          if (itErr) throw itErr;
          items = (itData ?? []) as ItemRow[];
        }

        const productIds = Array.from(new Set(items.map((x) => x.product_id))).filter(Boolean);

        const nameById: Record<string, string> = {};
        if (productIds.length > 0) {
          const { data: pData, error: pErr } = await supabase
            .from("products")
            .select("id,name")
            .in("id", productIds);

          if (pErr) throw pErr;

          (pData ?? []).forEach((p: ProductRow) => {
            nameById[p.id] = p.name;
          });
        }

        const monthMap = new Map<string, TotRow>();
        const dMap: Record<string, Map<string, TotRow>> = {};
        const dTotals: Record<string, DayTotals> = {};

        for (const it of items) {
          const d = dateByDeliveryId[it.delivery_id];
          if (!d) continue;

          const id = it.product_id;
          const name = nameById[id] ?? "Prodotto";
          const qty = Number(it.received_qty ?? 0);
          const price = Number(it.unit_price_cents ?? 0);
          const cents = qty * price;

          const prevM = monthMap.get(id);
          if (!prevM) monthMap.set(id, { id, name, qty, cents });
          else monthMap.set(id, { ...prevM, qty: prevM.qty + qty, cents: prevM.cents + cents });

          if (!dMap[d]) dMap[d] = new Map<string, TotRow>();
          const mp = dMap[d];

          const prevD = mp.get(id);
          if (!prevD) mp.set(id, { id, name, qty, cents });
          else mp.set(id, { ...prevD, qty: prevD.qty + qty, cents: prevD.cents + cents });

          if (!dTotals[d]) dTotals[d] = { qty: 0, cents: 0 };
          dTotals[d] = { qty: dTotals[d].qty + qty, cents: dTotals[d].cents + cents };
        }

        const monthArr = Array.from(monthMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        const monthTot: DayTotals = monthArr.reduce(
          (acc, r) => ({ qty: acc.qty + r.qty, cents: acc.cents + r.cents }),
          { qty: 0, cents: 0 }
        );

        const dayMapOut: Record<string, TotRow[]> = {};
        for (const d of Object.keys(dMap)) {
          dayMapOut[d] = Array.from(dMap[d].values()).sort((a, b) => a.name.localeCompare(b.name));
        }

        // ✅ totali mese per categoria
        const catInit: Record<CatKey, CatTot> = {
          Farcite: { key: "Farcite", qty: 0, cents: 0 },
          Vuote: { key: "Vuote", qty: 0, cents: 0 },
          Krapfen: { key: "Krapfen", qty: 0, cents: 0 },
          Pizzette: { key: "Pizzette", qty: 0, cents: 0 },
          Focaccine: { key: "Focaccine", qty: 0, cents: 0 },
          "Trancio focaccia": { key: "Trancio focaccia", qty: 0, cents: 0 },
        };

        for (const r of monthArr) {
          const cat = categoryOfProductName(r.name);
          if (!cat) continue;
          catInit[cat] = {
            key: cat,
            qty: catInit[cat].qty + r.qty,
            cents: catInit[cat].cents + r.cents,
          };
        }

        const catOrder: CatKey[] = [
          "Farcite",
          "Vuote",
          "Krapfen",
          "Pizzette",
          "Focaccine",
          "Trancio focaccia",
        ];

        const catArr = catOrder.map((k) => catInit[k]);

        if (!alive) return;

        setMonthByProduct(monthArr);
        setMonthTotals(monthTot);
        setMonthByCategory(catArr);

        setDayMap(dayMapOut);
        setDayTotalsMap(dTotals);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Errore caricamento riepilogo");
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadMonth(month);

    return () => {
      alive = false;
    };
  }, [month]);

  useEffect(() => {
    const dayRows = dayMap[date] ?? [];
    const tot = dayTotalsMap[date] ?? { qty: 0, cents: 0 };
    setDayByProduct(dayRows);
    setDayTotals(tot);
  }, [date, dayMap, dayTotalsMap]);

  const monthLabel = useMemo(() => dayjs(`${month}-01`).format("MMMM YYYY"), [month]);

  return (
    <div className="fiuriContainer">
      <h1 className="fiuriTitle">Riepilogo</h1>

      <div className="fiuriCard" style={{ marginTop: 12 }}>
        <div className="row" style={{ alignItems: "center" }}>
          <div className="rowLeft">
            <div style={{ fontWeight: 900 }}>Mese</div>
            <div className="muted" style={{ fontWeight: 900, textTransform: "capitalize" }}>
              {monthLabel}
            </div>
          </div>

          <input
            className="input"
            type="month"
            value={month}
            onChange={(e) => {
              const m = e.target.value;
              setMonth(m);
              setDate(dayjs(`${m}-01`).format("YYYY-MM-DD"));
            }}
          />
        </div>

        <div style={{ height: 10 }} />

        <div className="row" style={{ alignItems: "center" }}>
          <div className="rowLeft">
            <div style={{ fontWeight: 900 }}>Giorno</div>
            <div className="muted" style={{ fontWeight: 900 }}>
              {dayjs(date).format("DD/MM/YYYY")}
            </div>
          </div>

          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        {loading && (
          <div style={{ padding: "10px 0", fontWeight: 900, color: "#6b7280" }}>Caricamento...</div>
        )}

        {err && <div className="noticeErr">Errore caricamento riepilogo ✖ — {err}</div>}

        {!loading && !err && (
          <>
            {/* TOTALI GIORNO */}
            <div style={{ height: 12 }} />
            <div className="row" style={{ paddingTop: 6 }}>
              <div className="rowLeft">
                <div style={{ fontWeight: 900, fontSize: 22 }}>Totale giorno</div>
                <div className="muted" style={{ fontWeight: 900 }}>Pezzi: {dayTotals.qty}</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 26 }}>{formatEurFromCents(dayTotals.cents)}</div>
            </div>

            <hr />

            {/* DETTAGLIO GIORNO */}
            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 10 }}>Dettaglio giorno</div>

            {dayByProduct.length === 0 ? (
              <div style={{ padding: "10px 0", fontWeight: 900, color: "#6b7280" }}>
                Nessun dato per questa data
              </div>
            ) : (
              dayByProduct.map((p) => (
                <div key={p.id} className="row" style={{ padding: "10px 0" }}>
                  <div className="rowLeft">
                    <div style={{ fontWeight: 900, fontSize: 22 }}>{p.name}</div>
                    <div className="muted" style={{ fontWeight: 900 }}>Pezzi: {p.qty}</div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 24 }}>{formatEurFromCents(p.cents)}</div>
                </div>
              ))
            )}

            <hr />

            {/* TOTALI MESE */}
            <div className="row" style={{ paddingTop: 6 }}>
              <div className="rowLeft">
                <div style={{ fontWeight: 900, fontSize: 24 }}>Totale mese</div>
                <div className="muted" style={{ fontWeight: 900 }}>Pezzi: {monthTotals.qty}</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 28 }}>{formatEurFromCents(monthTotals.cents)}</div>
            </div>

            <hr />

            {/* ✅ TOTALI MESE PER CATEGORIA */}
            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 10 }}>Totali mese per categoria</div>

            {monthByCategory.map((c) => (
              <div key={c.key} className="row" style={{ padding: "10px 0" }}>
                <div className="rowLeft">
                  <div style={{ fontWeight: 900, fontSize: 22 }}>{c.key}</div>
                  <div className="muted" style={{ fontWeight: 900 }}>Pezzi: {c.qty}</div>
                </div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>{formatEurFromCents(c.cents)}</div>
              </div>
            ))}

            <hr />

            {/* DETTAGLIO MESE */}
            <div style={{ fontWeight: 900, fontSize: 18, marginTop: 10 }}>Dettaglio mese</div>

            {monthByProduct.length === 0 ? (
              <div style={{ padding: "10px 0", fontWeight: 900, color: "#6b7280" }}>
                Nessun dato per questo mese
              </div>
            ) : (
              monthByProduct.map((p) => (
                <div key={p.id} className="row" style={{ padding: "10px 0" }}>
                  <div className="rowLeft">
                    <div style={{ fontWeight: 900, fontSize: 22 }}>{p.name}</div>
                    <div className="muted" style={{ fontWeight: 900 }}>Pezzi: {p.qty}</div>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: 24 }}>{formatEurFromCents(p.cents)}</div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
