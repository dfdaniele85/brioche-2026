import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { supabase } from "../lib/supabase";
import { weekdayIso, formatDayRow } from "../lib/date";
import { useSaveStatus } from "../lib/useSaveStatus";
import SaveStatusBadge from "../components/SaveStatusBadge";

type ProductRow = { id: string; name: string; default_price_cents: number | null };
type PriceSettingRow = { product_id: string; price_cents: number };
type WeeklyExpectedRow = { weekday: number; product_id: string; expected_qty: number };

type Category = { title: string; products: string[] };

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

const LEGACY_FARCITE = "Farcite";

const CATEGORIES: Category[] = [
  { title: "Farcite", products: [...FARCITE_GUSTI] },
  { title: "Vuote", products: ["Vuote"] },
  { title: "Krapfen", products: ["Krapfen"] },
  { title: "Focaccine", products: ["Focaccine"] },
  { title: "Pizzette", products: ["Pizzette"] },
  { title: "Trancio focaccia", products: ["Trancio focaccia"] },
];

function buildAllNames(hasLegacyFarcite: boolean): string[] {
  const base = Array.from(new Set(CATEGORIES.flatMap((c) => c.products)));
  return hasLegacyFarcite ? [LEGACY_FARCITE, ...base] : base;
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button className="stepBtn" type="button" onClick={() => onChange(Math.max(0, value - 1))}>
        −
      </button>
      <div className="qty">{value}</div>
      <button className="stepBtn" type="button" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

export default function StaffToday() {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const title = useMemo(() => formatDayRow(today), [today]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});
  const [priceCentsByName, setPriceCentsByName] = useState<Record<string, number>>({});
  const [expected, setExpected] = useState<Record<string, number>>({});

  const [received, setReceived] = useState<Record<string, number>>({});
  const [note, setNote] = useState<string>("");

  const saveStatus = useSaveStatus();

  const hasLegacy = Boolean(productIdByName[LEGACY_FARCITE]);
  const ALL_NAMES = useMemo(() => buildAllNames(hasLegacy), [hasLegacy]);

  const loadAll = async () => {
    // carica prodotti + prezzi + expected + delivery oggi
    // mantiene eventuali ricevuti già editati? NO: ricarichiamo e ricalcoliamo in modo coerente
    const { data: legacyCheck, error: legacyErr } = await supabase
      .from("products")
      .select("id,name")
      .eq("name", LEGACY_FARCITE)
      .limit(1);

    if (legacyErr) throw legacyErr;
    const hasLegacyNow = (legacyCheck ?? []).length > 0;

    const names = buildAllNames(hasLegacyNow);

    const { data: prodData, error: prodErr } = await supabase
      .from("products")
      .select("id,name,default_price_cents")
      .in("name", names);

    if (prodErr) throw prodErr;
    const products = (prodData ?? []) as ProductRow[];

    const idByName: Record<string, string> = {};
    const defaultPriceByName: Record<string, number> = {};
    const nameById: Record<string, string> = {};
    for (const p of products) {
      idByName[p.name] = p.id;
      nameById[p.id] = p.name;
      defaultPriceByName[p.name] = p.default_price_cents ?? 0;
    }

    const { data: psData, error: psErr } = await supabase
      .from("price_settings")
      .select("product_id,price_cents");

    if (psErr) throw psErr;
    const ps = (psData ?? []) as PriceSettingRow[];

    const priceByName: Record<string, number> = { ...defaultPriceByName };
    for (const row of ps) {
      const nm = nameById[row.product_id];
      if (nm) priceByName[nm] = row.price_cents;
    }

    const wd = weekdayIso(today);

    const { data: weData, error: weErr } = await supabase
      .from("weekly_expected")
      .select("weekday,product_id,expected_qty")
      .eq("weekday", wd);

    if (weErr) throw weErr;

    const expByName: Record<string, number> = {};
    for (const nm of names) expByName[nm] = 0;

    const weekly = (weData ?? []) as WeeklyExpectedRow[];
    for (const r of weekly) {
      const nm = nameById[r.product_id];
      if (!nm) continue;
      expByName[nm] = Number(r.expected_qty ?? 0);
    }

    const { data: delivs, error: delErr } = await supabase
      .from("deliveries")
      .select("id,note")
      .eq("delivery_date", today)
      .limit(1);

    if (delErr) throw delErr;

    const deliveryId = delivs?.[0]?.id as string | undefined;
    const savedNote = (delivs?.[0]?.note as string | null) ?? "";

    let rec: Record<string, number> = {};
    if (deliveryId) {
      const { data: itData, error: itErr } = await supabase
        .from("delivery_items")
        .select("product_id,received_qty")
        .eq("delivery_id", deliveryId);

      if (itErr) throw itErr;

      (itData ?? []).forEach((it: any) => {
        const nm = nameById[it.product_id];
        if (!nm) return;
        rec[nm] = Number(it.received_qty ?? 0);
      });
    }

    const initialReceived: Record<string, number> = {};
    for (const nm of names) {
      initialReceived[nm] = rec[nm] ?? expByName[nm] ?? 0;
    }

    setProductIdByName(idByName);
    setPriceCentsByName(priceByName);
    setExpected(expByName);
    setReceived(initialReceived);
    setNote(savedNote);
  };

  const reloadExpectedOnly = async () => {
    // ricarica SOLO expected dal weekday corrente e aggiorna i valori "Atteso" (senza toccare received)
    const wd = weekdayIso(today);

    // serve mapping id->name: usiamo productIdByName già caricato
    const nameById: Record<string, string> = {};
    for (const [nm, id] of Object.entries(productIdByName)) nameById[id] = nm;

    const { data: weData, error: weErr } = await supabase
      .from("weekly_expected")
      .select("weekday,product_id,expected_qty")
      .eq("weekday", wd);

    if (weErr) throw weErr;

    const expByName: Record<string, number> = {};
    for (const nm of Object.keys(productIdByName)) expByName[nm] = 0;

    const weekly = (weData ?? []) as WeeklyExpectedRow[];
    for (const r of weekly) {
      const nm = nameById[r.product_id];
      if (!nm) continue;
      expByName[nm] = Number(r.expected_qty ?? 0);
    }

    setExpected(expByName);
  };

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        await loadAll();
      } catch (e) {
        console.error(e);
        alert("Errore caricamento dati (guarda console)");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    // ascolta cambi attese da Settings (localStorage)
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "weekly_expected_updated_at") {
        // ricarico solo gli attesi
        void reloadExpectedOnly().catch((e) => console.error(e));
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      alive = false;
      window.removeEventListener("storage", onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const save = async () => {
    try {
      setSaving(true);
      saveStatus.markSaving();

      const { data: delivery, error: delErr } = await supabase
        .from("deliveries")
        .upsert({ delivery_date: today, note: note || null }, { onConflict: "delivery_date" })
        .select("id")
        .single();

      if (delErr) throw delErr;
      const deliveryId = delivery.id as string;

      for (const nm of ALL_NAMES) {
        const productId = productIdByName[nm];
        if (!productId) continue;

        const unitPrice = priceCentsByName[nm] ?? 0;
        const exp = Number(expected[nm] ?? 0);
        const rec = Number(received[nm] ?? 0);

        const { error: itErr } = await supabase.from("delivery_items").upsert(
          {
            delivery_id: deliveryId,
            product_id: productId,
            expected_qty: exp,
            received_qty: rec,
            unit_price_cents: unitPrice,
            note: null,
          },
          { onConflict: "delivery_id,product_id" }
        );

        if (itErr) throw itErr;
      }

      saveStatus.markSaved();
    } catch (e) {
      console.error(e);
      saveStatus.markError();
      alert("Errore salvataggio ❌ (guarda console)");
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
      <div className="row" style={{ alignItems: "center", gap: 10 }}>
        <h1 className="fiuriTitle">Oggi</h1>
        <SaveStatusBadge status={saveStatus.status} />
      </div>

      <div className="muted" style={{ fontWeight: 900, marginTop: 4 }}>
        {title}
      </div>

      <div style={{ height: 10 }} />

      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button
          className="btn"
          type="button"
          onClick={() => {
            void reloadExpectedOnly().catch((e) => {
              console.error(e);
              alert("Errore ricarica attese");
            });
          }}
        >
          Ricarica attese
        </button>
      </div>

      <div style={{ height: 10 }} />

      <div className="fiuriCard" style={{ borderRadius: 16 }}>
        {hasLegacy ? (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Farcite (vecchio)</div>

            <div className="row" style={{ padding: "10px 0" }}>
              <div className="rowLeft">
                <div style={{ fontWeight: 900, fontSize: 20 }}>{LEGACY_FARCITE}</div>
                <div className="muted" style={{ fontWeight: 900 }}>
                  Atteso: {Number(expected[LEGACY_FARCITE] ?? 0)}
                </div>
              </div>

              <Stepper
                value={Number(received[LEGACY_FARCITE] ?? 0)}
                onChange={(v) => {
                  saveStatus.markDirty();
                  setReceived((prev) => ({ ...prev, [LEGACY_FARCITE]: v }));
                }}
              />
            </div>

            <hr />
          </div>
        ) : null}

        {CATEGORIES.map((cat) => (
          <div key={cat.title} style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{cat.title}</div>

            {cat.products.map((nm) => (
              <div key={nm} className="row" style={{ padding: "10px 0" }}>
                <div className="rowLeft">
                  <div style={{ fontWeight: 900, fontSize: 20 }}>{nm}</div>
                  <div className="muted" style={{ fontWeight: 900 }}>
                    Atteso: {Number(expected[nm] ?? 0)}
                  </div>
                </div>

                <Stepper
                  value={Number(received[nm] ?? 0)}
                  onChange={(v) => {
                    saveStatus.markDirty();
                    setReceived((prev) => ({ ...prev, [nm]: v }));
                  }}
                />
              </div>
            ))}

            <hr />
          </div>
        ))}

        <div style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontWeight: 900, marginBottom: 6 }}>
            Note
          </div>
          <textarea
            className="input"
            placeholder="Note"
            value={note}
            onChange={(e) => {
              saveStatus.markDirty();
              setNote(e.target.value);
            }}
            style={{ minHeight: 70 }}
          />
        </div>

        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button
            className="btn"
            type="button"
            onClick={() => {
              saveStatus.markDirty();
              setReceived((prev) => {
                const next = { ...prev };
                for (const nm of ALL_NAMES) next[nm] = Number(expected[nm] ?? 0);
                return next;
              });
            }}
          >
            Tutto OK
          </button>

          <button className="btn btnPrimary" type="button" onClick={save} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
