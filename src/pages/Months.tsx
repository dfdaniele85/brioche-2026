import React from "react";
import Topbar from "../components/Topbar";
import Stepper from "../components/Stepper";
import { showToast } from "../components/ToastHost";
import { supabase } from "../lib/supabase";

import type {
  ProductRow,
  PriceSettingRow,
  WeeklyExpectedRow,
  DeliveryRow,
  DeliveryItemRow
} from "../lib/supabase";

import { daysInMonth, weekdayIso, formatDayRow, formatIsoDate } from "../lib/date";
import {
  dayInitialState,
  reopenToWeeklyExpected,
  farciteTotalKpi,
  computeTotalPieces,
  computeTotalCents,
  formatEuro,
  normalizeQty
} from "../lib/compute";
import type { DayDraft } from "../lib/compute";

import { isRealProduct, isFarciteTotal } from "../lib/catalog";
import { requestDataRefresh, saveStateLabel } from "../lib/storage";
import type { SaveState } from "../lib/storage";

type LoadState = "loading" | "ready" | "error";

type MonthKey = {
  year: number;
  monthIndex0: number;
};

type MonthDeliveryMap = Record<string, DeliveryRow>;
type MonthItemsMap = Record<string, Record<string, number>>;

function monthLabel(m: MonthKey): string {
  const dt = new Date(m.year, m.monthIndex0, 1);
  return dt.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

function clampMonth(m: MonthKey): MonthKey {
  let { year, monthIndex0 } = m;
  while (monthIndex0 < 0) {
    monthIndex0 += 12;
    year -= 1;
  }
  while (monthIndex0 > 11) {
    monthIndex0 -= 12;
    year += 1;
  }
  return { year, monthIndex0 };
}

/** Normalizza SEMPRE un draft “parziale” o sporco in un DayDraft valido. */
function normalizeDraft(input: {
  qtyByProductId: Record<string, number>;
  isClosed?: boolean;
  notes?: string | null;
}): DayDraft {
  return {
    qtyByProductId: input.qtyByProductId ?? {},
    isClosed: Boolean(input.isClosed),
    notes: (input.notes ?? "") as string
  };
}

/** Mobile breakpoint semplice */
function useIsNarrow(maxWidthPx = 480): boolean {
  const get = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(`(max-width: ${maxWidthPx}px)`).matches;

  const [isNarrow, setIsNarrow] = React.useState<boolean>(() => get());

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mql = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const onChange = () => setIsNarrow(mql.matches);

    setIsNarrow(mql.matches);

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(onChange);
  }, [maxWidthPx]);

  return isNarrow;
}

/** Farcite: mostra solo il gusto (togli "Farcite - ") */
function displayName(p: ProductRow): string {
  const name = p.name ?? "";
  if (p.category === "Farcite" && !p.is_farcite_total) {
    return name.replace(/^Farcite\s*-\s*/i, "");
  }
  return name;
}

