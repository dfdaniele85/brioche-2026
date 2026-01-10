import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { centsToEur, eurStringToCents } from "../lib/prices";
import { toast } from "../lib/toast";
import { Page, Card, SectionTitle } from "../components/ui";

type ProductKey =
  | "Vuote"
  | "Farcite"
  | "Krapfen"
  | "Trancio focaccia"
  | "Focaccine"
  | "Pizzette";

const BASE_PRODUCTS: ProductKey[] = [
  "Vuote",
  "Farcite",
  "Krapfen",
  "Trancio focaccia",
  "Focaccine",
  "Pizzette",
];

const FARCITE_GUSTI = [
  "Farcite - Crema",
  "Farcite - Ricotta",
  "Farcite - Cioccolato",
  "Farcite - Nocciola",
  "Farcite - Albicocca",
  "Farcite - Frutti rossi",
  "Farcite - Integrale",
  "Farcite - Vegana",
  "Farcite - Pan suisse",
  "Farcite - Girella",
] as const;

const CATALOG: { category: string; products: string[] }[] = [
  { category: "Farcite", products: [...FARCITE_GUSTI] },
  { category: "Vuote", products: ["Vuote"] },
  { category: "Krapfen", products: ["Krapfen"] },
  { category: "Focaccine", products: ["Focaccine"] },
  { category: "Pizzette", products: ["Pizzette"] },
  { category: "Trancio focaccia", products: ["Trancio focaccia"] },
];

const ALL_NAMES = Array.from(new Set(CATALOG.flatMap((c) => c.products)));

type ProductRow = { id: string; name: string; default_price_cents: number | null };
type PriceSettingRow = { product_id: string; price_cents: number };
type ExpectedRow = { weekday: number; product_id: string; expected_qty: number };

const WEEKDAYS: { id: number; label: string }[] = [
  { id: 1, label: "Lunedì" },
  { id: 2, label: "Martedì" },
  { id: 3, label: "Mercoledì" },
  { id: 4, label: "Giovedì" },
  { id: 5, label: "Venerdì" },
  { id: 6, label: "Sabato" },
  { id: 7, label: "Domenica" },
];

function notifyWeeklyExpectedChanged() {
  const ts = String(Date.now());
  localStorage.setItem("weekly_expected_updated_at", ts);

  window.dispatchEvent(new CustomEvent("weeklyExpectedUpdated", { detail: { ts } }));

  try {
    const bc = new BroadcastChannel("brioche_weekly_expected");
    bc.postMessage({ ts });
    bc.close();
  } catch {
    // ok
  }
}

function shortName(name: string, category: string) {
  if (category !== "Farcite") return name;
  return name.replace("Farcite - ", "");
}

