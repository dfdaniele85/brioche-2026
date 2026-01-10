import { useEffect, useMemo, useState } from "react";
import dayjs from "../lib/dayjsIt";
import { supabase } from "../lib/supabase";
import { formatEurFromCents } from "../lib/prices";

type DeliveryRow = { id: string; delivery_date: string };
type ItemRow = {
  delivery_id: string;
  product_id: string;
  received_qty: number | null;
  unit_price_cents: number | null;
};
type ProductRow = { id: string; name: string };

type TotRow = { id: string; name: string; qty: number; cents: number };
type Totals = { qty: number; cents: number };

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

const CAT_ORDER: CatKey[] = ["Farcite", "Vuote", "Krapfen", "Pizzette", "Focaccine", "Trancio focaccia"];

function sumTotals(rows: TotRow[]): Totals {
  return rows.reduce((acc, r) => ({ qty: acc.qty + r.qty, cents: acc.cents + r.cents }), { qty: 0, cents: 0 });
}

function buildCategoryTotals(monthRows: TotRow[]): CatTot[] {
  const init: Record<CatKey, CatTot> = {
    Farcite: { key: "Farcite", qty: 0, cents: 0 },
    Vuote: { key: "Vuote", qty: 0, cents: 0 },
    Krapfen: { key: "Krapfen", qty: 0, cents: 0 },
    Pizzette: { key: "Pizzette", qty: 0, cents: 0 },
    Focaccine: { key: "Focaccine", qty: 0, cents: 0 },
    "Trancio focaccia": { key: "Trancio focaccia", qty: 0, cents: 0 },
  };

  for (const r of monthRows) {
    const cat = categoryOfProductName(r.name);
    if (!cat) continue;
    init[cat] = { key: cat, qty: init[cat].qty + r.qty, cents: init[cat].cents + r.cents };
  }

  return CAT_ORDER.map((k) => init[k]);
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fiuriCard" style={{ borderRadius: 14, padding: 14 }}>
      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="fiuriCard" style={{ borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 4 }}>
      <div className="muted" style={{ fontWeight: 900, fontSize: 12 }}>{label}</div>
      <div style={{ fontWeight: 900, fontSize: 22, lineHeight: 1.15 }}>{value}</div>
      {sub ? <div className="muted" style={{ fontWeight: 900, fontSize: 12 }}>{sub}</div> : null}
    </div>
  );
}

