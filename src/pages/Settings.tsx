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

  const realProducts = products.filter(isRealProduct);
  const activeExpected = weeklyDraft[activeWeekday] ?? {};
  const canSave = saveState === "dirty" || saveState === "error";

  return (
    <>
      <Topbar title="Impostazioni" subtitle="Prezzi e preset" />

      <div className="container stack" style={{ paddingBottom: 110 }}>
        {/* Prezzi */}
        <div className="card">
          <div className="cardInner stack">
            <div className="title">Prezzi</div>
            <div className="subtle">Modifica i prezzi in euro. Verranno salvati come centesimi.</div>

            <div className="list">
              {products.map((p) => {
                const fallbackCents = p.default_price_cents;
                const cents = priceDraft[p.id] ?? fallbackCents;
                const text = priceTextDraft[p.id] ?? euroStringFromCents(cents);

                return (
                  <div key={p.id} className="listRow" style={{ alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
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

        {/* Preset weekday */}
        <div className="card">
          <div className="cardInner stack">
            <div className="title">Preset per giorno</div>
            <div className="subtle">
              Questi valori vengono usati quando un giorno non ha ancora una delivery salvata.
            </div>

            <div className="chipBar">
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

            <div className="list">
              {realProducts.map((p) => (
                <div key={p.id} className="listRow" style={{ alignItems: "center" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {p.name}
                    </div>
                    <div className="subtle">{p.category}</div>
                  </div>

                  <Stepper
                    value={activeExpected[p.id] ?? 0}
                    onChange={(v) => setExpected(activeWeekday, p.id, v)}
                  />
                </div>
              ))}
            </div>

            <div className="subtle">
              Nota: <strong>Farcite (TOTALE)</strong> è calcolato e non si imposta qui.
            </div>
          </div>
        </div>
      </div>

      {/* Sticky action bar */}
      <div className="actionBar" role="region" aria-label="Azioni impostazioni">
        <div className="actionBarInner">
          <div className="actionBarStatus">
            <div className="actionBarTitle">{saveStateLabel(saveState)}</div>
            <div className="actionBarSub">Prezzi + preset weekday</div>
          </div>

          <button type="button" className="btn btnPrimary" disabled={!canSave} onClick={() => void saveAll()}>
            Salva
          </button>
        </div>
      </div>
    </>
  );
}
