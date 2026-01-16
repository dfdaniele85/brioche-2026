import React from "react";
import Topbar from "../components/Topbar";
import { supabase } from "../lib/supabase";
import type {
  WeeklyExpectedRow,
  DeliveryRow,
  DeliveryItemRow,
  PriceSettingRow,
  ProductRow
} from "../lib/supabase";

import { daysInMonth, weekdayIso, formatIsoDate, formatDayRow } from "../lib/date";
import { computeTotalCents, computeTotalPieces, formatEuro } from "../lib/compute";
import { downloadCsv, exportPdfViaPrint } from "../lib/export";

type MonthKey = {
  year: number;
  monthIndex0: number;
};

type LoadState = "loading" | "ready" | "error";

type BucketKey =
  | "Farcite"
  | "Vuote"
  | "Krapfen"
  | "Focaccine"
  | "Pizzette"
  | "Trancio focaccia"
  | "Altro";

const BUCKETS: BucketKey[] = [
  "Farcite",
  "Vuote",
  "Krapfen",
  "Focaccine",
  "Pizzette",
  "Trancio focaccia",
  "Altro"
];

function monthLabel(m: MonthKey): string {
  const dt = new Date(m.year, m.monthIndex0, 1);
  return dt.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Animazione tendina semplice (height misurata) */
function useCollapsible(open: boolean, deps: unknown[] = []) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = React.useState<number>(0);

  React.useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    if (open) {
      const h = el.scrollHeight;
      setHeight(h);
      requestAnimationFrame(() => {
        const hh = el.scrollHeight;
        setHeight(hh);
      });
    } else {
      setHeight(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ...deps]);

  return { innerRef, height };
}

function monthShortLabel(monthIndex0: number) {
  const dt = new Date(2026, monthIndex0, 1);
  return dt.toLocaleDateString("it-IT", { month: "short" }).replace(".", "");
}

function bucketForProduct(p: ProductRow): BucketKey {
  const cat = String(p.category ?? "").toLowerCase();
  const name = String(p.name ?? "").toLowerCase();
  const hay = `${cat} ${name}`;

  if (hay.includes("trancio") && hay.includes("focaccia")) return "Trancio focaccia";
  if (hay.includes("pizzett")) return "Pizzette";
  if (hay.includes("focaccin") || hay.includes("focaccine")) return "Focaccine";
  if (hay.includes("krapfen")) return "Krapfen";
  if (hay.includes("farcit")) return "Farcite";

  if (hay.includes("vuot") || hay.includes("classiche") || hay.includes("semplici")) return "Vuote";

  return "Altro";
}

function emptyBucketMap(): Record<BucketKey, number> {
  return {
    Farcite: 0,
    Vuote: 0,
    Krapfen: 0,
    Focaccine: 0,
    Pizzette: 0,
    "Trancio focaccia": 0,
    Altro: 0
  };
}

async function getUidOrThrow(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const uid = data.session?.user?.id;
  if (!uid) throw new Error("Sessione mancante: fai login e riprova.");
  return uid;
}

