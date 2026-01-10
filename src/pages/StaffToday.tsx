import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "../lib/dayjsIt";
import { supabase } from "../lib/supabase";
import { weekdayIso, formatDayRow } from "../lib/date";
import { useSaveStatus } from "../lib/useSaveStatus";
import SaveStatusBadge from "../components/SaveStatusBadge";
import { toast } from "../lib/toast";
import { Page, Card, SectionTitle } from "../components/ui";

type ProductRow = { id: string; name: string; default_price_cents: number | null };
type PriceSettingRow = { product_id: string; price_cents: number };
type WeeklyRow = { product_id: string; expected_qty: number | null };

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

const CATEGORIES: Category[] = [
  { title: "Farcite", products: [...FARCITE_GUSTI] },
  { title: "Vuote", products: ["Vuote"] },
  { title: "Krapfen", products: ["Krapfen"] },
  { title: "Focaccine", products: ["Focaccine"] },
  { title: "Pizzette", products: ["Pizzette"] },
  { title: "Trancio focaccia", products: ["Trancio focaccia"] },
];

const ALL_NAMES = Array.from(new Set(CATEGORIES.flatMap((c) => c.products)));

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

function stableKey(obj: Record<string, number>) {
  const keys = Object.keys(obj).sort();
  return keys.map((k) => `${k}:${obj[k] ?? 0}`).join("|");
}

function shortName(nm: string, catTitle: string) {
  if (catTitle !== "Farcite") return nm;
  return nm.replace("Farcite - ", "");
}

export default function StaffToday() {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const wd = useMemo(() => weekdayIso(today), [today]);
  const subtitle = useMemo(() => formatDayRow(today), [today]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [priceCentsByName, setPriceCentsByName] = useState<Record<string, number>>({});

  const [expected, setExpected] = useState<Record<string, number>>({});
  const [received, setReceived] = useState<Record<string, number>>({});
  const [note, setNote] = useState<string>("");

  const saveStatus = useSaveStatus();
  const lastExpectedKeyRef = useRef<string>("");

  // 1) Carica prodotti + prezzi + delivery di oggi (UNA VOLTA)
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
        const products = (prodData ?? []) as ProductRow[];

        const idByName: Record<string, string> = {};
        const byId: Record<string, string> = {};
        const defaultPriceByName: Record<string, number> = {};

        for (const p of products) {
          idByName[p.name] = p.id;
          byId[p.id] = p.name;
          defaultPriceByName[p.name] = p.default_price_cents ?? 0;
        }

        const { data: psData, error: psErr } = await supabase
          .from("price_settings")
          .select("product_id,price_cents");

        if (psErr) throw psErr;
        const ps = (psData ?? []) as PriceSettingRow[];

        const priceByName: Record<string, number> = { ...defaultPriceByName };
        for (const row of ps) {
          const nm = byId[row.product_id];
          if (nm) priceByName[nm] = row.price_cents;
        }

        const { data: delivs, error: delErr } = await supabase
          .from("deliveries")
          .select("id,note")
          .eq("delivery_date", today)
          .limit(1);

        if (delErr) throw delErr;

        const deliveryId = delivs?.[0]?.id as string | undefined;
        const savedNote = (delivs?.[0]?.note as string | null) ?? "";

        const recFromDb: Record<string, number> = {};
        if (deliveryId) {
          const { data: itData, error: itErr } = await supabase
            .from("delivery_items")
            .select("product_id,received_qty")
            .eq("delivery_id", deliveryId);

          if (itErr) throw itErr;

          (itData ?? []).forEach((it: any) => {
            const nm = byId[it.product_id];
            if (!nm) return;
            recFromDb[nm] = Number(it.received_qty ?? 0);
          });
        }

        if (!alive) return;

        setProductIdByName(idByName);
        setNameById(byId);
        setPriceCentsByName(priceByName);
        setNote(savedNote);

        // received iniziale: DB (se c'è) o 0
        setReceived(() => {
          const next: Record<string, number> = {};
          for (const nm of ALL_NAMES) next[nm] = Number(recFromDb[nm] ?? 0);
          return next;
        });

        // expected iniziale a 0 (verrà riempito dal polling)
        setExpected(() => {
          const next: Record<string, number> = {};
          for (const nm of ALL_NAMES) next[nm] = 0;
          return next;
        });
      } catch (e) {
        console.error(e);
        toast.error("Errore caricamento Oggi");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [today]);

  // 2) POLLING: aggiorna expected + received automaticamente quando cambiano le attese
  useEffect(() => {
    if (loading) return;

    let alive = true;

    const tick = async () => {
      try {
        const ids = Object.values(productIdByName).filter(Boolean);
        if (ids.length === 0) return;

        const { data, error } = await supabase
          .from("weekly_expected")
          .select("product_id,expected_qty")
          .eq("weekday", wd)
          .in("product_id", ids);

        if (error) throw error;

        const rows = (data ?? []) as WeeklyRow[];

        const nextExpected: Record<string, number> = {};
        for (const nm of ALL_NAMES) nextExpected[nm] = 0;

        for (const r of rows) {
          const nm = nameById[r.product_id];
          if (!nm) continue;
          nextExpected[nm] = Number(r.expected_qty ?? 0);
        }

        const key = stableKey(nextExpected);
        if (key === lastExpectedKeyRef.current) return;

        lastExpectedKeyRef.current = key;
        if (!alive) return;

        setExpected(nextExpected);

        // aggiorna stepper automaticamente (si riallinea alle attese)
        saveStatus.markDirty();
        setReceived(() => {
          const next: Record<string, number> = {};
          for (const nm of ALL_NAMES) next[nm] = Number(nextExpected[nm] ?? 0);
          return next;
        });
      } catch (e) {
        console.error(e);
      }
    };

    void tick();

    const t = window.setInterval(() => void tick(), 1500);

    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, wd, productIdByName, nameById]);

  const setAllOk = () => {
    saveStatus.markDirty();
    setReceived(() => {
      const next: Record<string, number> = {};
      for (const nm of ALL_NAMES) next[nm] = Number(expected[nm] ?? 0);
      return next;
    });
  };

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
      toast.success("Salvato ✓");
    } catch (e) {
      console.error(e);
      saveStatus.markError();
      toast.error("Errore salvataggio");
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
    <Page
      title="Oggi"
      right={<SaveStatusBadge status={saveStatus.status} />}
    >
      <div className="muted" style={{ fontWeight: 900, marginTop: -6, marginBottom: 10 }}>
        {subtitle}
      </div>

      <div className="stickyActions" style={{ marginTop: 0 }}>
        <button className="btn" type="button" onClick={setAllOk}>
          Tutto OK
        </button>

        <button className="btn btnPrimary" type="button" onClick={save} disabled={saving}>
          {saving ? "Salvataggio..." : "Salva"}
        </button>
      </div>

      <div style={{ height: 10 }} />

      <Card>
        {CATEGORIES.map((cat, idx) => (
          <div key={cat.title} style={{ marginTop: idx === 0 ? 0 : 12 }}>
            <SectionTitle>{cat.title}</SectionTitle>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {cat.products.map((nm) => (
                <div
                  key={nm}
                  className="row"
                  style={{
                    padding: "10px 0",
                    borderBottom: "1px solid rgba(0,0,0,0.06)",
                  }}
                >
                  <div className="rowLeft">
                    <div style={{ fontWeight: 1000, fontSize: 14 }}>
                      {shortName(nm, cat.title)}
                    </div>
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
            </div>
          </div>
        ))}

        <div style={{ height: 10 }} />

        <SectionTitle>Note</SectionTitle>
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
      </Card>
    </Page>
  );
}
