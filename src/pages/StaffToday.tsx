import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "../lib/dayjsIt";
import { supabase } from "../lib/supabase";
import { weekdayIso, formatDayRow } from "../lib/date";
import { useSaveStatus } from "../lib/useSaveStatus";
import SaveStatusBadge from "../components/SaveStatusBadge";
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

function stableKey(obj: Record<string, number>) {
  const keys = Object.keys(obj).sort();
  return keys.map((k) => `${k}:${obj[k] ?? 0}`).join("|");
}

function clampQty(n: number) {
  return Math.max(0, Math.trunc(n || 0));
}

function Stepper({
  value,
  expected,
  onChange,
  onReset,
}: {
  value: number;
  expected: number;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const valueRef = useRef<number>(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const timerRef = useRef<number | null>(null);
  const delayRef = useRef<number | null>(null);

  const stop = () => {
    if (delayRef.current) window.clearTimeout(delayRef.current);
    if (timerRef.current) window.clearInterval(timerRef.current);
    delayRef.current = null;
    timerRef.current = null;
  };

  useEffect(() => stop, []);

  const applyDelta = (delta: number) => {
    const next = clampQty(valueRef.current + delta);
    valueRef.current = next;
    onChange(next);
  };

  const startRepeat = (delta: number) => {
    applyDelta(delta);
    delayRef.current = window.setTimeout(() => {
      timerRef.current = window.setInterval(() => applyDelta(delta), 120);
    }, 350);
  };

  const lastTapRef = useRef<number>(0);
  const onQtyTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      onReset();
      lastTapRef.current = 0;
      return;
    }
    lastTapRef.current = now;
  };

  return (
    <div className="stepper" onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop}>
      <button
        className="stepBtn"
        type="button"
        // ✅ NIENTE onClick: così non può fare +2 su mobile
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startRepeat(-1);
        }}
      >
        −
      </button>

      <div
        className="qty"
        role="button"
        tabIndex={0}
        onClick={onQtyTap}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onQtyTap();
        }}
        title={`Doppio tap per reset a ${expected}`}
        style={{ userSelect: "none" }}
      >
        {value}
      </div>

      <button
        className="stepBtn"
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          startRepeat(+1);
        }}
      >
        +
      </button>
    </div>
  );
}

export default function StaffToday() {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const wd = useMemo(() => weekdayIso(today), [today]);
  const title = useMemo(() => formatDayRow(today), [today]);

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

        const { data: psData, error: psErr } = await supabase.from("price_settings").select("product_id,price_cents");
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

        setReceived(() => {
          const next: Record<string, number> = {};
          for (const nm of ALL_NAMES) next[nm] = Number(recFromDb[nm] ?? 0);
          return next;
        });

        setExpected(() => {
          const next: Record<string, number> = {};
          for (const nm of ALL_NAMES) next[nm] = 0;
          return next;
        });
      } catch (e) {
        console.error(e);
        alert("Errore caricamento Oggi (guarda console)");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [today]);

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
    <Page
      title="Oggi"
      right={
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <div className="muted" style={{ fontWeight: 900 }}>
            {title}
          </div>
          <SaveStatusBadge status={saveStatus.status} />
        </div>
      }
    >
      <div className="stickyActions" style={{ marginBottom: 10 }}>
        <button
          className="btn"
          type="button"
          onClick={() => {
            saveStatus.markDirty();
            setReceived(() => {
              const next: Record<string, number> = {};
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

      <Card>
        {CATEGORIES.map((cat, catIdx) => (
          <div key={cat.title} style={{ marginTop: catIdx === 0 ? 0 : 14 }}>
            <SectionTitle>{cat.title}</SectionTitle>

            <div style={{ border: "1px solid rgba(0,0,0,0.06)", borderRadius: 14, padding: 10 }}>
              {cat.products.map((nm, idx) => {
                const last = idx === cat.products.length - 1;
                const exp = Number(expected[nm] ?? 0);
                const rec = Number(received[nm] ?? 0);
                const isModified = rec !== exp;

                return (
                  <div
                    key={nm}
                    className={`row ${isModified ? "row--modified" : ""}`}
                    style={{
                      padding: "10px 2px",
                      borderBottom: last ? "none" : "1px solid rgba(0,0,0,0.06)",
                      alignItems: "center",
                    }}
                  >
                    <div className="rowLeft">
                      <div style={{ fontWeight: 1000, fontSize: 14 }}>{nm}</div>
                      <div className="muted" style={{ fontWeight: 900 }}>
                        Atteso: {exp}
                      </div>
                    </div>

                    <Stepper
                      value={rec}
                      expected={exp}
                      onChange={(v) => {
                        saveStatus.markDirty();
                        setReceived((prev) => ({ ...prev, [nm]: clampQty(v) }));
                      }}
                      onReset={() => {
                        saveStatus.markDirty();
                        setReceived((prev) => ({ ...prev, [nm]: exp }));
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ height: 12 }} />
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
