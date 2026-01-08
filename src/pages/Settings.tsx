import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type ProductName =
  | "Vuote"
  | "Farcite"
  | "Krapfen"
  | "Trancio focaccia"
  | "Focaccine"
  | "Pizzette";

const PRODUCTS: ProductName[] = [
  "Vuote",
  "Farcite",
  "Krapfen",
  "Trancio focaccia",
  "Focaccine",
  "Pizzette",
];

type ProductRow = {
  id: string;
  name: string;
  default_price_cents: number | null;
};

type PriceSettingRow = {
  product_id: string;
  price_cents: number;
};

function toCentsFromInput(v: string) {
  const s = v.replace(",", ".").trim();
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function toInputFromCents(c: number) {
  return (c / 100).toFixed(2).replace(".", ",");
}

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [priceCentsByProductId, setPriceCentsByProductId] = useState<Record<string, number>>({});

  const productByName = useMemo(() => {
    const map: Record<string, ProductRow> = {};
    products.forEach((p) => (map[p.name] = p));
    return map;
  }, [products]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name,default_price_cents")
          .in("name", PRODUCTS);

        if (prodErr) throw prodErr;

        const prods = (prodData ?? []) as ProductRow[];

        const { data: psData, error: psErr } = await supabase
          .from("price_settings")
          .select("product_id,price_cents");

        if (psErr) throw psErr;

        const ps = (psData ?? []) as PriceSettingRow[];

        const map: Record<string, number> = {};
        prods.forEach((p) => (map[p.id] = p.default_price_cents ?? 0));
        ps.forEach((row) => {
          map[row.product_id] = row.price_cents;
        });

        if (!alive) return;
        setProducts(prods);
        setPriceCentsByProductId(map);
      } catch (e) {
        console.error(e);
        alert("Errore caricamento prezzi ❌ (guarda console)");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    try {
      setSaving(true);

      const rows: PriceSettingRow[] = products.map((p) => ({
        product_id: p.id,
        price_cents: priceCentsByProductId[p.id] ?? (p.default_price_cents ?? 0),
      }));

      const { error } = await supabase
        .from("price_settings")
        .upsert(rows, { onConflict: "product_id" });

      if (error) throw error;

      alert("Prezzi salvati ✅");
    } catch (e) {
      console.error(e);
      alert("Errore salvataggio ❌ (guarda console)");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container">
      <div className="row space" style={{ alignItems: "center" }}>
        <h2>Impostazioni</h2>

        <button className="btn btnPrimary" type="button" disabled={loading || saving} onClick={save}>
          {saving ? "Salvataggio..." : "Salva prezzi"}
        </button>
      </div>

      <div style={{ height: 12 }} />

      <div className="card" style={{ borderRadius: 14 }}>
        {loading ? (
          <div>Caricamento...</div>
        ) : (
          <>
            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Prezzi in € (valgono per tutto il 2026)
            </div>

            {PRODUCTS.map((name) => {
              const p = productByName[name];
              if (!p) return null;

              const cents = priceCentsByProductId[p.id] ?? (p.default_price_cents ?? 0);

              return (
                <div key={p.id} className="row space" style={{ padding: "10px 0" }}>
                  <div style={{ fontWeight: 900 }}>{name}</div>

                  <input
                    className="input"
                    style={{ width: 120, textAlign: "right" }}
                    inputMode="decimal"
                    value={toInputFromCents(cents)}
                    onChange={(e) => {
                      const newCents = toCentsFromInput(e.target.value);
                      setPriceCentsByProductId((prev) => ({ ...prev, [p.id]: newCents }));
                    }}
                  />
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
