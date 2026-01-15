import React from "react";
import Topbar from "../components/Topbar";
import Stepper from "../components/Stepper";
import { showToast } from "../components/ToastHost";
import { supabase } from "../lib/supabase";
import type { ProductRow, PriceSettingRow, WeeklyExpectedRow } from "../lib/supabase";

import { isRealProduct } from "../lib/catalog";
import { requestDataRefresh, saveStateLabel } from "../lib/storage";
import type { SaveState } from "../lib/storage";
import { formatEuro, normalizeQty } from "../lib/compute";

type LoadState = "loading" | "ready" | "error";

const WEEKDAYS: Array<{ iso: number; label: string }> = [
  { iso: 1, label: "Lun" },
  { iso: 2, label: "Mar" },
  { iso: 3, label: "Mer" },
  { iso: 4, label: "Gio" },
  { iso: 5, label: "Ven" },
  { iso: 6, label: "Sab" },
  { iso: 7, label: "Dom" }
];

function centsFromEuroString(input: string): number {
  const cleaned = input.trim().replace(",", ".").replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return 0;
  return normalizeQty(Math.round(num * 100));
}

function euroStringFromCents(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  return (safe / 100).toFixed(2).replace(".", ",");
}

type CollapsiblePhase = "closed" | "opening" | "open" | "closing";

function usePrefersReducedMotion(): boolean {
  const [pref, setPref] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPref(mql.matches);
    setPref(mql.matches);

    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(onChange);
  }, []);

  return pref;
}