export default function Summary(): JSX.Element {
  const now = React.useMemo(() => new Date(), []);
  const [month, setMonth] = React.useState<MonthKey>({
    year: now.getFullYear(),
    monthIndex0: now.getMonth()
  });

  const [loadState, setLoadState] = React.useState<LoadState>("loading");

  const [bucketByProductId, setBucketByProductId] = React.useState<Record<string, BucketKey>>({});

  const [weeklyByWeekday, setWeeklyByWeekday] = React.useState<Record<number, Record<string, number>>>({});
  const [deliveries, setDeliveries] = React.useState<Record<string, DeliveryRow>>({});
  const [itemsByDate, setItemsByDate] = React.useState<Record<string, Record<string, number>>>({});
  const [priceByProductId, setPriceByProductId] = React.useState<Record<string, number>>({});

  // picker mese
  const [isMonthPickerOpen, setIsMonthPickerOpen] = React.useState<boolean>(false);
  const [pickerYear, setPickerYear] = React.useState<number>(() => month.year);
  const monthPickerColl = useCollapsible(isMonthPickerOpen, [pickerYear]);

  // tendina giorni
  const [openIso, setOpenIso] = React.useState<string | null>(null);
  const [dayPanelIso, setDayPanelIso] = React.useState<string | null>(null);
  const [dayPhase, setDayPhase] = React.useState<"closed" | "opening" | "open" | "closing">("closed");
  const [dayHeight, setDayHeight] = React.useState<number>(0);
  const dayInnerRef = React.useRef<HTMLDivElement | null>(null);
  const pendingOpenIsoRef = React.useRef<string | null>(null);

  // PDF: opzionale -> includere anche la tabella giorni
  const [pdfIncludeDays, setPdfIncludeDays] = React.useState<boolean>(false);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const days = daysInMonth(month.year, month.monthIndex0);

  const monthStartIso = formatIsoDate(new Date(month.year, month.monthIndex0, 1));
  const monthEndIsoExclusive = formatIsoDate(new Date(month.year, month.monthIndex0, days + 1));

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadState("loading");

        const uid = await getUidOrThrow();

        const { data: prod, error: prodErr } = await supabase.from("products").select("*");
        if (prodErr) throw prodErr;

        const { data: weekly, error: weeklyErr } = await supabase
          .from("weekly_expected")
          .select("*")
          .eq("owner_id", uid);
        if (weeklyErr) throw weeklyErr;

        const { data: prices, error: priceErr } = await supabase
          .from("price_settings")
          .select("*")
          .eq("owner_id", uid);
        if (priceErr) throw priceErr;

        const { data: dels, error: delErr } = await supabase
          .from("deliveries")
          .select("*")
          .eq("owner_id", uid)
          .gte("delivery_date", monthStartIso)
          .lt("delivery_date", monthEndIsoExclusive);
        if (delErr) throw delErr;

        const delMap: Record<string, DeliveryRow> = {};
        (dels ?? []).forEach((d) => {
          delMap[d.delivery_date] = d;
        });

        const delIds = (dels ?? []).map((d) => d.id);
        let items: DeliveryItemRow[] = [];

        if (delIds.length) {
          const { data: itData, error: itErr } = await supabase
            .from("delivery_items")
            .select("*")
            .in("delivery_id", delIds);
          if (itErr) throw itErr;
          items = itData ?? [];
        }

        if (cancelled) return;

        const prods = (prod ?? []) as ProductRow[];
        const bucketMap: Record<string, BucketKey> = {};
        prods.forEach((p) => {
          bucketMap[p.id] = bucketForProduct(p);
        });
        setBucketByProductId(bucketMap);

        const wk: Record<number, Record<string, number>> = {};
        for (let i = 1; i <= 7; i++) wk[i] = {};
        (weekly ?? []).forEach((r: WeeklyExpectedRow) => {
          wk[r.weekday][r.product_id] = r.expected_qty;
        });

        const priceMap: Record<string, number> = {};
        (prices ?? []).forEach((p: PriceSettingRow) => {
          priceMap[p.product_id] = p.price_cents;
        });

        const idToDate: Record<string, string> = {};
        (dels ?? []).forEach((d) => {
          idToDate[d.id] = d.delivery_date;
        });

        const itMap: Record<string, Record<string, number>> = {};
        items.forEach((it) => {
          const date = idToDate[it.delivery_id];
          if (!date) return;
          if (!itMap[date]) itMap[date] = {};
          itMap[date][it.product_id] = it.received_qty;
        });

        setWeeklyByWeekday(wk);
        setDeliveries(delMap);
        setItemsByDate(itMap);
        setPriceByProductId(priceMap);

        setLoadState("ready");
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoadState("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [monthStartIso, monthEndIsoExclusive]);

  function bucketize(qtyByProductId: Record<string, number>): {
    piecesByBucket: Record<BucketKey, number>;
    centsByBucket: Record<BucketKey, number>;
  } {
    const piecesByBucket = emptyBucketMap();
    const centsByBucket = emptyBucketMap();

    for (const [productId, qty] of Object.entries(qtyByProductId ?? {})) {
      const n = Number(qty ?? 0);
      if (!Number.isFinite(n) || n <= 0) continue;

      const b: BucketKey = bucketByProductId[productId] ?? "Altro";
      piecesByBucket[b] += n;

      const price = priceByProductId[productId] ?? 0;
      centsByBucket[b] += n * price;
    }

    return { piecesByBucket, centsByBucket };
  }

  function computeDay(iso: string): {
    pieces: number;
    cents: number;
    status: "Preset" | "Salvato" | "Chiuso";
    piecesByBucket: Record<BucketKey, number>;
    centsByBucket: Record<BucketKey, number>;
  } {
    const del = deliveries[iso];
    if (del) {
      if (del.is_closed) {
        return {
          pieces: 0,
          cents: 0,
          status: "Chiuso",
          piecesByBucket: emptyBucketMap(),
          centsByBucket: emptyBucketMap()
        };
      }
      const recv = itemsByDate[iso] ?? {};
      const pieces = computeTotalPieces(recv);
      const cents = computeTotalCents(recv, priceByProductId);
      const b = bucketize(recv);
      return { pieces, cents, status: "Salvato", ...b };
    }

    const dt = new Date(iso + "T00:00:00");
    const w = weekdayIso(dt);
    const exp = weeklyByWeekday[w] ?? {};

    const pieces = computeTotalPieces(exp);
    const cents = computeTotalCents(exp, priceByProductId);
    const b = bucketize(exp);

    return { pieces, cents, status: "Preset", ...b };
  }

  const rows = React.useMemo(() => {
    const out: Array<{
      iso: string;
      label: string;
      status: "Preset" | "Salvato" | "Chiuso";
      pieces: number;
      cents: number;
      piecesByBucket: Record<BucketKey, number>;
      centsByBucket: Record<BucketKey, number>;
    }> = [];

    for (let d = 1; d <= days; d++) {
      const dt = new Date(month.year, month.monthIndex0, d);
      const iso = formatIsoDate(dt);
      const label = formatDayRow(dt);
      const t = computeDay(iso);
      out.push({
        iso,
        label,
        status: t.status,
        pieces: t.pieces,
        cents: t.cents,
        piecesByBucket: t.piecesByBucket,
        centsByBucket: t.centsByBucket
      });
    }
    return out;
  }, [
    days,
    month.year,
    month.monthIndex0,
    deliveries,
    itemsByDate,
    weeklyByWeekday,
    priceByProductId,
    bucketByProductId
  ]);

  const kpis = React.useMemo(() => {
    let openDays = 0;
    let closedDays = 0;
    let totalPieces = 0;
    let totalCents = 0;

    const monthPiecesByBucket = emptyBucketMap();
    const monthCentsByBucket = emptyBucketMap();

    for (const r of rows) {
      if (r.status === "Chiuso") closedDays += 1;
      else openDays += 1;

      totalPieces += r.pieces;
      totalCents += r.cents;

      for (const b of BUCKETS) {
        monthPiecesByBucket[b] += r.piecesByBucket[b] ?? 0;
        monthCentsByBucket[b] += r.centsByBucket[b] ?? 0;
      }
    }

    const avgPieces = openDays > 0 ? Math.round((totalPieces / openDays) * 10) / 10 : 0;

    return {
      openDays,
      closedDays,
      totalPieces,
      totalCents,
      avgPieces,
      monthPiecesByBucket,
      monthCentsByBucket
    };
  }, [rows]);

  function exportCsv() {
    const header = ["Data", "Stato", "Pezzi", "Euro"].join(",");

    const lines = rows.map((r) => {
      const euro = (r.cents / 100).toFixed(2).replace(".", ",");
      return [escapeCsv(r.iso), escapeCsv(r.status), String(r.pieces), escapeCsv(euro)].join(",");
    });

    const csv = [header, ...lines].join("\n");
    const filename = `brioche-${month.year}-${String(month.monthIndex0 + 1).padStart(2, "0")}.csv`;

    downloadCsv(filename, csv);
  }

  function exportPdf() {
    exportPdfViaPrint({ title: `Brioche ${monthLabel(month)}` });
  }

  function toggleMonthPicker() {
    setIsMonthPickerOpen((v) => {
      const next = !v;
      if (next) setPickerYear(month.year);
      return next;
    });
  }

  function closeDayPanelHard() {
    pendingOpenIsoRef.current = null;
    setOpenIso(null);
    setDayPanelIso(null);
    setDayPhase("closed");
    setDayHeight(0);
  }

  function selectMonth(year: number, monthIndex0: number) {
    closeDayPanelHard();
    setMonth({ year, monthIndex0 });
    setIsMonthPickerOpen(false);
  }

  // ===== Day panel animation =====
  function beginOpenDay() {
    setDayPhase("opening");
    setDayHeight(0);
    requestAnimationFrame(() => {
      const el = dayInnerRef.current;
      const h = el ? el.scrollHeight : 0;
      setDayHeight(h);
      requestAnimationFrame(() => setDayPhase("open"));
    });
  }

  function beginCloseDay() {
    if (!dayPanelIso) return;
    const el = dayInnerRef.current;
    const h = el ? el.scrollHeight : dayHeight;
    setDayPhase("closing");
    setDayHeight(h);
    requestAnimationFrame(() => setDayHeight(0));
  }

  function startCloseDay() {
    pendingOpenIsoRef.current = null;
    beginCloseDay();
  }

  function openOrToggleDay(iso: string) {
    if (openIso === iso) {
      startCloseDay();
      return;
    }

    if (dayPanelIso && dayPanelIso !== iso) {
      pendingOpenIsoRef.current = iso;
      setOpenIso(iso);
      beginCloseDay();
      return;
    }

    pendingOpenIsoRef.current = null;
    setOpenIso(iso);
    setDayPanelIso(iso);
    beginOpenDay();
  }

  function onDayTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.currentTarget !== e.target) return;
    if (e.propertyName !== "height") return;

    if (dayPhase !== "closing") return;

    const nextIso = pendingOpenIsoRef.current;
    pendingOpenIsoRef.current = null;

    if (nextIso) {
      setDayPanelIso(nextIso);
      setOpenIso(nextIso);
      beginOpenDay();
      return;
    }

    setOpenIso(null);
    setDayPanelIso(null);
    setDayPhase("closed");
    setDayHeight(0);
  }

  const dayPanelStyle: React.CSSProperties = {
    overflow: "hidden",
    height: dayPhase === "closed" ? 0 : dayHeight,
    opacity: dayPhase === "open" ? 1 : 0,
    transform: dayPhase === "open" ? "translateY(0)" : "translateY(-4px)",
    transition: prefersReducedMotion
      ? "none"
      : "height 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms ease, transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    willChange: "height, opacity, transform"
  };

  const monthPickerStyle: React.CSSProperties = {
    overflow: "hidden",
    height: isMonthPickerOpen ? monthPickerColl.height : 0,
    opacity: isMonthPickerOpen ? 1 : 0,
    transform: isMonthPickerOpen ? "translateY(0)" : "translateY(-4px)",
    transition: prefersReducedMotion
      ? "none"
      : "height 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms ease, transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    willChange: "height, opacity, transform"
  };

  // Print info
  const printTitle = `Brioche ${monthLabel(month)}`;
  const generatedAt = new Date().toLocaleString("it-IT");

  if (loadState === "loading") {
    return (
      <>
        <Topbar title="Riepilogo" subtitle="Caricamento…" />
        <div className="container">Caricamento…</div>
      </>
    );
  }

  if (loadState === "error") {
    return (
      <>
        <Topbar title="Riepilogo" subtitle="Errore" />
        <div className="container">Errore di caricamento</div>
      </>
    );
  }

  return (
    <>
      <style>{`
        /* =========================
           PRINT: 1 pagina pulita
           ========================= */
        @media print {
          @page { size: A4; margin: 10mm; }

          .noPrint { display: none !important; }
          .printOnly { display: block !important; }
          body { background: #fff !important; }
          #root { min-height: auto !important; }
          .container { max-width: none !important; padding: 0 !important; }

          .card { box-shadow: none !important; background: #fff !important; border: none !important; }
          .cardInner { padding: 0 !important; }

          .printPage {
            page-break-inside: avoid;
            break-inside: avoid;
            overflow: hidden;
          }

          .printScale {
            transform: scale(0.95);
            transform-origin: top left;
            width: 105.3%;
          }

          .printHeader { display:flex; justify-content:space-between; align-items:flex-end; gap:12px; margin-bottom: 10px; }
          .printTitle { font-size: 18px; font-weight: 900; }
          .printSub { font-size: 11px; opacity: .75; }

          .printGrid { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
          .printBox { border: 1px solid #ddd; border-radius: 10px; padding: 10px; }
          .printBoxTitle { font-weight: 900; margin-bottom: 6px; }

          .printBadges { display:flex; flex-wrap:wrap; gap:6px; }
          .printBadge { border: 1px solid #ddd; border-radius: 999px; padding: 4px 8px; font-weight: 700; font-size: 11px; }

          .printLegendGrid { display:grid; grid-template-columns: 1fr 1fr; gap: 6px 10px; margin-top: 6px; }
          .printLegendRow { display:flex; justify-content:space-between; gap:10px; font-size: 11px; }
          .printLegendLabel { font-weight: 800; }
          .printLegendValue { font-variant-numeric: tabular-nums; }

          table.printTable { width:100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
          table.printTable th, table.printTable td { border: 1px solid #ddd; padding: 5px 7px; }
          table.printTable th { background: #f7f7f7; text-align:left; }
        }
        .printOnly { display:none; }
      `}</style>

      <Topbar
        title="Riepilogo"
        subtitle={monthLabel(month)}
        right={
          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button type="button" className="btn btnGhost btnSmall" onClick={toggleMonthPicker}>
              Mese
            </button>

            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={() => setPdfIncludeDays((v) => !v)}
              title="Se acceso, nel PDF stampa anche la tabella giorni (può andare su 2 pagine)"
            >
              PDF giorni: {pdfIncludeDays ? "ON" : "OFF"}
            </button>

            <button type="button" className="btn btnSmall btnExportCsv" onClick={exportCsv}>
              Esporta CSV
            </button>

            <button type="button" className="btn btnSmall btnExportPdf" onClick={exportPdf}>
              Esporta PDF
            </button>
          </div>
        }
      />

      {/* PRINT ONLY */}
      <div className="printOnly">
        <div className="container">
          <div className="printPage printScale">
            <div className="printHeader">
              <div>
                <div className="printTitle">{printTitle}</div>
                <div className="printSub">Generato: {generatedAt}</div>
              </div>
              <div className="printSub">
                Pezzi totali: <strong>{kpis.totalPieces}</strong> · Totale: <strong>{formatEuro(kpis.totalCents)}</strong>
              </div>
            </div>

            <div className="printGrid">
              <div className="printBox">
                <div className="printBoxTitle">Giorni</div>
                <div className="printBadges">
                  <span className="printBadge">Aperti: {kpis.openDays}</span>
                  <span className="printBadge">Chiusi: {kpis.closedDays}</span>
                  <span className="printBadge">Media pezzi/giorno: {kpis.avgPieces}</span>
                </div>
                <div className="printSub" style={{ marginTop: 8 }}>
                  “Preset” = valori da Impostazioni · “Salvato” = delivery del giorno
                </div>
              </div>

              <div className="printBox">
                <div className="printBoxTitle">Legenda pezzi (mese)</div>

                <div className="printLegendGrid">
                  {BUCKETS.filter((b) => (kpis.monthPiecesByBucket[b] ?? 0) > 0).map((b) => (
                    <div key={b} className="printLegendRow">
                      <span className="printLegendLabel">{b}</span>
                      <span className="printLegendValue">{kpis.monthPiecesByBucket[b]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {pdfIncludeDays ? (
              <table className="printTable">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Stato</th>
                    <th style={{ width: 90 }}>Pezzi</th>
                    <th style={{ width: 120 }}>Euro</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.iso}>
                      <td>{r.label}</td>
                      <td>{r.status}</td>
                      <td style={{ textAlign: "right" }}>{r.pieces}</td>
                      <td style={{ textAlign: "right" }}>{formatEuro(r.cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      </div>

      {/* UI */}
      <div className="container stack noPrint" style={{ paddingBottom: 16 }}>
        <div className="card">
          <button
            type="button"
            className="listRow"
            onClick={toggleMonthPicker}
            aria-expanded={isMonthPickerOpen}
            style={{ width: "100%" }}
          >
            <div>
              <div style={{ fontWeight: 900 }}>Mese</div>
              <div className="subtle">{monthLabel(month)}</div>
            </div>
            <div className="subtle" style={{ fontWeight: 800 }}>
              {isMonthPickerOpen ? "Nascondi" : "Scegli"}
            </div>
          </button>

          <div style={monthPickerStyle}>
            <div ref={monthPickerColl.innerRef} className="cardInner stack">
              <div className="rowBetween" style={{ gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900 }}>Anno {pickerYear}</div>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    type="button"
                    className="btn btnGhost btnSmall"
                    onClick={() => setPickerYear((y) => y - 1)}
                    aria-label="Anno precedente"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    className="btn btnGhost btnSmall"
                    onClick={() => setPickerYear((y) => y + 1)}
                    aria-label="Anno successivo"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    className="btn btnGhost btnSmall"
                    onClick={() => {
                      closeDayPanelHard();
                      const n = new Date();
                      setMonth({ year: n.getFullYear(), monthIndex0: n.getMonth() });
                      setIsMonthPickerOpen(false);
                    }}
                  >
                    Oggi
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
                {Array.from({ length: 12 }).map((_, mIdx) => {
                  const active = pickerYear === month.year && mIdx === month.monthIndex0;
                  return (
                    <button
                      key={mIdx}
                      type="button"
                      className={`btn btnSmall ${active ? "btnPrimary" : "btnGhost"}`}
                      onClick={() => selectMonth(pickerYear, mIdx)}
                      style={{ justifyContent: "center" as const }}
                    >
                      {monthShortLabel(mIdx)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardInner stack">
            <div className="rowBetween" style={{ flexWrap: "wrap", gap: 10 }}>
              <div className="pill pillOk">Giorni aperti: {kpis.openDays}</div>
              <div className="pill pillWarn">Giorni chiusi: {kpis.closedDays}</div>
            </div>

            <div className="rowBetween" style={{ flexWrap: "wrap", gap: 10 }}>
              <div className="pill">Pezzi totali: {kpis.totalPieces}</div>
              <div className="pill">{formatEuro(kpis.totalCents)}</div>
            </div>

            <div className="subtle">Media pezzi/giorno (solo giorni aperti): {kpis.avgPieces}</div>

            <div className="card" style={{ boxShadow: "none" }}>
              <div className="cardInner">
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Legenda pezzi (mese)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {BUCKETS.filter((b) => (kpis.monthPiecesByBucket[b] ?? 0) > 0).map((b) => (
                    <div key={b} className="pill">
                      {b}: <strong>{kpis.monthPiecesByBucket[b]}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardInner list">
            {rows.map((r) => {
              const isOpen = dayPanelIso === r.iso;
              return (
                <div key={r.iso} style={{ display: "flex", flexDirection: "column" }}>
                  <button
                    type="button"
                    className={`listRow ${isOpen ? "listRowSelected" : ""}`}
                    onClick={() => openOrToggleDay(r.iso)}
                    aria-expanded={isOpen}
                  >
                    <div>
                      <div style={{ fontWeight: 900 }}>{r.label}</div>
                      <div className="subtle">{r.status}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="kpi">{r.pieces}</div>
                      <div className="subtle">{formatEuro(r.cents)}</div>
                    </div>
                  </button>

                  {isOpen ? (
                    <div style={dayPanelStyle} onTransitionEnd={onDayTransitionEnd}>
                      <div ref={dayInnerRef} style={{ padding: "12px 14px" }}>
                        <div className="rowBetween" style={{ gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900 }}>{r.iso}</div>
                            <div className="subtle">Dettaglio per categorie</div>
                          </div>

                          <button type="button" className="btn btnGhost btnSmall" onClick={startCloseDay}>
                            Nascondi
                          </button>
                        </div>

                        <div className="rowBetween" style={{ gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                          <div className="pill pillOk">Pezzi: {r.pieces}</div>
                          <div className="pill">{formatEuro(r.cents)}</div>
                        </div>

                        <div className="card" style={{ boxShadow: "none" }}>
                          <div className="cardInner">
                            <div className="list">
                              {BUCKETS.filter((b) => (r.piecesByBucket[b] ?? 0) > 0).map((b) => (
                                <div key={b} className="listRow" style={{ alignItems: "center" }}>
                                  <div style={{ fontWeight: 900 }}>{b}</div>
                                  <div style={{ textAlign: "right" }}>
                                    <div style={{ fontWeight: 900 }}>{r.piecesByBucket[b]}</div>
                                    <div className="subtle">{formatEuro(r.centsByBucket[b] ?? 0)}</div>
                                  </div>
                                </div>
                              ))}

                              {BUCKETS.every((b) => (r.piecesByBucket[b] ?? 0) === 0) ? (
                                <div className="subtle">Nessun pezzo (giorno chiuso o vuoto)</div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="subtle" style={{ marginTop: 10 }}>
                          Nota: “Preset” = valori da Impostazioni. “Salvato” = delivery del giorno.
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="subtle">
          PDF: ora stampa un report pulito in 1 pagina (solo riepilogo). Se vuoi anche la tabella, attiva “PDF giorni: ON”.
        </div>
      </div>
    </>
  );
}