export default function Months(): JSX.Element {
  const isNarrow = useIsNarrow(480);

  const now = React.useMemo(() => new Date(), []);
  const [month, setMonth] = React.useState<MonthKey>(() => ({
    year: now.getFullYear(),
    monthIndex0: now.getMonth()
  }));

  const [loadState, setLoadState] = React.useState<LoadState>("loading");

  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [priceByProductId, setPriceByProductId] = React.useState<Record<string, number>>({});
  const [weeklyByWeekday, setWeeklyByWeekday] = React.useState<Record<number, Record<string, number>>>({});

  const [monthDeliveries, setMonthDeliveries] = React.useState<MonthDeliveryMap>({});
  const [monthItems, setMonthItems] = React.useState<MonthItemsMap>({});

  // tendina inline (un giorno aperto alla volta)
  const [selectedIso, setSelectedIso] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<DayDraft | null>(null);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  // animazione fluida: height misurata + onTransitionEnd (niente timer)
  const [panelIso, setPanelIso] = React.useState<string | null>(null); // iso montato
  const [panelPhase, setPanelPhase] = React.useState<"closed" | "opening" | "open" | "closing">("closed");
  const [panelHeight, setPanelHeight] = React.useState<number>(0);
  const panelInnerRef = React.useRef<HTMLDivElement | null>(null);
  const pendingOpenIsoRef = React.useRef<string | null>(null);

  const days = React.useMemo(() => daysInMonth(month.year, month.monthIndex0), [month]);

  const monthStartIso = React.useMemo(
    () => formatIsoDate(new Date(month.year, month.monthIndex0, 1)),
    [month]
  );
  const monthEndIsoExclusive = React.useMemo(
    () => formatIsoDate(new Date(month.year, month.monthIndex0, days + 1)),
    [month, days]
  );

  const visibleProducts = React.useMemo(
    () => products.filter((p) => isFarciteTotal(p) || isRealProduct(p)),
    [products]
  );

  function buildDraftForIso(iso: string, prodsArg: ProductRow[] = products): DayDraft {
    const dt = new Date(iso + "T00:00:00");
    const w = weekdayIso(dt);

    const del = monthDeliveries[iso] ?? null;
    const recv = monthItems[iso] ?? {};
    const exp = weeklyByWeekday[w] ?? {};

    const initial = normalizeDraft(
      dayInitialState({
        products: prodsArg,
        hasDelivery: Boolean(del),
        deliveryIsClosed: del?.is_closed ?? false,
        deliveryNotes: del?.notes ?? "",
        receivedByProductId: recv,
        expectedByProductId: exp
      }) as unknown as {
        qtyByProductId: Record<string, number>;
        isClosed?: boolean;
        notes?: string;
      }
    );

    return initial;
  }

  // ---------- LOAD MESE ----------
  // ✅ FIX: NON dipende più da selectedIso (così aprire una riga non rimette "Caricamento…")
  React.useEffect(() => {
    let cancelled = false;

    async function loadMonth() {
      try {
        setLoadState("loading");

        const { data: prod, error: prodErr } = await supabase
          .from("products")
          .select("*")
          .order("name");
        if (prodErr) throw prodErr;

        const { data: prices, error: priceErr } = await supabase.from("price_settings").select("*");
        if (priceErr) throw priceErr;

        const { data: weekly, error: weeklyErr } = await supabase.from("weekly_expected").select("*");
        if (weeklyErr) throw weeklyErr;

        const { data: dels, error: delErr } = await supabase
          .from("deliveries")
          .select("*")
          .gte("delivery_date", monthStartIso)
          .lt("delivery_date", monthEndIsoExclusive)
          .order("delivery_date", { ascending: true });
        if (delErr) throw delErr;

        const deliveryIds = (dels ?? []).map((d) => d.id);
        let items: DeliveryItemRow[] = [];
        if (deliveryIds.length > 0) {
          const { data: its, error: itsErr } = await supabase
            .from("delivery_items")
            .select("*")
            .in("delivery_id", deliveryIds);
          if (itsErr) throw itsErr;
          items = its ?? [];
        }

        if (cancelled) return;

        const prods = (prod ?? []) as ProductRow[];
        setProducts(prods);

        const priceMap: Record<string, number> = {};
        (prices ?? []).forEach((p: PriceSettingRow) => {
          priceMap[p.product_id] = p.price_cents;
        });
        setPriceByProductId(priceMap);

        const wk: Record<number, Record<string, number>> = {};
        for (let w = 1; w <= 7; w++) wk[w] = {};
        (weekly ?? []).forEach((r: WeeklyExpectedRow) => {
          wk[r.weekday][r.product_id] = r.expected_qty;
        });
        setWeeklyByWeekday(wk);

        const delMap: MonthDeliveryMap = {};
        (dels ?? []).forEach((d: DeliveryRow) => {
          delMap[d.delivery_date] = d;
        });
        setMonthDeliveries(delMap);

        const idToDate: Record<string, string> = {};
        (dels ?? []).forEach((d: DeliveryRow) => {
          idToDate[d.id] = d.delivery_date;
        });

        const itMap: MonthItemsMap = {};
        items.forEach((it) => {
          const date = idToDate[it.delivery_id];
          if (!date) return;
          if (!itMap[date]) itMap[date] = {};
          itMap[date][it.product_id] = it.received_qty;
        });
        setMonthItems(itMap);

        // se panel aperto e mese cambia, ricostruisci draft con dati freschi (solo su reload mese)
        if (selectedIso) {
          const refreshed = buildDraftForIso(selectedIso, prods);
          setDraft(refreshed);
          setSaveState("idle");
        }

        setLoadState("ready");
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoadState("error");
      }
    }

    loadMonth();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStartIso, monthEndIsoExclusive]);

  function listPiecesForDay(iso: string): number {
    const del = monthDeliveries[iso];
    if (del) {
      if (del.is_closed) return 0;
      const recv = monthItems[iso] ?? {};
      return Object.values(recv).reduce((s, n) => s + (n ?? 0), 0);
    }

    const dt = new Date(iso + "T00:00:00");
    const w = weekdayIso(dt);
    const exp = weeklyByWeekday[w] ?? {};
    return Object.values(exp).reduce((s, n) => s + (n ?? 0), 0);
  }

  function beginOpen() {
    setPanelPhase("opening");
    setPanelHeight(0);

    requestAnimationFrame(() => {
      const el = panelInnerRef.current;
      const h = el ? el.scrollHeight : 0;
      setPanelHeight(h);
      requestAnimationFrame(() => setPanelPhase("open"));
    });
  }

  function beginClose() {
    if (!panelIso) return;

    const el = panelInnerRef.current;
    const h = el ? el.scrollHeight : panelHeight;

    setPanelPhase("closing");
    setPanelHeight(h);
    requestAnimationFrame(() => setPanelHeight(0));
  }

  function startCloseInline() {
    pendingOpenIsoRef.current = null;
    beginClose();
  }

  function openOrToggleDay(iso: string) {
    // stesso giorno → chiudi
    if (selectedIso === iso) {
      startCloseInline();
      return;
    }

    // se un altro è aperto → chiudi e poi apri il nuovo (quando finisce la transizione)
    if (panelIso && panelIso !== iso) {
      pendingOpenIsoRef.current = iso;
      setSelectedIso(iso); // target
      beginClose();
      return;
    }

    // apri nuovo
    pendingOpenIsoRef.current = null;
    setSelectedIso(iso);
    setPanelIso(iso);
    setSaveState("idle");

    const initial = buildDraftForIso(iso, products);
    setDraft(initial);

    beginOpen();
  }

  function onPanelTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.currentTarget !== e.target) return;
    if (e.propertyName !== "height") return;

    if (panelPhase !== "closing") return;

    const nextIso = pendingOpenIsoRef.current;
    pendingOpenIsoRef.current = null;

    if (nextIso) {
      // apri quello nuovo
      setPanelIso(nextIso);
      setSelectedIso(nextIso);
      setSaveState("idle");

      const initial = buildDraftForIso(nextIso, products);
      setDraft(initial);

      beginOpen();
      return;
    }

    // chiusura definitiva
    setPanelIso(null);
    setSelectedIso(null);
    setDraft(null);
    setSaveState("idle");
    setPanelPhase("closed");
    setPanelHeight(0);
  }

  function goPrevMonth() {
    pendingOpenIsoRef.current = null;
    setSelectedIso(null);
    setPanelIso(null);
    setDraft(null);
    setSaveState("idle");
    setPanelPhase("closed");
    setPanelHeight(0);
    setMonth((m) => clampMonth({ year: m.year, monthIndex0: m.monthIndex0 - 1 }));
  }

  function goNextMonth() {
    pendingOpenIsoRef.current = null;
    setSelectedIso(null);
    setPanelIso(null);
    setDraft(null);
    setSaveState("idle");
    setPanelPhase("closed");
    setPanelHeight(0);
    setMonth((m) => clampMonth({ year: m.year, monthIndex0: m.monthIndex0 + 1 }));
  }

  // ---------- AZIONI DETTAGLIO (come Today) ----------
  function setQty(productId: string, value: number) {
    if (!draft) return;
    setDraft({
      ...draft,
      qtyByProductId: {
        ...draft.qtyByProductId,
        [productId]: normalizeQty(value)
      }
    });
    setSaveState("dirty");
  }

  function setNotes(value: string) {
    if (!draft) return;
    setDraft({ ...draft, notes: value });
    setSaveState("dirty");
  }

  async function saveSelected(nextDraft?: DayDraft) {
    if (!selectedIso) return;
    const d = nextDraft ?? draft;
    if (!d) return;

    try {
      setSaveState("saving");

      const { data: deliv, error: delivErr } = await supabase
        .from("deliveries")
        .upsert(
          {
            delivery_date: selectedIso,
            is_closed: d.isClosed,
            notes: d.notes
          },
          { onConflict: "delivery_date" }
        )
        .select()
        .single();

      if (delivErr) throw delivErr;

      const itemsPayload = products
        .filter(isRealProduct)
        .map((p) => ({
          delivery_id: (deliv as DeliveryRow).id,
          product_id: p.id,
          received_qty: normalizeQty(d.qtyByProductId[p.id] ?? 0)
        }));

      const { error: itemsErr } = await supabase.from("delivery_items").upsert(itemsPayload);
      if (itemsErr) throw itemsErr;

      setMonthDeliveries((prev) => ({
        ...prev,
        [selectedIso]: deliv as DeliveryRow
      }));

      setMonthItems((prev) => ({
        ...prev,
        [selectedIso]: Object.fromEntries(itemsPayload.map((x) => [x.product_id, x.received_qty]))
      }));

      setDraft(d);
      setSaveState("saved");
      showToast({ message: "Salvato" });
      requestDataRefresh("save");
    } catch (e) {
      console.error(e);
      setSaveState("error");
      showToast({
        message: "Errore di salvataggio",
        actionLabel: "Riprova",
        onAction: () => void saveSelected(nextDraft)
      });
    }
  }

  function applyAttese() {
    if (!draft || !selectedIso) return;

    const dt = new Date(selectedIso + "T00:00:00");
    const w = weekdayIso(dt);
    const exp = weeklyByWeekday[w] ?? {};

    const reopened = reopenToWeeklyExpected({
      products,
      expectedByProductId: exp
    }) as unknown as { qtyByProductId: Record<string, number> };

    const next: DayDraft = {
      isClosed: false,
      notes: draft.notes ?? "",
      qtyByProductId: reopened.qtyByProductId ?? {}
    };

    setDraft(next);
    setSaveState("dirty");
  }

  async function toggleClosed() {
    if (!draft || !selectedIso) return;

    if (draft.isClosed) {
      const dt = new Date(selectedIso + "T00:00:00");
      const w = weekdayIso(dt);
      const exp = weeklyByWeekday[w] ?? {};

      const reopened = reopenToWeeklyExpected({
        products,
        expectedByProductId: exp
      }) as unknown as { qtyByProductId: Record<string, number> };

      const next: DayDraft = {
        isClosed: false,
        notes: draft.notes ?? "",
        qtyByProductId: reopened.qtyByProductId ?? {}
      };

      setDraft(next);
      setSaveState("dirty");
      await saveSelected(next);
      return;
    }

    setDraft({
      ...draft,
      isClosed: true,
      qtyByProductId: Object.fromEntries(Object.keys(draft.qtyByProductId).map((k) => [k, 0]))
    });
    setSaveState("dirty");
  }

  // ---------- STILI COMPATTI (come Today) ----------
  const compactStyles: Record<string, React.CSSProperties> = {
    listWrap: { display: "flex", flexDirection: "column" },
    row: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      alignItems: "center",
      gap: isNarrow ? 10 : 12,
      padding: isNarrow ? "10px 10px" : "12px 12px",
      minHeight: isNarrow ? 52 : 48
    },
    rowBorder: { borderBottom: "1px solid rgba(0,0,0,0.06)" },
    left: { minWidth: 0, display: "flex", flexDirection: "column", gap: 3 },
    name: {
      fontSize: isNarrow ? 15 : 14,
      lineHeight: isNarrow ? "19px" : "18px",
      fontWeight: 600,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    meta: {
      fontSize: 12,
      lineHeight: "16px",
      opacity: 0.75,
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap"
    },
    stepperWrap: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      paddingLeft: isNarrow ? 6 : 0
    },
    kpiRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: isNarrow ? "10px 10px" : "12px 12px",
      minHeight: isNarrow ? 52 : 48,
      fontWeight: 800
    }
  };

  function renderMeta(expected?: number, priceCents?: number) {
    const parts: string[] = [];
    if (typeof expected === "number") parts.push(isNarrow ? `Att ${expected}` : `Atteso: ${expected}`);
    if (typeof priceCents === "number")
      parts.push(isNarrow ? `${formatEuro(priceCents)}` : `Prezzo: ${formatEuro(priceCents)}`);
    if (parts.length === 0) return null;
    const text = isNarrow ? parts.join(" · ") : parts.join("  ");
    return <div style={compactStyles.meta}>{text}</div>;
  }

  if (loadState === "loading") {
    return (
      <>
        <Topbar title="Mesi" subtitle="Caricamento…" />
        <div className="container">Caricamento…</div>
      </>
    );
  }

  if (loadState === "error") {
    return (
      <>
        <Topbar title="Mesi" subtitle="Errore" />
        <div className="container">Errore di caricamento</div>
      </>
    );
  }

  const d = draft;
  const canSave = saveState === "dirty";
  const farciteTot = d ? farciteTotalKpi(products, d.qtyByProductId) : 0;
  const totalPieces = d ? computeTotalPieces(d.qtyByProductId) : 0;
  const totalCents = d ? computeTotalCents(d.qtyByProductId, priceByProductId) : 0;

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const panelStyle: React.CSSProperties = {
    overflow: "hidden",
    height: panelPhase === "closed" ? 0 : panelHeight,
    opacity: panelPhase === "open" ? 1 : 0,
    transform: panelPhase === "open" ? "translateY(0)" : "translateY(-4px)",
    transition: prefersReducedMotion
      ? "none"
      : "height 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms ease, transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    willChange: "height, opacity, transform"
  };

  return (
    <>
      <Topbar
        title="Mesi"
        subtitle={monthLabel(month)}
        right={
          <div className="row">
            <button type="button" className="btn btnGhost btnSmall" onClick={goPrevMonth} aria-label="Mese precedente">
              ◀
            </button>
            <button type="button" className="btn btnGhost btnSmall" onClick={goNextMonth} aria-label="Mese successivo">
              ▶
            </button>
          </div>
        }
      />

      <div className="container stack" style={{ paddingBottom: 16 }}>
        <div className="card">
          <div className="cardInner list">
            {Array.from({ length: days }).map((_, idx0) => {
              const dayNum = idx0 + 1;
              const iso = formatIsoDate(new Date(month.year, month.monthIndex0, dayNum));
              const label = formatDayRow(new Date(month.year, month.monthIndex0, dayNum));

              const del = monthDeliveries[iso];
              const isClosed = del?.is_closed ?? false;
              const pieces = listPiecesForDay(iso);

              const isOpen = panelIso === iso && d;

              return (
                <div key={iso} style={{ display: "flex", flexDirection: "column" }}>
                  <button
                    type="button"
                    className={`listRow ${isOpen ? "listRowSelected" : ""}`}
                    onClick={() => openOrToggleDay(iso)}
                    aria-expanded={Boolean(isOpen)}
                  >
                    <div>
                      <div style={{ fontWeight: 900 }}>{label}</div>
                      <div className="subtle">{del ? (isClosed ? "Chiuso" : "Salvato") : "Preset"}</div>
                    </div>
                    <div className="kpi">{pieces}</div>
                  </button>

                  {isOpen ? (
                    <div style={panelStyle} onTransitionEnd={onPanelTransitionEnd}>
                      <div ref={panelInnerRef} style={{ padding: isNarrow ? "10px 12px" : "12px 14px" }}>
                        <div className="rowBetween" style={{ marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900 }}>{iso}</div>
                            <div className="subtle">Stato: {saveStateLabel(saveState)}</div>
                          </div>

                          <div className="row" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="btn btnPrimary btnSmall"
                              disabled={!canSave}
                              onClick={() => void saveSelected()}
                            >
                              Salva
                            </button>

                            <button
                              type="button"
                              className="btn btnPrimary btnSmall"
                              disabled={d.isClosed}
                              onClick={applyAttese}
                            >
                              Attese
                            </button>

                            <button
                              type="button"
                              className={`btn btnSmall ${d.isClosed ? "btnPrimary" : "btnDanger"}`}
                              onClick={() => void toggleClosed()}
                            >
                              {d.isClosed ? "Apri" : "Chiudi"}
                            </button>

                            <button type="button" className="btn btnGhost btnSmall" onClick={startCloseInline}>
                              Nascondi
                            </button>
                          </div>
                        </div>

                        <div className="rowBetween" style={{ marginBottom: 10 }}>
                          <div className="pill pillOk">Farcite totali: {farciteTot}</div>
                          <div className="pill">
                            {totalPieces} pezzi · {formatEuro(totalCents)}
                          </div>
                        </div>

                        <div className="card" style={{ boxShadow: "none" }}>
                          <div className="cardInner list" style={compactStyles.listWrap}>
                            {visibleProducts.map((p, idx) => {
                              const isLast = idx === visibleProducts.length - 1;

                              if (isFarciteTotal(p)) {
                                return (
                                  <div
                                    key={p.id}
                                    className="listRow listRowKpi"
                                    style={{
                                      ...compactStyles.kpiRow,
                                      ...(isLast ? undefined : compactStyles.rowBorder)
                                    }}
                                  >
                                    <span style={{ ...compactStyles.name, fontWeight: 800 }}>{p.name}</span>
                                    <span>{farciteTot}</span>
                                  </div>
                                );
                              }

                              const priceCents = priceByProductId[p.id];
                              const dt = new Date(iso + "T00:00:00");
                              const w = weekdayIso(dt);
                              const expected = weeklyByWeekday[w]?.[p.id];

                              return (
                                <div
                                  key={p.id}
                                  className="listRow"
                                  style={{
                                    ...compactStyles.row,
                                    ...(isLast ? undefined : compactStyles.rowBorder),
                                    opacity: d.isClosed ? 0.75 : 1
                                  }}
                                >
                                  <div className="listLabel" style={compactStyles.left}>
                                    <div style={compactStyles.name} title={p.name}>
                                      {displayName(p)}
                                    </div>
                                    {renderMeta(expected, priceCents)}
                                  </div>

                                  <div style={compactStyles.stepperWrap}>
                                    <Stepper
                                      value={d.qtyByProductId[p.id] ?? 0}
                                      disabled={d.isClosed}
                                      onChange={(v) => setQty(p.id, v)}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <label className="subtle" htmlFor={`notes-${iso}`} style={{ display: "block", marginTop: 10 }}>
                          Note
                        </label>
                        <textarea
                          id={`notes-${iso}`}
                          className="input"
                          rows={3}
                          placeholder="Note del giorno…"
                          value={d.notes}
                          onChange={(e) => setNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
