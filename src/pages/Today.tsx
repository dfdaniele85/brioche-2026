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

import { weekdayIso, formatIsoDate } from "../lib/date";
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

export default function Today(): JSX.Element {
  const todayDate = React.useMemo(() => new Date(), []);
  const isoDate = formatIsoDate(todayDate);
  const weekday = weekdayIso(todayDate);

  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [priceByProductId, setPriceByProductId] = React.useState<Record<string, number>>({});
  const [expectedByProductId, setExpectedByProductId] = React.useState<Record<string, number>>({});

  const [draft, setDraft] = React.useState<DayDraft | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadState("loading");

        const { data: prod, error: prodErr } = await supabase.from("products").select("*").order("name");
        if (prodErr) throw prodErr;

        const { data: prices, error: priceErr } = await supabase.from("price_settings").select("*");
        if (priceErr) throw priceErr;

        const { data: weekly, error: weeklyErr } = await supabase
          .from("weekly_expected")
          .select("*")
          .eq("weekday", weekday);
        if (weeklyErr) throw weeklyErr;

        const { data: deliv, error: delivErr } = await supabase
          .from("deliveries")
          .select("*")
          .eq("delivery_date", isoDate)
          .maybeSingle();
        if (delivErr) throw delivErr;

        let items: DeliveryItemRow[] = [];
        if (deliv) {
          const { data: its, error: itsErr } = await supabase
            .from("delivery_items")
            .select("*")
            .eq("delivery_id", deliv.id);
          if (itsErr) throw itsErr;
          items = its ?? [];
        }

        if (cancelled) return;

        setProducts((prod ?? []) as ProductRow[]);

        const priceMap: Record<string, number> = {};
        (prices ?? []).forEach((p: PriceSettingRow) => {
          priceMap[p.product_id] = p.price_cents;
        });
        setPriceByProductId(priceMap);

        const expMap: Record<string, number> = {};
        (weekly ?? []).forEach((w: WeeklyExpectedRow) => {
          expMap[w.product_id] = w.expected_qty;
        });
        setExpectedByProductId(expMap);

        const recvMap: Record<string, number> = {};
        items.forEach((it) => {
          recvMap[it.product_id] = it.received_qty;
        });

        const initial = dayInitialState({
          products: (prod ?? []) as ProductRow[],
          hasDelivery: Boolean(deliv),
          deliveryIsClosed: (deliv as DeliveryRow | null)?.is_closed ?? false,
          deliveryNotes: (deliv as DeliveryRow | null)?.notes ?? null,
          receivedByProductId: recvMap,
          expectedByProductId: expMap
        });

        setDraft(initial);
        setSaveState("idle");
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
  }, [isoDate, weekday]);

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

  function toggleClosed() {
    if (!draft) return;

    if (draft.isClosed) {
      const reopened = reopenToWeeklyExpected({
        products,
        expectedByProductId
      });
      setDraft(reopened);
    } else {
      setDraft({
        ...draft,
        isClosed: true,
        qtyByProductId: Object.fromEntries(Object.keys(draft.qtyByProductId).map((k) => [k, 0]))
      });
    }
    setSaveState("dirty");
  }

  async function save() {
    if (!draft) return;
    try {
      setSaveState("saving");

      const { data: deliv, error: delivErr } = await supabase
        .from("deliveries")
        .upsert(
          {
            delivery_date: isoDate,
            is_closed: draft.isClosed,
            notes: draft.notes
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
          received_qty: normalizeQty(draft.qtyByProductId[p.id] ?? 0)
        }));

      const { error: itemsErr } = await supabase.from("delivery_items").upsert(itemsPayload);
      if (itemsErr) throw itemsErr;

      setSaveState("saved");
      showToast({ message: "Salvato" });
      requestDataRefresh("save");
    } catch (e) {
      console.error(e);
      setSaveState("error");
      showToast({ message: "Errore di salvataggio", actionLabel: "Riprova", onAction: save });
    }
  }

  if (loadState === "loading") {
    return (
      <>
        <Topbar title="Oggi" subtitle="Caricamento…" />
        <div className="container">Caricamento…</div>
      </>
    );
  }

  if (loadState === "error" || !draft) {
    return (
      <>
        <Topbar title="Oggi" subtitle="Errore" />
        <div className="container">Errore di caricamento</div>
      </>
    );
  }

  const farciteTot = farciteTotalKpi(products, draft.qtyByProductId);
  const totalPieces = computeTotalPieces(draft.qtyByProductId);
  const totalCents = computeTotalCents(draft.qtyByProductId, priceByProductId);

  const canSave = !(saveState === "saving" || saveState === "idle" || saveState === "saved");

  return (
    <>
      <Topbar
        title="Oggi"
        subtitle={draft.isClosed ? "Chiuso" : "Aperto"}
        right={
          <button
            type="button"
            className={`btn btnSmall ${draft.isClosed ? "btnPrimary" : "btnDanger"}`}
            onClick={toggleClosed}
          >
            {draft.isClosed ? "Apri" : "Chiudi"}
          </button>
        }
      />

      <div className="container stack" style={{ paddingBottom: 96 }}>
        <div className="rowBetween">
          <div className="pill pillOk">Farcite totali: {farciteTot}</div>
          <div className="pill">
            {totalPieces} pezzi · {formatEuro(totalCents)}
          </div>
        </div>

        <div className="card">
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
      </div>

      {/* Sticky action bar */}
      <div className="actionBar" role="region" aria-label="Azioni">
        <div className="actionBarInner">
          <div className="actionBarStatus">
            <div className="actionBarTitle">{saveStateLabel(saveState)}</div>
            <div className="actionBarSub">
              {totalPieces} pezzi · {formatEuro(totalCents)}
            </div>
          </div>

          <button type="button" className="btn btnPrimary" disabled={!canSave} onClick={save}>
            Salva
          </button>
        </div>
      </div>
    </>
  );
}
