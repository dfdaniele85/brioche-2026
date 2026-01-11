import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { centsToEur, eurStringToCents } from "../lib/prices";
import { Page, Card, SectionTitle } from "../components/ui";

type ProductKey = "Vuote" | "Farcite" | "Krapfen" | "Trancio focaccia" | "Focaccine" | "Pizzette";

const BASE_PRODUCTS: ProductKey[] = ["Vuote", "Farcite", "Krapfen", "Trancio focaccia", "Focaccine", "Pizzette"];

const FARCITE_GUSTI = [
  "Farcite - Crema",
  "Farcite - Ricotta",
  "Farcite - Cioccolato",
  "Farcite - Nocciola",
  "Farcite - Albicocca",
  "Farcite - Frutti rossi",
  "Farcite - Integrale",
  "Farcite - Vegana",
  "Farcite - Pan gocciole",
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

  // stesso tab
  window.dispatchEvent(new CustomEvent("weeklyExpectedUpdated", { detail: { ts } }));

  // cross-tab
  try {
    const bc = new BroadcastChannel("brioche_weekly_expected");
    bc.postMessage({ ts });
    bc.close();
  } catch {
    // ok
  }
}

function clampInt(v: number) {
  return Math.max(0, Math.floor(Number.isFinite(v) ? v : 0));
}

