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

const PRODUCTS: ProductKey[] = [
  "Vuote",
  "Farcite",
  "Krapfen",
  "Trancio focaccia",
  "Focaccine",
  "Pizzette",
];

type ProductRow = { id: string; name: string; default_price_cents: number | null };
type PriceSettingRow = { product_id: string; price_cents: number };

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

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
        setErr(null);
        setOk(null);

        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name,default_price_cents")
          .in("name", PRODUCTS);

        if (prodErr) throw prodErr;
        const prod = (prodData ?? []) as ProductRow[];

        const idByName: Record<string, string> = {};
        for (const p of prod) idByName[p.name] = p.id;

        const { data: psData, error: psErr } = await supabase
          .from("price_settings")
          .select("product_id,price_cents");

        if (psErr) throw psErr;

        const ps = (psData ?? []) as PriceSettingRow[];

        const next: Record<ProductKey, string> = { ...prices };
        for (const name of PRODUCTS) {
          const id = idByName[name];
          const override = ps.find((r) => r.product_id === id);
          const cents = override?.price_cents ?? (prod.find((p) => p.name === name)?.default_price_cents ?? 0);
          next[name] = centsToEur(cents).toFixed(2).replace(".", ",");
        }

        if (!alive) return;
        setProducts(prod);
        setProductIdByName(idByName);
        setPrices(next);
      } catch (e: any) {
        setErr(e?.message ?? "Errore caricamento prezzi");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      setErr(null);
      setOk(null);

      for (const name of PRODUCTS) {
        const productId = productIdByName[name];
        if (!productId) continue;

        const cents = eurStringToCents(prices[name]);
        const { error } = await supabase
          .from("price_settings")
          .upsert({ product_id: productId, price_cents: cents }, { onConflict: "product_id" });

        if (error) throw error;
      }

      setOk("Prezzi salvati ✅");
    } catch (e: any) {
      setErr(e?.message ?? "Errore salvataggio prezzi");
    } finally {
      setSaving(false);
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

      <div className="fiuriCard">
        <div className="row" style={{ justifyContent: "flex-start", gap: 12 }}>
          <button className="btn btnPrimary" type="button" onClick={save} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva prezzi"}
          </button>

          <div className="muted" style={{ fontWeight: 900 }}>
            Prezzi in € (valgono per tutto il 2026)
          </div>
        </div>

        {err && <div className="noticeErr">{err}</div>}
        {ok && <div className="noticeOk">{ok}</div>}

        <div style={{ height: 12 }} />

        {PRODUCTS.map((name) => (
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
    </div>
  );
}
