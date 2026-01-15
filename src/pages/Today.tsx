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

import { isRealProduct, isFarciteTotal, displayProductName } from "../lib/catalog";
import { requestDataRefresh, saveStateLabel } from "../lib/storage";
import type { SaveState } from "../lib/storage";

type LoadState = "loading" | "ready" | "error";

function normalizeDraft(input: {
  qtyByProductId: Record<string, number>;
  isClosed?: boolean;
  notes?: string;
}): DayDraft {
  return {
    qtyByProductId: input.qtyByProductId ?? {},
    isClosed: Boolean(input.isClosed),
    notes: input.notes ?? ""
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

export default function Today(): JSX.Element {
  const today = React.useMemo(() => new Date(), []);
  const isoDate = formatIsoDate(today);
  const weekday = weekdayIso(today);

  const isNarrow = useIsNarrow(480);

  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [priceByProductId, setPriceByProductId] = React.useState<Record<string, number>>({});
  const [expectedByProductId, setExpectedByProductId] = React.useState<Record<string, number>>({});
  const [draft, setDraft] = React.useState<DayDraft | null>(null);

  const visibleProducts = React.useMemo(
    () => products.filter((p) => isFarciteTotal(p) || isRealProduct(p)),
    [products]
  );

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadState("loading");

        const { data: prod, error: prodErr } = await supabase
          .from("products")
          .select("*")
          .order("name");
        if (prodErr) throw prodErr;

        const { data: prices, error: priceErr } = await supabase
          .from("price_settings")
          .select("*");
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

        setProducts(prod ?? []);

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
        (items ?? []).forEach((it) => {
          recvMap[it.product_id] = it.received_qty;
        });

        const initial = normalizeDraft(
          dayInitialState({
            products: prod ?? [],
            hasDelivery: Boolean(deliv),
            deliveryIsClosed: deliv?.is_closed ?? false,
            deliveryNotes: deliv?.notes ?? "",
            receivedByProductId: recvMap,
            expectedByProductId: expMap
          }) as unknown as {
            qtyByProductId: Record<string, number>;
            isClosed?: boolean;
            notes?: string;
          }
        );

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

  const d = draft;

  const farciteTot = farciteTotalKpi(products, d.qtyByProductId);
  const totalPieces = computeTotalPieces(d.qtyByProductId);
  const totalCents = computeTotalCents(d.qtyByProductId, priceByProductId);
  const canSave = saveState === "dirty";

  function setQty(productId: string, value: number) {
    setDraft({
      ...d,
      qtyByProductId: {
        ...d.qtyByProductId,
        [productId]: normalizeQty(value)
      }
    });
    setSaveState("dirty");
  }

  function applyAttese() {
    if (d.isClosed) return;

    const reopenedBase = reopenToWeeklyExpected({
      products,
      expectedByProductId
    }) as unknown as { qtyByProductId: Record<string, number> };

    const next: DayDraft = {
      isClosed: false,
      notes: d.notes ?? "",
      qtyByProductId: reopenedBase.qtyByProductId ?? {}
    };

    setDraft(next);
    setSaveState("dirty");
    showToast({ message: "Attese applicate" });
  }

  function toggleClosedAndMaybeSaveImmediately(nextIsClosed: boolean) {
    if (nextIsClosed) {
      setDraft({
        ...d,
        isClosed: true,
        notes: d.notes ?? "",
        qtyByProductId: Object.fromEntries(Object.keys(d.qtyByProductId).map((k) => [k, 0]))
      });
      setSaveState("dirty");
      return;
    }

    const reopenedBase = reopenToWeeklyExpected({
      products,
      expectedByProductId
    }) as unknown as { qtyByProductId: Record<string, number> };

    const reopened: DayDraft = {
      isClosed: false,
      notes: d.notes ?? "",
      qtyByProductId: reopenedBase.qtyByProductId ?? {}
    };

    setDraft(reopened);
    setSaveState("dirty");
    void saveWithDraft(reopened);
  }

  async function saveWithDraft(draftToSave: DayDraft) {
    try {
      setSaveState("saving");

      const { data: deliv, error: delivErr } = await supabase
        .from("deliveries")
        .upsert(
          {
            delivery_date: isoDate,
            is_closed: draftToSave.isClosed,
            notes: draftToSave.notes
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
          received_qty: normalizeQty(draftToSave.qtyByProductId[p.id] ?? 0)
        }));

      const { error: itemsErr } = await supabase.from("delivery_items").upsert(itemsPayload);
      if (itemsErr) throw itemsErr;

      setSaveState("saved");
      showToast({ message: "Salvato" });
      requestDataRefresh("save");
    } catch (e) {
      console.error(e);
      setSaveState("error");
      showToast({
        message: "Errore di salvataggio",
        actionLabel: "Riprova",
        onAction: () => saveWithDraft(draftToSave)
      });
    }
  }

  const compactStyles: Record<string, React.CSSProperties> = {
    listWrap: {
      display: "flex",
      flexDirection: "column"
    },
    row: {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      alignItems: "center",
      gap: isNarrow ? 10 : 12,
      padding: isNarrow ? "10px 10px" : "12px 12px",
      minHeight: isNarrow ? 52 : 48
    },
    rowBorder: {
      borderBottom: "1px solid rgba(0,0,0,0.06)"
    },
    left: {
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 3
    },
    name: {
      fontSize: isNarrow ? 15 : 14,
      lineHeight: isNarrow ? "19px" : "18px",
      fontWeight: 600,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis"
    },
    meta: {
      fontSize: isNarrow ? 12 : 12,
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

    if (typeof expected === "number") {
      parts.push(isNarrow ? `Att ${expected}` : `Atteso: ${expected}`);
    }
    if (typeof priceCents === "number") {
      parts.push(isNarrow ? `${formatEuro(priceCents)}` : `Prezzo: ${formatEuro(priceCents)}`);
    }

    if (parts.length === 0) return null;

    const text = isNarrow ? parts.join(" · ") : parts.join("  ");
    return <div style={compactStyles.meta}>{text}</div>;
  }

  return (
    <>
      <Topbar
        title="Oggi"
        subtitle={d.isClosed ? "Chiuso" : "Aperto"}
        right={
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btnPrimary btnSmall"
              disabled={d.isClosed}
              onClick={applyAttese}
              title={d.isClosed ? "Apri prima di applicare le attese" : "Applica le attese del giorno"}
            >
              Attese
            </button>

            <button
              type="button"
              className="btn btnPrimary btnSmall"
              disabled={!canSave}
              onClick={() => saveWithDraft(d)}
            >
              Salva
            </button>

            <button
              type="button"
              className={`btn btnSmall ${d.isClosed ? "btnPrimary" : "btnDanger"}`}
              onClick={() => toggleClosedAndMaybeSaveImmediately(!d.isClosed)}
            >
              {d.isClosed ? "Apri" : "Chiudi"}
            </button>
          </div>
        }
      />

      <div className="container stack" style={{ paddingBottom: 86 }}>
        <div className="rowBetween">
          <div className="pill pillOk">Farcite totali: {farciteTot}</div>
          <div className="pill">
            {totalPieces} pezzi · {formatEuro(totalCents)}
          </div>
        </div>

        <div className="card">
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
              const expected = expectedByProductId[p.id];
              const displayName = displayProductName(p, { compactFarcitePrefix: isNarrow });

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
                    <div style={compactStyles.name} title={displayName}>
                      {displayName}
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
      </div>

      <div className="actionBar" role="region" aria-label="Stato">
        <div className="actionBarInner">
          <div className="actionBarStatus">
            <div className="actionBarTitle">{saveStateLabel(saveState)}</div>
            <div className="actionBarSub">
              {totalPieces} pezzi · {formatEuro(totalCents)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