export default function Settings() {
  const [loading, setLoading] = useState(true);

  const [savingPrices, setSavingPrices] = useState(false);
  const [errPrices, setErrPrices] = useState<string | null>(null);
  const [okPrices, setOkPrices] = useState<string | null>(null);

  const [savingExpected, setSavingExpected] = useState(false);
  const [errExpected, setErrExpected] = useState<string | null>(null);
  const [okExpected, setOkExpected] = useState<string | null>(null);
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
        setErrPrices(null);
        setOkPrices(null);
        setErrExpected(null);
        setOkExpected(null);

        // prodotti
        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name,default_price_cents")
          .in("name", ALL_NAMES);

        if (prodErr) throw prodErr;
        const prod = (prodData ?? []) as ProductRow[];

        const idByName: Record<string, string> = {};
        for (const p of prod) idByName[p.name] = p.id;

        // price_settings
        const { data: psData, error: psErr } = await supabase.from("price_settings").select("product_id,price_cents");
        if (psErr) throw psErr;
        const ps = (psData ?? []) as PriceSettingRow[];

        const nextPrices: Record<ProductKey, string> = { ...prices };
        for (const name of BASE_PRODUCTS) {
          const id = idByName[name];
          const override = ps.find((r) => r.product_id === id);
          const cents = override?.price_cents ?? (prod.find((p) => p.name === name)?.default_price_cents ?? 0);
          nextPrices[name] = centsToEur(cents).toFixed(2).replace(".", ",");
        }

        // expected init
        const nextExpected: Record<number, Record<string, number>> = {};
        for (const w of WEEKDAYS) nextExpected[w.id] = {};
        for (const w of WEEKDAYS) for (const p of prod) nextExpected[w.id][p.id] = 0;

        // weekly_expected
        const { data: weData, error: weErr } = await supabase.from("weekly_expected").select("weekday,product_id,expected_qty");

        if (weErr) {
          setErrExpected("Tabella weekly_expected non trovata o non accessibile.");
        } else {
          const we = (weData ?? []) as ExpectedRow[];
          for (const r of we) {
            if (!nextExpected[r.weekday]) nextExpected[r.weekday] = {};
            nextExpected[r.weekday][r.product_id] = clampInt(Number(r.expected_qty ?? 0));
          }
        }

        if (!alive) return;
        setProducts(prod);
        setProductIdByName(idByName);
        setPrices(nextPrices);
        setExpected(nextExpected);
      } catch (e: any) {
        if (alive) setErrPrices(e?.message ?? "Errore caricamento impostazioni");
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
      setErrPrices(null);
      setOkPrices(null);

      for (const name of BASE_PRODUCTS) {
        const productId = productIdByName[name];
        if (!productId) continue;

        const cents = eurStringToCents(prices[name]);

        const { error } = await supabase
          .from("price_settings")
          .upsert({ product_id: productId, price_cents: cents }, { onConflict: "product_id" });

        if (error) throw error;
      }

      setOkPrices("Prezzi salvati ✅");
    } catch (e: any) {
      setErrPrices(e?.message ?? "Errore salvataggio prezzi");
    } finally {
      setSavingPrices(false);
    }
  };

  const setExpectedQty = (weekday: number, productId: string, qty: number) => {
    setExpected((prev) => ({
      ...prev,
      [weekday]: {
        ...(prev[weekday] ?? {}),
        [productId]: clampInt(qty),
      },
    }));
  };

  const saveExpected = async () => {
    try {
      setSavingExpected(true);
      setErrExpected(null);
      setOkExpected(null);

      const payload: ExpectedRow[] = [];
      for (const w of WEEKDAYS) {
        const byProd = expected[w.id] ?? {};
        for (const productId of Object.keys(byProd)) {
          payload.push({
            weekday: w.id,
            product_id: productId,
            expected_qty: clampInt(Number(byProd[productId] ?? 0)),
          });
        }
      }

      const { error } = await supabase.from("weekly_expected").upsert(payload, { onConflict: "weekday,product_id" });
      if (error) throw error;

      notifyWeeklyExpectedChanged();
      setOkExpected("Attese settimanali salvate ✅");
    } catch (e: any) {
      console.error(e);
      setErrExpected(e?.message ?? "Errore salvataggio attese");
    } finally {
      setSavingExpected(false);
    }
  };

  if (loading) {
    return (
      <div className="fiuriContainer">
        <div className="fiuriCard">Caricamento...</div>
      </div>
    );
  }

  return (
    <Page title="Impostazioni">
      <Card>
        <SectionTitle>Prezzi</SectionTitle>
        <div className="muted" style={{ marginBottom: 10 }}>
          Valgono per tutto il 2026
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {BASE_PRODUCTS.map((name) => (
            <div key={name} className="row">
              <div className="rowLeft">
                <div style={{ fontWeight: 900, fontSize: 14 }}>{name}</div>
                <div className="muted" style={{ fontWeight: 900 }}>
                  Default: {centsToEur(defaultByName[name] ?? 0).toFixed(2).replace(".", ",")} €
                </div>
              </div>

              <input
                className="input"
                value={prices[name]}
                onChange={(e) => setPrices((p) => ({ ...p, [name]: e.target.value }))}
                inputMode="decimal"
                style={{ maxWidth: 120, textAlign: "right" }}
              />
            </div>
          ))}
        </div>

        <div className="stickyActions" style={{ marginTop: 12 }}>
          <button className="btn btnPrimary" type="button" onClick={savePrices} disabled={savingPrices}>
            {savingPrices ? "Salvataggio..." : "Salva prezzi"}
          </button>
        </div>

        {errPrices && <div className="noticeErr">{errPrices}</div>}
        {okPrices && <div className="noticeOk">{okPrices}</div>}
      </Card>

      <div style={{ height: 14 }} />

      <Card>
        <SectionTitle>Attese settimanali</SectionTitle>
        <div className="muted" style={{ marginBottom: 10 }}>
          Attese per giorno della settimana (categorie e gusti)
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-start", marginBottom: 10 }}>
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

        {CATALOG.map((cat) => (
          <div key={cat.category} style={{ marginTop: 14 }}>
            <SectionTitle>{cat.category}</SectionTitle>

            <div style={{ border: "1px solid rgba(0,0,0,0.06)", borderRadius: 14, padding: 10 }}>
              {cat.products.map((name, idx) => {
                const productId = productIdByName[name];
                if (!productId) {
                  return (
                    <div key={name} className="muted" style={{ padding: "8px 0", fontWeight: 900 }}>
                      {name} — manca in tabella products
                    </div>
                  );
                }

                const v = expected[weekdayTab]?.[productId] ?? 0;
                const last = idx === cat.products.length - 1;

                return (
                  <div
                    key={name}
                    style={{
                      padding: "8px 0",
                      borderBottom: last ? "none" : "1px solid rgba(0,0,0,0.06)",
                    }}
                  >
                    <div className="row">
                      <div className="rowLeft">
                        <div style={{ fontWeight: 900, fontSize: 14 }}>{name}</div>
                      </div>

                      <input
                        className="input"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={v}
                        onChange={(e) => setExpectedQty(weekdayTab, productId, Number(e.target.value))}
                        style={{ width: 90, textAlign: "right" }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div className="stickyActions" style={{ marginTop: 12 }}>
          <button className="btn btnPrimary" type="button" onClick={saveExpected} disabled={savingExpected}>
            {savingExpected ? "Salvataggio..." : "Salva attese"}
          </button>
        </div>

        {errExpected && <div className="noticeErr">{errExpected}</div>}
        {okExpected && <div className="noticeOk">{okExpected}</div>}
      </Card>
    </Page>
  );
}
