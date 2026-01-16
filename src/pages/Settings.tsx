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

type ProfileKey = "winter" | "summer";
type ActivePreset = ProfileKey | "manual";

type WeeklyProfileRow = {
  profile: string;
  weekday: number;
  product_id: string;
  expected_qty: number;
};

const WEEKDAYS: Array<{ iso: number; label: string }> = [
  { iso: 1, label: "Lun" },
  { iso: 2, label: "Mar" },
  { iso: 3, label: "Mer" },
  { iso: 4, label: "Gio" },
  { iso: 5, label: "Ven" },
  { iso: 6, label: "Sab" },
  { iso: 7, label: "Dom" }
];

const ACTIVE_PRESET_LS_KEY = "fiuri:brioche-2026:active-preset";

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

function cloneWeeklyDraft(
  input: Record<number, Record<string, number>>
): Record<number, Record<string, number>> {
  const out: Record<number, Record<string, number>> = {};
  for (let w = 1; w <= 7; w++) out[w] = { ...(input[w] ?? {}) };
  return out;
}

/** Animazione tendina semplice (height misurata) */
function useCollapsible(open: boolean) {
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
  }, [open]);

  return { innerRef, height };
}

function presetLabel(p: ActivePreset): string {
  if (p === "winter") return "Inverno";
  if (p === "summer") return "Estate";
  return "Manuale";
}

function recommendedPresetForNow(now = new Date()): ProfileKey {
  // Inverno: Ott (9) - Mar (2)
  const m = now.getMonth(); // 0..11
  const isWinter = m >= 9 || m <= 2;
  return isWinter ? "winter" : "summer";
}

function recommendedLabel(p: ProfileKey): string {
  return p === "winter" ? "Inverno (Ott–Mar)" : "Estate (Apr–Set)";
}

function safeReadActivePreset(): ActivePreset {
  try {
    const raw = window.localStorage.getItem(ACTIVE_PRESET_LS_KEY);
    if (raw === "winter" || raw === "summer" || raw === "manual") return raw;
  } catch {
    // ignore
  }
  return "manual";
}

function safeWriteActivePreset(value: ActivePreset) {
  try {
    window.localStorage.setItem(ACTIVE_PRESET_LS_KEY, value);
  } catch {
    // ignore
  }
}

