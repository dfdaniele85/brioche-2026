import React from "react";
import Topbar from "../components/Topbar";
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

export default function Months(): JSX.Element {
  const now = React.useMemo(() => new Date(), []);
  const [month, setMonth] = React.useState<MonthKey>(() => ({
    year: now.getFullYear(),
    monthIndex0: now.getMonth()
  }));

  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [priceByProductId, setPriceByProductId] = React.useState<Record<string, number>>({});
  const [weeklyByWeekday, setWeeklyByWeekday] = React.useState<Record<number, Record<string, number>>>({});

  const [monthDeliveries, setMonthDeliveries] = React.useState<MonthDeliveryMap>({});
  const [monthItems, setMonthItems] = React.useState<MonthItemsMap>({});

  const [selectedIso, setSelectedIso] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<DayDraft | null>(null);

  const days = React.useMemo(() => daysInMonth(month.year, month.monthIndex0), [month]);

  const monthStartIso = React.useMemo(
    () => formatIsoDate(new Date(month.year, month.monthIndex0, 1)),
    [month]
  );
  const monthEndIsoExclusive = React.useMemo(
    () => formatIsoDate(new Date(month.year, month.monthIndex0, days + 1)),
    [month, days]
  );

  React.useEffect(() => {
    let cancelled = false;

    async function loadMonth() {
      try {
        setLoadState("loading");

        const { data: prod, error: prodErr } = await supabase.from("products").select("*").order("name");
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

        // Se avevo un giorno selezionato, lo ricostruisco con dati freschi
        if (selectedIso) {
          const dt = new Date(selectedIso + "T00:00:00");
          const w = weekdayIso(dt);

          const del = delMap[selectedIso] ?? null;
          const recv = itMap[selectedIso] ?? {};
          const exp = wk[w] ?? {};

          const initial = dayInitialState({
            products: prods,
            hasDelivery: Boolean(del),
            deliveryIsClosed: del?.is_closed ?? false,
            deliveryNotes: del?.notes ?? null,
            receivedByProductId: recv,
            expectedByProductId: exp
          });

          setDraft(initial);
          setSaveState("idle");
        } else {
          setDraft(null);
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
  }, [monthStartIso, monthEndIsoExclusive, selectedIso]);

  function dayIsoFromIndex(dayNum1: number): string {
    return formatIsoDate(new Date(month.year, month.monthIndex0, dayNum1));
  }

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

  function selectDay(iso: string) {
    setSelectedIso(iso);
    setSaveState("idle");

    const dt = new Date(iso + "T00:00:00");
    const w = weekdayIso(dt);

    const del = monthDeliveries[iso] ?? null;
    const recv = monthItems[iso] ?? {};
    const exp = weeklyByWeekday[w] ?? {};

    const initial = dayInitialState({
      products,
      hasDelivery: Boolean(del),
      deliveryIsClosed: del?.is_closed ?? false,
      deliveryNotes: del?.notes ?? null,
      receivedByProductId: recv,
      expectedByProductId: exp
    });

    setDraft(initial);
  }

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

      // aggiorno cache locale mese
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

  async function toggleClosed() {
    if (!draft || !selectedIso) return;

    if (draft.isClosed) {
      // APRI: ripristina preset weekday + salva subito
      const dt = new Date(selectedIso + "T00:00:00");
      const w = weekdayIso(dt);
      const exp = weeklyByWeekday[w] ?? {};

      const reopened = reopenToWeeklyExpected({
        products,
        expectedByProductId: exp
      });

      setDraft(reopened);
      setSaveState("dirty");
      await saveSelected(reopened);
      return;
    }

    // CHIUDI: azzera, salverà quando premi "Salva"
    setDraft({
      ...draft,
      isClosed: true,
      qtyByProductId: Object.fromEntries(Object.keys(draft.qtyByProductId).map((k) => [k, 0]))
    });
    setSaveState("dirty");
  }

  function goPrevMonth() {
    setSelectedIso(null);
    setDraft(null);
    setSaveState("idle");
    setMonth((m) => clampMonth({ year: m.year, monthIndex0: m.monthIndex0 - 1 }));
  }

  function goNextMonth() {
    setSelectedIso(null);
    setDraft(null);
    setSaveState("idle");
    setMonth((m) => clampMonth({ year: m.year, monthIndex0: m.monthIndex0 + 1 }));
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

  const farciteTot = draft ? farciteTotalKpi(products, draft.qtyByProductId) : 0;
  const totalPieces = draft ? computeTotalPieces(draft.qtyByProductId) : 0;
  const totalCents = draft ? computeTotalCents(draft.qtyByProductId, priceByProductId) : 0;

  const canSave =
    Boolean(selectedIso && draft) && !(saveState === "saving" || saveState === "idle" || saveState === "saved");

  return (
    <>
      <Topbar
        title="Mesi"
        subtitle={monthLabel(month)}
        right={
          <div className="row">
            <button type="button" className="btn btnGhost btnSmall" onClick={goPrevMonth}>
              ◀
            </button>
            <button type="button" className="btn btnGhost btnSmall" onClick={goNextMonth}>
              ▶
            </button>
          </div>
        }
      />

      <div className="container stack" style={{ paddingBottom: selectedIso ? 110 : 16 }}>
        {/* Lista giorni */}
        <div className="card">
          <div className="cardInner list">
            {Array.from({ length: days }).map((_, idx0) => {
              const dayNum = idx0 + 1;
              const iso = dayIsoFromIndex(dayNum);
              const label = formatDayRow(new Date(month.year, month.monthIndex0, dayNum));

              const del = monthDeliveries[iso];
              const isClosed = del?.is_closed ?? false;
              const pieces = listPiecesForDay(iso);
              const active = selectedIso === iso;

              return (
                <button
                  key={iso}
                  type="button"
                  className={`listRow ${active ? "listRowSelected" : ""}`}
                  onClick={() => selectDay(iso)}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{label}</div>
                    <div className="subtle">{del ? (isClosed ? "Chiuso" : "Salvato") : "Preset"}</div>
                  </div>
                  <div className="kpi">{pieces}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dettaglio giorno */}
        {selectedIso && draft ? (
          <div className="card">
            <div className="cardInner stack">
              <div className="rowBetween">
                <div>
                  <div className="title">{selectedIso}</div>
                  <div className="subtle">Stato: {saveStateLabel(saveState)}</div>
                </div>

                <button
                  type="button"
                  className={`btn btnSmall ${draft.isClosed ? "btnPrimary" : "btnDanger"}`}
                  onClick={() => void toggleClosed()}
                >
                  {draft.isClosed ? "Apri" : "Chiudi"}
                </button>
              </div>

              <div className="rowBetween">
                <div className="pill pillOk">Farcite totali: {farciteTot}</div>
                <div className="pill">
                  {totalPieces} pezzi · {formatEuro(totalCents)}
                </div>
              </div>

              <div className="card" style={{ boxShadow: "none" }}>
                <div className="cardInner list">
                  {products.map((p) => {
                    if (isFarciteTotal(p)) {
                      return (
                        <div key={p.id} className="listRow">
                          <strong>{p.name}</strong>
                          <strong>{farciteTot}</strong>
                        </div>
                      );
                    }

                    if (!isRealProduct(p)) return null;

                    return (
                      <div key={p.id} className="listRow">
                        <div>{p.name}</div>
                        <input
                          type="number"
                          inputMode="numeric"
                          className="input"
                          style={{ width: 80, textAlign: "right" }}
                          disabled={draft.isClosed}
                          value={draft.qtyByProductId[p.id] ?? 0}
                          onChange={(e) => setQty(p.id, Number(e.target.value))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="subtle" htmlFor="notes">
                Note
              </label>
              <textarea
                id="notes"
                className="input"
                rows={3}
                placeholder="Note del giorno…"
                value={draft.notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="subtle">Seleziona un giorno per vedere/modificare il dettaglio.</div>
        )}
      </div>

      {/* Sticky action bar */}
      {selectedIso && draft ? (
        <div className="actionBar" role="region" aria-label="Azioni giorno selezionato">
          <div className="actionBarInner">
            <div className="actionBarStatus">
              <div className="actionBarTitle">{saveStateLabel(saveState)}</div>
              <div className="actionBarSub">
                {totalPieces} pezzi · {formatEuro(totalCents)}
              </div>
            </div>

            <button type="button" className="btn btnPrimary" disabled={!canSave} onClick={() => void saveSelected()}>
              Salva
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