function Line({ left, right, subLeft }: { left: string; right: string; subLeft?: string }) {
  return (
    <div className="row" style={{ padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
      <div className="rowLeft">
        <div style={{ fontWeight: 900, fontSize: 14 }}>{left}</div>
        {subLeft ? <div className="muted" style={{ fontWeight: 900, fontSize: 12 }}>{subLeft}</div> : null}
      </div>
      <div style={{ fontWeight: 900, fontSize: 14, whiteSpace: "nowrap" }}>{right}</div>
    </div>
  );
}

function csvEscape(s: string) {
  const v = (s ?? "").replace(/"/g, '""');
  return `"${v}"`;
}

function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function Summary() {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const [date, setDate] = useState<string>(today);
  const [month, setMonth] = useState<string>(dayjs(today).format("YYYY-MM"));

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [dayOpen, setDayOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);

  const [monthByProduct, setMonthByProduct] = useState<TotRow[]>([]);
  const [monthTotals, setMonthTotals] = useState<Totals>({ qty: 0, cents: 0 });
  const [monthByCategory, setMonthByCategory] = useState<CatTot[]>([]);

  const [dayByProduct, setDayByProduct] = useState<TotRow[]>([]);
  const [dayTotals, setDayTotals] = useState<Totals>({ qty: 0, cents: 0 });

  const [dayMap, setDayMap] = useState<Record<string, TotRow[]>>({});
  const [dayTotalsMap, setDayTotalsMap] = useState<Record<string, Totals>>({});

  // ✅ dati grezzi per export
  const [exportRows, setExportRows] = useState<
    { date: string; category: string; product: string; qty: number; unit_price_cents: number; row_total_cents: number }[]
  >([]);

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
        delivs.forEach((d) => (dateByDeliveryId[d.id] = d.delivery_date));

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
          (pData ?? []).forEach((p: ProductRow) => (nameById[p.id] = p.name));
        }

        const monthMap = new Map<string, TotRow>();
        const dMap: Record<string, Map<string, TotRow>> = {};
        const dTotals: Record<string, Totals> = {};

        // export
        const exp: { date: string; category: string; product: string; qty: number; unit_price_cents: number; row_total_cents: number }[] = [];

        for (const it of items) {
          const d = dateByDeliveryId[it.delivery_id];
          if (!d) continue;

          const id = it.product_id;
          const name = nameById[id] ?? "Prodotto";
          const qty = Number(it.received_qty ?? 0);
          const unit = Number(it.unit_price_cents ?? 0);
          const cents = qty * unit;

          const cat = categoryOfProductName(name) ?? "Altro";

          exp.push({
            date: d,
            category: cat,
            product: name,
            qty,
            unit_price_cents: unit,
            row_total_cents: cents,
          });

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

        exp.sort((a, b) => (a.date === b.date ? a.product.localeCompare(b.product) : a.date.localeCompare(b.date)));

        const monthArr = Array.from(monthMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        const mTot = sumTotals(monthArr);

        const dayMapOut: Record<string, TotRow[]> = {};
        Object.keys(dMap).forEach((d) => {
          dayMapOut[d] = Array.from(dMap[d].values()).sort((a, b) => a.name.localeCompare(b.name));
        });

        const catArr = buildCategoryTotals(monthArr);

        if (!alive) return;

        setMonthByProduct(monthArr);
        setMonthTotals(mTot);
        setMonthByCategory(catArr);

        setDayMap(dayMapOut);
        setDayTotalsMap(dTotals);

        setExportRows(exp);
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
  const dayLabel = useMemo(() => dayjs(date).format("DD/MM/YYYY"), [date]);

  const exportCsv = () => {
    const header = ["data", "categoria", "prodotto", "pezzi", "prezzo_unitario_eur", "totale_riga_eur"].join(",");
    const lines = exportRows.map((r) => {
      const unitEur = (r.unit_price_cents / 100).toFixed(2).replace(".", ",");
      const rowEur = (r.row_total_cents / 100).toFixed(2).replace(".", ",");
      return [
        csvEscape(r.date),
        csvEscape(r.category),
        csvEscape(r.product),
        String(r.qty),
        csvEscape(unitEur),
        csvEscape(rowEur),
      ].join(",");
    });

    const csv = [header, ...lines].join("\n");
    const filename = `brioche-2026_riepilogo_${month}.csv`;
    downloadTextFile(filename, csv);
  };

  return (
    <div className="fiuriContainer">
      <h1 className="fiuriTitle">Riepilogo</h1>

      <div className="fiuriCard" style={{ marginTop: 12, borderRadius: 14, padding: 14 }}>
        {/* Filtri + export */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 180px 1fr 180px",
            gap: 10,
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 13 }}>Mese</div>
            <div className="muted" style={{ fontWeight: 900, fontSize: 12, textTransform: "capitalize" }}>
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

          <div>
            <div style={{ fontWeight: 900, fontSize: 13 }}>Giorno</div>
            <div className="muted" style={{ fontWeight: 900, fontSize: 12 }}>
              {dayLabel}
            </div>
          </div>

          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div style={{ height: 10 }} />

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnPrimary" type="button" onClick={exportCsv} disabled={loading || !!err}>
            Esporta CSV mese
          </button>
        </div>

        <div style={{ height: 10 }} />

        {loading && <div className="muted" style={{ fontWeight: 900 }}>Caricamento...</div>}
        {err && <div className="noticeErr">Errore ✖ — {err}</div>}

        {!loading && !err && (
          <>
            {/* KPI */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              <Kpi label="Totale mese" value={formatEurFromCents(monthTotals.cents)} sub={`Pezzi: ${monthTotals.qty}`} />
              <Kpi label="Totale giorno" value={formatEurFromCents(dayTotals.cents)} sub={`Pezzi: ${dayTotals.qty}`} />
              <Kpi label="Righe export" value={String(exportRows.length)} sub="righe nel CSV" />
            </div>

            <div style={{ height: 12 }} />

            {/* Totali mese per categoria */}
            <Card title="Totali mese per categoria">
              {monthByCategory.map((c, idx) => {
                const last = idx === monthByCategory.length - 1;
                return (
                  <div key={c.key} style={{ borderBottom: last ? "none" : "1px solid rgba(0,0,0,0.06)" }}>
                    <div className="row" style={{ padding: "10px 0" }}>
                      <div className="rowLeft">
                        <div style={{ fontWeight: 900, fontSize: 14 }}>{c.key}</div>
                        <div className="muted" style={{ fontWeight: 900, fontSize: 12 }}>
                          Pezzi: {c.qty}
                        </div>
                      </div>
                      <div style={{ fontWeight: 900, fontSize: 14 }}>{formatEurFromCents(c.cents)}</div>
                    </div>
                  </div>
                );
              })}
            </Card>

            <div style={{ height: 10 }} />

            {/* Dettagli */}
            <div className="accordionItem" style={{ marginBottom: 10 }}>
              <div className="accordionHeader" onClick={() => setDayOpen((v) => !v)}>
                <strong style={{ fontSize: 14 }}>Dettaglio giorno</strong>
                <span className="badge">{dayByProduct.length} voci</span>
              </div>

              {dayOpen ? (
                <div className="accordionBody">
                  <div className="fiuriCard" style={{ borderRadius: 14 }}>
                    {dayByProduct.length === 0 ? (
                      <div className="muted" style={{ fontWeight: 900, padding: "8px 0" }}>
                        Nessun dato per questo giorno
                      </div>
                    ) : (
                      dayByProduct.map((p) => (
                        <Line key={p.id} left={p.name} subLeft={`Pezzi: ${p.qty}`} right={formatEurFromCents(p.cents)} />
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="accordionItem">
              <div className="accordionHeader" onClick={() => setMonthOpen((v) => !v)}>
                <strong style={{ fontSize: 14 }}>Dettaglio mese</strong>
                <span className="badge">{monthByProduct.length} voci</span>
              </div>

              {monthOpen ? (
                <div className="accordionBody">
                  <div className="fiuriCard" style={{ borderRadius: 14 }}>
                    {monthByProduct.length === 0 ? (
                      <div className="muted" style={{ fontWeight: 900, padding: "8px 0" }}>
                        Nessun dato per questo mese
                      </div>
                    ) : (
                      monthByProduct.map((p) => (
                        <Line key={p.id} left={p.name} subLeft={`Pezzi: ${p.qty}`} right={formatEurFromCents(p.cents)} />
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