export default function Settings(): JSX.Element {
  const [loadState, setLoadState] = React.useState<LoadState>("loading");
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [activeWeekday, setActiveWeekday] = React.useState<number>(1);

  // valori “veri”
  const [priceDraft, setPriceDraft] = React.useState<Record<string, number>>({});
  const [weeklyDraft, setWeeklyDraft] = React.useState<Record<number, Record<string, number>>>({});

  // snapshot per “Ripristina”
  const [priceOriginal, setPriceOriginal] = React.useState<Record<string, number>>({});
  const [weeklyOriginal, setWeeklyOriginal] = React.useState<Record<number, Record<string, number>>>({});

  // valori “testo” per input prezzi (no scatti)
  const [priceTextDraft, setPriceTextDraft] = React.useState<Record<string, string>>({});

  // profili caricati da DB
  const [profiles, setProfiles] = React.useState<Record<ProfileKey, Record<number, Record<string, number>>>>({
    winter: {},
    summer: {}
  });

  // preset attivo (UI + persistenza)
  const [activePreset, setActivePreset] = React.useState<ActivePreset>(() => {
    if (typeof window === "undefined") return "manual";
    return safeReadActivePreset();
  });

  // tendine
  const [openPrices, setOpenPrices] = React.useState<boolean>(true);
  const [openPreset, setOpenPreset] = React.useState<boolean>(true);

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pricesColl = useCollapsible(openPrices);
  const presetColl = useCollapsible(openPreset);

  // evita di marcare "manual" quando stiamo applicando un profilo via bottone
  const applyingProfileRef = React.useRef<boolean>(false);

  // persisti preset attivo
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    safeWriteActivePreset(activePreset);
  }, [activePreset]);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadState("loading");

        const { data: prod, error: prodErr } = await supabase.from("products").select("*").order("name");
        if (prodErr) throw prodErr;

        const { data: pricesRows, error: priceErr } = await supabase.from("price_settings").select("*");
        if (priceErr) throw priceErr;

        const { data: weeklyRows, error: weeklyErr } = await supabase.from("weekly_expected").select("*");
        if (weeklyErr) throw weeklyErr;

        // profili (se tabella non esiste ancora, non blocchiamo la pagina)
        let profileRows: WeeklyProfileRow[] = [];
        const { data: prof, error: profErr } = await supabase
          .from("weekly_expected_profiles")
          .select("*")
          .in("profile", ["winter", "summer"]);
        if (!profErr) profileRows = (prof ?? []) as WeeklyProfileRow[];

        if (cancelled) return;

        const prods = (prod ?? []) as ProductRow[];
        setProducts(prods);

        // ===== PRICES =====
        const pmap: Record<string, number> = {};
        for (const p of prods) pmap[p.id] = p.default_price_cents;
        (pricesRows ?? []).forEach((r: PriceSettingRow) => {
          pmap[r.product_id] = r.price_cents;
        });
        setPriceDraft(pmap);
        setPriceOriginal({ ...pmap });

        const tmap: Record<string, string> = {};
        for (const p of prods) {
          const cents = pmap[p.id] ?? p.default_price_cents;
          tmap[p.id] = euroStringFromCents(cents);
        }
        setPriceTextDraft(tmap);

        // ===== WEEKLY (ATTIVO) =====
        const realProds = prods.filter(isRealProduct);
        const wmap: Record<number, Record<string, number>> = {};
        for (let w = 1; w <= 7; w++) wmap[w] = {};
        for (let w = 1; w <= 7; w++) {
          for (const p of realProds) wmap[w][p.id] = 0;
        }
        (weeklyRows ?? []).forEach((r: WeeklyExpectedRow) => {
          if (!wmap[r.weekday]) wmap[r.weekday] = {};
          wmap[r.weekday][r.product_id] = r.expected_qty;
        });
        setWeeklyDraft(wmap);
        setWeeklyOriginal(cloneWeeklyDraft(wmap));

        // ===== PROFILES =====
        const profMap: Record<ProfileKey, Record<number, Record<string, number>>> = {
          winter: {},
          summer: {}
        };
        for (const key of ["winter", "summer"] as ProfileKey[]) {
          profMap[key] = {};
          for (let w = 1; w <= 7; w++) profMap[key][w] = {};
          for (let w = 1; w <= 7; w++) {
            for (const p of realProds) profMap[key][w][p.id] = 0;
          }
        }
        profileRows.forEach((r) => {
          const k = (r.profile as ProfileKey) || "winter";
          if (!profMap[k]) return;
          if (!profMap[k][r.weekday]) profMap[k][r.weekday] = {};
          profMap[k][r.weekday][r.product_id] = r.expected_qty;
        });
        setProfiles(profMap);

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

  function markDirty() {
    setSaveState("dirty");
  }

  function onPriceTextChange(productId: string, text: string) {
    setPriceTextDraft((prev) => ({ ...prev, [productId]: text }));
    markDirty();
  }

  function onPriceTextBlur(productId: string, fallbackCents: number) {
    const text = priceTextDraft[productId] ?? "";
    const cents = centsFromEuroString(text);
    const next = normalizeQty(Number.isFinite(cents) ? cents : fallbackCents);

    setPriceDraft((prev) => ({ ...prev, [productId]: next }));
    setPriceTextDraft((prev) => ({ ...prev, [productId]: euroStringFromCents(next) }));
    markDirty();
  }

  function setExpected(weekday: number, productId: string, qty: number) {
    setWeeklyDraft((prev) => ({
      ...prev,
      [weekday]: {
        ...(prev[weekday] ?? {}),
        [productId]: normalizeQty(qty)
      }
    }));

    // se l'utente tocca a mano -> preset attivo diventa Manuale
    if (!applyingProfileRef.current) setActivePreset("manual");

    markDirty();
  }

  function resetPricesToOriginal() {
    setPriceDraft({ ...priceOriginal });
    const tmap: Record<string, string> = {};
    for (const p of products) {
      const cents = priceOriginal[p.id] ?? p.default_price_cents;
      tmap[p.id] = euroStringFromCents(cents);
    }
    setPriceTextDraft(tmap);
    setSaveState("dirty");
    showToast({ message: "Prezzi ripristinati" });
  }

  function resetPresetDayToOriginal() {
    const w = activeWeekday;
    setWeeklyDraft((prev) => ({
      ...prev,
      [w]: { ...(weeklyOriginal[w] ?? {}) }
    }));
    setSaveState("dirty");
    setActivePreset("manual");
    showToast({ message: "Preset ripristinato" });
  }

  async function saveAll() {
    try {
      setSaveState("saving");

      // Prices
      const pricePayload = products.map((p) => ({
        product_id: p.id,
        price_cents: normalizeQty(priceDraft[p.id] ?? p.default_price_cents)
      }));

      const { error: priceErr } = await supabase.from("price_settings").upsert(pricePayload);
      if (priceErr) throw priceErr;

      // Weekly (attivo): SOLO prodotti reali
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

      // aggiorna snapshot “original”
      setPriceOriginal({ ...priceDraft });
      setWeeklyOriginal(cloneWeeklyDraft(weeklyDraft));

      // se salvi così, consideriamolo "Manuale" (a meno che tu non abbia appena applicato un profilo)
      // NB: se vuoi mantenere winter/summer anche dopo un Save manuale, dimmelo e lo cambiamo.
      if (activePreset !== "winter" && activePreset !== "summer") setActivePreset("manual");

      setSaveState("saved");
      showToast({ message: "Salvato" });
      requestDataRefresh("save");
    } catch (e) {
      console.error(e);
      setSaveState("error");
      showToast({ message: "Errore di salvataggio", actionLabel: "Riprova", onAction: saveAll });
    }
  }

  async function saveProfile(profile: ProfileKey) {
    try {
      setSaveState("saving");

      const payload: WeeklyProfileRow[] = [];
      for (let w = 1; w <= 7; w++) {
        for (const p of products) {
          if (!isRealProduct(p)) continue;
          payload.push({
            profile,
            weekday: w,
            product_id: p.id,
            expected_qty: normalizeQty(weeklyDraft[w]?.[p.id] ?? 0)
          });
        }
      }

      const { error } = await supabase.from("weekly_expected_profiles").upsert(payload);
      if (error) throw error;

      setProfiles((prev) => ({
        ...prev,
        [profile]: cloneWeeklyDraft(weeklyDraft)
      }));

      setSaveState("saved");
      showToast({ message: `Salvato in ${profile === "winter" ? "Inverno" : "Estate"}` });
    } catch (e) {
      console.error(e);
      setSaveState("error");
      showToast({ message: "Errore profilo", actionLabel: "Riprova", onAction: () => void saveProfile(profile) });
    }
  }

  /** Applica profilo e SALVA SUBITO su weekly_expected (quindi “salta” il Salva manuale) */
  async function applyProfileAndActivate(profile: ProfileKey) {
    try {
      const prof = profiles[profile];
      if (!prof || Object.keys(prof).length === 0) {
        showToast({ message: "Profilo vuoto (crealo con “Salva in …”)" });
        return;
      }

      applyingProfileRef.current = true;
      setWeeklyDraft(cloneWeeklyDraft(prof));
      setSaveState("dirty");

      // salva subito come preset attivo
      setSaveState("saving");

      const weeklyPayload: Array<{ weekday: number; product_id: string; expected_qty: number }> = [];
      for (let w = 1; w <= 7; w++) {
        for (const p of products) {
          if (!isRealProduct(p)) continue;
          weeklyPayload.push({
            weekday: w,
            product_id: p.id,
            expected_qty: normalizeQty(prof[w]?.[p.id] ?? 0)
          });
        }
      }

      const { error } = await supabase.from("weekly_expected").upsert(weeklyPayload);
      if (error) throw error;

      // aggiornare snapshot “original” perché ora il preset attivo è quello
      setWeeklyOriginal(cloneWeeklyDraft(prof));
      requestDataRefresh("save");

      setActivePreset(profile);

      setSaveState("saved");
      showToast({ message: `Preset attivo: ${profile === "winter" ? "Inverno" : "Estate"}` });
    } catch (e) {
      console.error(e);
      setSaveState("error");
      showToast({ message: "Errore applicazione preset" });
    } finally {
      applyingProfileRef.current = false;
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

  const sectionStyle = (open: boolean, height: number): React.CSSProperties => ({
    overflow: "hidden",
    height: open ? height : 0,
    opacity: open ? 1 : 0,
    transform: open ? "translateY(0)" : "translateY(-4px)",
    transition: prefersReducedMotion
      ? "none"
      : "height 260ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 180ms ease, transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
    willChange: "height, opacity, transform"
  });

  const recommended = recommendedPresetForNow(new Date());
  const isMismatch = (activePreset === "winter" || activePreset === "summer") && activePreset !== recommended;

  const pillBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 800,
    fontSize: 12,
    lineHeight: "14px",
    border: "1px solid rgba(0,0,0,0.08)",
    background: "rgba(255,255,255,0.75)"
  };

  const pillWarn: React.CSSProperties = {
    ...pillBase,
    background: "rgba(255, 164, 60, 0.20)",
    border: "1px solid rgba(255, 164, 60, 0.45)"
  };

  return (
    <>
      <Topbar
        title="Impostazioni"
        subtitle="Prezzi e preset"
        right={
          <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center" }}>
            {/* Indicatori preset */}
            <span style={isMismatch ? pillWarn : pillBase} title="Preset attualmente attivo (memorizzato in questo dispositivo)">
              Preset attivo: {presetLabel(activePreset)}
            </span>

            <span style={pillBase} title="Suggerimento automatico in base al periodo">
              Consigliato ora: {recommendedLabel(recommended)}
            </span>

            {/* Azioni */}
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={() => void applyProfileAndActivate("winter")}
              title="Applica subito come preset attivo"
            >
              Inverno
            </button>
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={() => void applyProfileAndActivate("summer")}
              title="Applica subito come preset attivo"
            >
              Estate
            </button>
            <button type="button" className="btn btnPrimary btnSmall" disabled={!canSave} onClick={() => void saveAll()}>
              Salva
            </button>
          </div>
        }
      />

      <div className="container stack" style={{ paddingBottom: 16 }}>
        {/* PREZZI (tendina) */}
        <div className="card">
          <button
            type="button"
            className="listRow"
            onClick={() => setOpenPrices((v) => !v)}
            aria-expanded={openPrices}
            style={{ width: "100%" }}
          >
            <div>
              <div style={{ fontWeight: 900 }}>Prezzi</div>
              <div className="subtle">Modifica in euro</div>
            </div>
            <div className="subtle" style={{ fontWeight: 800 }}>
              {openPrices ? "Nascondi" : "Mostra"}
            </div>
          </button>

          <div style={sectionStyle(openPrices, pricesColl.height)}>
            <div ref={pricesColl.innerRef} className="cardInner stack">
              <div className="rowBetween" style={{ gap: 10, flexWrap: "wrap" }}>
                <div className="subtle">Vengono salvati come centesimi.</div>
                <button type="button" className="btn btnGhost btnSmall" onClick={resetPricesToOriginal}>
                  Ripristina
                </button>
              </div>

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

              <div className="subtle">Stato: {saveStateLabel(saveState)}</div>
            </div>
          </div>
        </div>

        {/* PRESET (tendina) */}
        <div className="card">
          <button
            type="button"
            className="listRow"
            onClick={() => setOpenPreset((v) => !v)}
            aria-expanded={openPreset}
            style={{ width: "100%" }}
          >
            <div>
              <div style={{ fontWeight: 900 }}>Preset per giorno</div>
              <div className="subtle">Usato quando non c’è una delivery salvata</div>
            </div>
            <div className="subtle" style={{ fontWeight: 800 }}>
              {openPreset ? "Nascondi" : "Mostra"}
            </div>
          </button>

          <div style={sectionStyle(openPreset, presetColl.height)}>
            <div ref={presetColl.innerRef} className="cardInner stack">
              <div className="rowBetween" style={{ gap: 10, flexWrap: "wrap" }}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <button type="button" className="btn btnGhost btnSmall" onClick={resetPresetDayToOriginal}>
                    Ripristina giorno
                  </button>
                </div>

                <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button type="button" className="btn btnGhost btnSmall" onClick={() => void saveProfile("winter")}>
                    Salva in Inverno
                  </button>
                  <button type="button" className="btn btnGhost btnSmall" onClick={() => void saveProfile("summer")}>
                    Salva in Estate
                  </button>
                </div>
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

                    <Stepper value={activeExpected[p.id] ?? 0} onChange={(v) => setExpected(activeWeekday, p.id, v)} />
                  </div>
                ))}
              </div>

              <div className="subtle">
                Nota: <strong>Farcite (TOTALE)</strong> è calcolato e non si imposta qui.
              </div>

              <div className="subtle">Stato: {saveStateLabel(saveState)}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
