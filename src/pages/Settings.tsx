import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { centsToEur, eurStringToCents } from "../lib/prices";

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

export default function Settings() {
  const [loading, setLoading] = useState(true);

  // --- Prezzi
  const [savingPrices, setSavingPrices] = useState(false);
  const [errPrices, setErrPrices] = useState<string | null>(null);
  const [okPrices, setOkPrices] = useState<string | null>(null);

  // --- Attese
  const [savingExpected, setSavingExpected] = useState(false);
  const [errExpected, setErrExpected] = useState<string | null>(null);
  const [okExpected, setOkExpected] = useState<string | null>(null);
  const [weekdayTab, setWeekdayTab] = useState<number>(1);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});

  // prezzi base (solo 6 macro)
  const [prices, setPrices] = useState<Record<ProductKey, string>>({
    Vuote: "0,60",
    Farcite: "0,70",
    Krapfen: "1,20",
    "Trancio focaccia": "1,00",
    Focaccine: "0,40",
    Pizzette: "0,50",
  });

  // attese: weekday -> productId -> qty
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

        // reset messaggi
        setErrPrices(null);
        setOkPrices(null);
        setErrExpected(null);
        setOkExpected(null);

        // 1) prodotti (include gusti farcite + base)
        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name,default_price_cents")
          .in("name", ALL_NAMES);

        if (prodErr) throw prodErr;
        const prod = (prodData ?? []) as ProductRow[];

        const idByName: Record<string, string> = {};
        for (const p of prod) idByName[p.name] = p.id;

        // 2) price settings (solo per i 6 base)
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

        // 3) weekly_expected (se la tabella non esiste ancora, gestiamo errore in modo soft)
        const nextExpected: Record<number, Record<string, number>> = {};
        for (const w of WEEKDAYS) nextExpected[w.id] = {};

        // init a 0 per i prodotti presenti
        for (const w of WEEKDAYS) {
          for (const p of prod) nextExpected[w.id][p.id] = 0;
        }

        const { data: weData, error: weErr } = await supabase
          .from("weekly_expected")
          .select("weekday,product_id,expected_qty");

        // se manca tabella, non blocchiamo la pagina
        if (!weErr) {
          const we = (weData ?? []) as ExpectedRow[];
          for (const r of we) {
            if (!nextExpected[r.weekday]) nextExpected[r.weekday] = {};
            nextExpected[r.weekday][r.product_id] = Number(r.expected_qty ?? 0);
          }
        } else {
          // mostriamo errore solo nella sezione attese
          setErrExpected(
            "Tabella weekly_expected non trovata. Prima dobbiamo crearla su Supabase (step successivo)."
          );
        }

        if (!alive) return;
        setProducts(prod);
        setProductIdByName(idByName);
        setPrices(nextPrices);
        setExpected(nextExpected);
      } catch (e: any) {
        // errore “generale”
        if (alive) {
          setErrPrices(e?.message ?? "Errore caricamento impostazioni");
        }
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
        [productId]: Math.max(0, Math.floor(qty || 0)),
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
            expected_qty: Number(byProd[productId] ?? 0),
          });
        }
      }

      const { error } = await supabase
        .from("weekly_expected")
        .upsert(payload, { onConflict: "weekday,product_id" });

      if (error) throw error;

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
    <div className="fiuriContainer">
      <h1 className="fiuriTitle">Impostazioni</h1>
      <div style={{ height: 12 }} />

      {/* =======================
          PREZZI
      ======================= */}
      <div className="fiuriCard">
        <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
          <button className="btn btnPrimary" type="button" onClick={savePrices} disabled={savingPrices}>
            {savingPrices ? "Salvataggio..." : "Salva prezzi"}
          </button>

          <div className="muted" style={{ fontWeight: 900 }}>
            Prezzi in € (valgono per tutto il 2026)
          </div>
        </div>

        {errPrices && <div className="noticeErr">{errPrices}</div>}
        {okPrices && <div className="noticeOk">{okPrices}</div>}

        <div style={{ height: 12 }} />

        {BASE_PRODUCTS.map((name) => (
          <div key={name} style={{ padding: "12px 0" }}>
            <div style={{ fontWeight: 900, fontSize: 24 }}>{name}</div>
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

      <div style={{ height: 14 }} />

      {/* =======================
          ATTESE SETTIMANALI
      ======================= */}
      <div className="fiuriCard">
        <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
          <button
            className="btn btnPrimary"
            type="button"
            onClick={saveExpected}
            disabled={savingExpected}
          >
            {savingExpected ? "Salvataggio..." : "Salva attese"}
          </button>

          <div className="muted" style={{ fontWeight: 900 }}>
            Attese per giorno della settimana (per categorie e gusti)
          </div>
        </div>

        {errExpected && <div className="noticeErr">{errExpected}</div>}
        {okExpected && <div className="noticeOk">{okExpected}</div>}

        <div style={{ height: 12 }} />

        {/* Tabs giorni */}
        <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-start" }}>
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

        <div style={{ height: 10 }} />

        {/* Liste per categoria */}
        {CATALOG.map((cat) => (
          <div key={cat.category} style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 20 }}>{cat.category}</div>
            <div style={{ height: 6 }} />

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
                <div key={name} className="row" style={{ padding: "8px 0" }}>
                  <div className="rowLeft">
                    <div style={{ fontWeight: 900, fontSize: 18 }}>{name}</div>
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
        ))}
      </div>
    </div>
  );
}