function useCollapsible(initialOpen = true) {
  const prefersReducedMotion = usePrefersReducedMotion();

  const [isOpen, setIsOpen] = React.useState<boolean>(initialOpen);
  const [phase, setPhase] = React.useState<CollapsiblePhase>(initialOpen ? "open" : "closed");
  const [height, setHeight] = React.useState<number>(initialOpen ? 1 : 0);

  const innerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // se iniziale open, misuriamo al primo paint per evitare "jump"
    if (!initialOpen) return;
    requestAnimationFrame(() => {
      const el = innerRef.current;
      const h = el ? el.scrollHeight : 0;
      setHeight(h);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function open() {
    if (isOpen) return;
    setIsOpen(true);
    setPhase("opening");
    setHeight(0);

    requestAnimationFrame(() => {
      const el = innerRef.current;
      const h = el ? el.scrollHeight : 0;
      setHeight(h);
      requestAnimationFrame(() => setPhase("open"));
    });
  }

  function close() {
    if (!isOpen) return;

    const el = innerRef.current;
    const h = el ? el.scrollHeight : height;

    setPhase("closing");
    setHeight(h);
    requestAnimationFrame(() => setHeight(0));
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function onTransitionEnd(e: React.TransitionEvent<HTMLDivElement>) {
    if (e.currentTarget !== e.target) return;
    if (e.propertyName !== "height") return;

    if (phase === "closing") {
      setIsOpen(false);
      setPhase("closed");
      setHeight(0);
    }
  }

  const style: React.CSSProperties = {
    overflow: "hidden",
    height: phase === "closed" ? 0 : height,
    opacity: phase === "open" ? 1 : 0,
    transform: phase === "open" ? "translateY(0)" : "translateY(-4px)",
    transition: prefersReducedMotion
      ? "none"
      : "height 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms ease, transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    willChange: "height, opacity, transform"
  };

  return { isOpen, toggle, open, close, onTransitionEnd, innerRef, style };
}

export default function Settings(): JSX.Element {
  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [activeWeekday, setActiveWeekday] = React.useState<number>(1);

  // valori “veri” (cents / qty)
  const [priceDraft, setPriceDraft] = React.useState<Record<string, number>>({});
  const [weeklyDraft, setWeeklyDraft] = React.useState<Record<number, Record<string, number>>>({});

  // valori “testo” per input prezzi (così non scatta mentre scrivi)
  const [priceTextDraft, setPriceTextDraft] = React.useState<Record<string, string>>({});

  const pricesPanel = useCollapsible(true);
  const presetPanel = useCollapsible(true);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadState("loading");

        const { data: prod, error: prodErr } = await supabase.from("products").select("*").order("name");
        if (prodErr) throw prodErr;

        const { data: prices, error: priceErr } = await supabase.from("price_settings").select("*");
        if (priceErr) throw priceErr;

        const { data: weekly, error: weeklyErr } = await supabase.from("weekly_expected").select("*");
        if (weeklyErr) throw weeklyErr;

        if (cancelled) return;

        const prods = (prod ?? []) as ProductRow[];
        setProducts(prods);

        // price map: default fallback + override
        const pmap: Record<string, number> = {};
        for (const p of prods) pmap[p.id] = p.default_price_cents;
        (prices ?? []).forEach((r: PriceSettingRow) => {
          pmap[r.product_id] = r.price_cents;
        });
        setPriceDraft(pmap);

        // init text inputs prezzi (formattati)
        const tmap: Record<string, string> = {};
        for (const p of prods) {
          const cents = pmap[p.id] ?? p.default_price_cents;
          tmap[p.id] = euroStringFromCents(cents);
        }
        setPriceTextDraft(tmap);

        // weekly map: init 1..7 + fill rows
        const realProds = prods.filter(isRealProduct);
        const wmap: Record<number, Record<string, number>> = {};
        for (let w = 1; w <= 7; w++) wmap[w] = {};
        for (let w = 1; w <= 7; w++) {
          for (const p of realProds) wmap[w][p.id] = 0;
        }
        (weekly ?? []).forEach((r: WeeklyExpectedRow) => {
          if (!wmap[r.weekday]) wmap[r.weekday] = {};
          wmap[r.weekday][r.product_id] = r.expected_qty;
        });
        setWeeklyDraft(wmap);

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
  }, []);

  const realProducts = React.useMemo(() => products.filter(isRealProduct), [products]);

  function setPrice(productId: string, cents: number) {
    setPriceDraft((prev) => ({ ...prev, [productId]: normalizeQty(cents) }));
    setSaveState("dirty");
  }

  function onPriceTextChange(productId: string, text: string) {
    setPriceTextDraft((prev) => ({ ...prev, [productId]: text }));
    setSaveState("dirty");
  }

  function onPriceTextBlur(productId: string, fallbackCents: number) {
    const text = priceTextDraft[productId] ?? "";
    const cents = centsFromEuroString(text);
    const next = normalizeQty(Number.isFinite(cents) ? cents : fallbackCents);

    setPrice(productId, next);
    setPriceTextDraft((prev) => ({ ...prev, [productId]: euroStringFromCents(next) }));
  }

  function setExpected(weekday: number, productId: string, qty: number) {
    setWeeklyDraft((prev) => ({
      ...prev,
      [weekday]: {
        ...(prev[weekday] ?? {}),
        [productId]: normalizeQty(qty)
      }
    }));
    setSaveState("dirty");
  }

  function resetPresetForActiveWeekday() {
    const weekday = activeWeekday;

    setWeeklyDraft((prev) => {
      const nextDay: Record<string, number> = { ...(prev[weekday] ?? {}) };
      for (const p of realProducts) nextDay[p.id] = 0;

      return {
        ...prev,
        [weekday]: nextDay
      };
    });

    setSaveState("dirty");
    showToast({ message: "Preset ripristinato" });
  }

  async function saveAll() {
    try {
      setSaveState("saving");

      // Prices: upsert per all products
      const pricePayload = products.map((p) => ({
        product_id: p.id,
        price_cents: normalizeQty(priceDraft[p.id] ?? p.default_price_cents)
      }));

      const { error: priceErr } = await supabase.from("price_settings").upsert(pricePayload);
      if (priceErr) throw priceErr;

      // weekly_expected: SOLO prodotti reali
      const weeklyPayload: Array<{ weekday: number; product_id: string; expected_qty: number }> = [];
      for (let w = 1; w <= 7; w++) {
        for (const p of products) {
          if (!isRealProduct(p)) continue;
          weeklyPayload.push({
            weekday: w,
            product_id: p.id,
            expected_qty: normalizeQty(weeklyDraft[w]?.[p.id] ?? 0)
          });
        }
      }

      const { error: weeklyErr } = await supabase.from("weekly_expected").upsert(weeklyPayload);
      if (weeklyErr) throw weeklyErr;

      setSaveState("saved");
      showToast({ message: "Salvato" });
      requestDataRefresh("save");
    } catch (e) {
      console.error(e);
      setSaveState("error");
      showToast({ message: "Errore di salvataggio", actionLabel: "Riprova", onAction: saveAll });
    }
  }

  if (loadState === "loading") {
    return (
      <>
        <Topbar title="Impostazioni" subtitle="Caricamento…" />
        <div className="container">Caricamento…</div>
      </>
    );
  }

  if (loadState === "error") {
    return (
      <>
        <Topbar title="Impostazioni" subtitle="Errore" />
        <div className="container">Errore di caricamento</div>
      </>
    );
  }

  const activeExpected = weeklyDraft[activeWeekday] ?? {};
  const canSave = saveState === "dirty" || saveState === "error";

  return (
    <>
      <Topbar
        title="Impostazioni"
        subtitle={`Prezzi e preset · ${saveStateLabel(saveState)}`}
        right={
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={resetPresetForActiveWeekday}
              disabled={saveState === "saving"}
              title="Ripristina i preset del giorno selezionato"
            >
              Preset
            </button>

            <button type="button" className="btn btnPrimary btnSmall" disabled={!canSave} onClick={() => void saveAll()}>
              Salva
            </button>
          </div>
        }
      />

      <div className="container stack" style={{ paddingBottom: 24 }}>
        {/* ===== Prezzi (collapsible) ===== */}
        <div className="card">
          <button
            type="button"
            className="listRow"
            onClick={pricesPanel.toggle}
            aria-expanded={pricesPanel.isOpen}
            style={{
              width: "100%",
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 0
            }}
          >
            <div className="cardInner" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div className="title">Prezzi</div>
                <div className="subtle">Modifica i prezzi in euro (salvati come centesimi)</div>
              </div>

              <div
                className="subtle"
                style={{
                  fontWeight: 900,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  userSelect: "none"
                }}
              >
                {pricesPanel.isOpen ? "Aperto" : "Chiuso"}
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    transform: pricesPanel.isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 180ms ease"
                  }}
                >
                  ▾
                </span>
              </div>
            </div>
          </button>

          <div style={pricesPanel.style} onTransitionEnd={pricesPanel.onTransitionEnd}>
            <div ref={pricesPanel.innerRef} className="cardInner" style={{ paddingTop: 0 }}>
              <div className="list">
                {products.map((p) => {
                  const fallbackCents = p.default_price_cents;
                  const cents = priceDraft[p.id] ?? fallbackCents;
                  const text = priceTextDraft[p.id] ?? euroStringFromCents(cents);

                  return (
                    <div key={p.id} className="listRow" style={{ alignItems: "center" }}>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                        >
                          {p.name}
                        </div>
                        <div className="subtle">{p.category}</div>
                      </div>

                      <div className="row" style={{ justifySelf: "end" }}>
                        <div className="subtle" style={{ minWidth: 70, textAlign: "right" }}>
                          {formatEuro(cents)}
                        </div>

                        <input
                          className="input"
                          style={{ width: 92, textAlign: "right" }}
                          inputMode="decimal"
                          value={text}
                          onChange={(e) => onPriceTextChange(p.id, e.target.value)}
                          onBlur={() => onPriceTextBlur(p.id, fallbackCents)}
                          onFocus={(e) => e.currentTarget.select()}
                          aria-label={`Prezzo ${p.name} in euro`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ===== Preset (collapsible) ===== */}
        <div className="card">
          <button
            type="button"
            className="listRow"
            onClick={presetPanel.toggle}
            aria-expanded={presetPanel.isOpen}
            style={{
              width: "100%",
              textAlign: "left",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 0
            }}
          >
            <div className="cardInner" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div className="title">Preset per giorno</div>
                <div className="subtle">Usati quando un giorno non ha ancora una delivery salvata</div>
              </div>

              <div
                className="subtle"
                style={{
                  fontWeight: 900,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  userSelect: "none"
                }}
              >
                {presetPanel.isOpen ? "Aperto" : "Chiuso"}
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    transform: presetPanel.isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 180ms ease"
                  }}
                >
                  ▾
                </span>
              </div>
            </div>
          </button>

          <div style={presetPanel.style} onTransitionEnd={presetPanel.onTransitionEnd}>
            <div ref={presetPanel.innerRef} className="cardInner" style={{ paddingTop: 0 }}>
              <div className="chipBar" style={{ marginTop: 10 }}>
                <div className="chipFadeLeft" />
                <div className="chipFadeRight" />
                <div className="chipScroll" role="tablist" aria-label="Seleziona giorno settimana">
                  {WEEKDAYS.map((w) => (
                    <button
                      key={w.iso}
                      type="button"
                      className={`chip ${activeWeekday === w.iso ? "chipActive" : ""}`}
                      onClick={() => setActiveWeekday(w.iso)}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rowBetween" style={{ marginTop: 10, gap: 10, flexWrap: "wrap" }}>
                <div className="subtle">
                  Giorno selezionato: <strong>{WEEKDAYS.find((x) => x.iso === activeWeekday)?.label}</strong>
                </div>

                <button
                  type="button"
                  className="btn btnGhost btnSmall"
                  onClick={resetPresetForActiveWeekday}
                  disabled={saveState === "saving"}
                  title="Riporta a zero tutte le quantità del giorno selezionato"
                >
                  Preset
                </button>
              </div>

              <div className="list" style={{ marginTop: 10 }}>
                {realProducts.map((p) => (
                  <div key={p.id} className="listRow" style={{ alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                      >
                        {p.name}
                      </div>
                      <div className="subtle">{p.category}</div>
                    </div>

                    <Stepper value={activeExpected[p.id] ?? 0} onChange={(v) => setExpected(activeWeekday, p.id, v)} />
                  </div>
                ))}
              </div>

              <div className="subtle" style={{ marginTop: 10 }}>
                Nota: <strong>Farcite (TOTALE)</strong> è calcolato e non si imposta qui.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