export default function Settings() {
  const [loading, setLoading] = useState(true);

  const [savingPrices, setSavingPrices] = useState(false);
  const [savingExpected, setSavingExpected] = useState(false);
  const [weekdayTab, setWeekdayTab] = useState<number>(1);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});

  const [prices, setPrices] = useState<Record<ProductKey, string>>({
    Vuote: "0,60",
    Farcite: "0,70",
    Krapfen: "1,20",
    "Trancio focaccia": "1,00",
    Focaccine: "0,40",
    Pizzette: "0,50",
  });

  const [expected, setExpected] = useState<Record<number, Record<string, number>>>({});

  const defaultByName = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) m[p.name] = p.default_price_cents ?? 0;
    return m;
  }, [products]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name,default_price_cents")
          .in("name", ALL_NAMES);

        if (prodErr) throw prodErr;
        const prod = (prodData ?? []) as ProductRow[];

        const idByName: Record<string, string> = {};
        for (const p of prod) idByName[p.name] = p.id;

        const { data: psData, error: psErr } = await supabase
          .from("price_settings")
          .select("product_id,price_cents");

        if (psErr) throw psErr;
        const ps = (psData ?? []) as PriceSettingRow[];

        const nextPrices: Record<ProductKey, string> = { ...prices };
        for (const name of BASE_PRODUCTS) {
          const id = idByName[name];
          const override = ps.find((r) => r.product_id === id);
          const cents =
            override?.price_cents ??
            (prod.find((p) => p.name === name)?.default_price_cents ?? 0);

          nextPrices[name] = centsToEur(cents).toFixed(2).replace(".", ",");
        }

        // expected init
        const nextExpected: Record<number, Record<string, number>> = {};
        for (const w of WEEKDAYS) nextExpected[w.id] = {};
        for (const w of WEEKDAYS) for (const p of prod) nextExpected[w.id][p.id] = 0;

        const { data: weData, error: weErr } = await supabase
          .from("weekly_expected")
          .select("weekday,product_id,expected_qty");

        if (!weErr) {
          const we = (weData ?? []) as ExpectedRow[];
          for (const r of we) {
            if (!nextExpected[r.weekday]) nextExpected[r.weekday] = {};
            nextExpected[r.weekday][r.product_id] = Number(r.expected_qty ?? 0);
          }
        }

        if (!alive) return;
        setProducts(prod);
        setProductIdByName(idByName);
        setPrices(nextPrices);
        setExpected(nextExpected);

        if (weErr) {
          toast.error("Tabella weekly_expected non trovata o non accessibile");
        }
      } catch (e: any) {
        console.error(e);
        toast.error(e?.message ?? "Errore caricamento impostazioni");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePrices = async () => {
    try {
      setSavingPrices(true);

      for (const name of BASE_PRODUCTS) {
        const productId = productIdByName[name];
        if (!productId) continue;

        const cents = eurStringToCents(prices[name]);

        const { error } = await supabase
          .from("price_settings")
          .upsert({ product_id: productId, price_cents: cents }, { onConflict: "product_id" });

        if (error) throw error;
      }

      toast.success("Prezzi salvati ✓");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Errore salvataggio prezzi");
    } finally {
      setSavingPrices(false);
    }
  };

  const setExpectedQty = (weekday: number, productId: string, qty: number) => {
    setExpected((prev) => ({
      ...prev,
      [weekday]: {
        ...(prev[weekday] ?? {}),
        [productId]: Math.max(0, Math.floor(qty || 0)),
      },
    }));
  };

  const saveExpected = async () => {
    try {
      setSavingExpected(true);

      const payload: ExpectedRow[] = [];
      for (const w of WEEKDAYS) {
        const byProd = expected[w.id] ?? {};
        for (const productId of Object.keys(byProd)) {
          payload.push({
            weekday: w.id,
            product_id: productId,
            expected_qty: Number(byProd[productId] ?? 0),
          });
        }
      }

      const { error } = await supabase
        .from("weekly_expected")
        .upsert(payload, { onConflict: "weekday,product_id" });

      if (error) throw error;

      notifyWeeklyExpectedChanged();
      toast.success("Attese settimanali salvate ✓");
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Errore salvataggio attese");
    } finally {
      setSavingExpected(false);
    }
  };

  const currentWeekdayLabel = WEEKDAYS.find((w) => w.id === weekdayTab)?.label ?? "";

  if (loading) {
    return (
      <div className="fiuriContainer">
        <div className="fiuriCard">Caricamento...</div>
      </div>
    );
  }

  return (
    <Page title="Impostazioni">
      {/* PREZZI */}
      <Card>
        <div className="row" style={{ padding: 0, alignItems: "center" }}>
          <div className="rowLeft">
            <SectionTitle>Prezzi (2026)</SectionTitle>
            <div className="muted" style={{ fontWeight: 900, marginTop: -6 }}>
              Valgono per tutto il 2026
            </div>
          </div>

          <button className="btn btnPrimary" type="button" onClick={savePrices} disabled={savingPrices}>
            {savingPrices ? "Salvataggio..." : "Salva"}
          </button>
        </div>

        <div style={{ height: 10 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {BASE_PRODUCTS.map((name, idx) => (
            <div
              key={name}
              style={{
                paddingBottom: 10,
                borderBottom: idx === BASE_PRODUCTS.length - 1 ? "none" : "1px solid rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ fontWeight: 1000, fontSize: 14 }}>{name}</div>
              <div className="muted" style={{ fontWeight: 900, marginTop: 2 }}>
                Default: {centsToEur(defaultByName[name] ?? 0).toFixed(2).replace(".", ",")} €
              </div>

              <div style={{ height: 8 }} />
              <input
                className="input"
                value={prices[name]}
                onChange={(e) => setPrices((p) => ({ ...p, [name]: e.target.value }))}
                placeholder={centsToEur(defaultByName[name] ?? 0).toFixed(2).replace(".", ",")}
                inputMode="decimal"
              />
            </div>
          ))}
        </div>
      </Card>

      <div style={{ height: 12 }} />

      {/* ATTESE */}
      <Card>
        <div className="row" style={{ padding: 0, alignItems: "center" }}>
          <div className="rowLeft">
            <SectionTitle>Attese settimanali</SectionTitle>
            <div className="muted" style={{ fontWeight: 900, marginTop: -6 }}>
              Giorno selezionato: {currentWeekdayLabel}
            </div>
          </div>

          <button className="btn btnPrimary" type="button" onClick={saveExpected} disabled={savingExpected}>
            {savingExpected ? "Salvataggio..." : "Salva"}
          </button>
        </div>

        <div style={{ height: 10 }} />

        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-start", padding: 0 }}>
          {WEEKDAYS.map((w) => (
            <button
              key={w.id}
              className={`chip ${weekdayTab === w.id ? "chipActive" : ""}`}
              type="button"
              onClick={() => setWeekdayTab(w.id)}
            >
              {w.label}
            </button>
          ))}
        </div>

        <div style={{ height: 12 }} />

        {CATALOG.map((cat, cIdx) => (
          <div key={cat.category} style={{ marginTop: cIdx === 0 ? 0 : 14 }}>
            <SectionTitle>{cat.category}</SectionTitle>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cat.products.map((name) => {
                const productId = productIdByName[name];

                if (!productId) {
                  return (
                    <div key={name} className="muted" style={{ padding: "8px 0", fontWeight: 900 }}>
                      {name} — manca in tabella products
                    </div>
                  );
                }

                const v = expected[weekdayTab]?.[productId] ?? 0;

                return (
                  <div
                    key={name}
                    className="row"
                    style={{
                      padding: "10px 0",
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <div className="rowLeft">
                      <div style={{ fontWeight: 1000, fontSize: 14 }}>{shortName(name, cat.category)}</div>
                      {cat.category === "Farcite" ? (
                        <div className="muted" style={{ fontWeight: 900 }}>
                          Farcite
                        </div>
                      ) : null}
                    </div>

                    <input
                      className="input"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={v}
                      onChange={(e) => setExpectedQty(weekdayTab, productId, Number(e.target.value))}
                      style={{ width: 110, textAlign: "right" }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Card>
    </Page>
  );
}
