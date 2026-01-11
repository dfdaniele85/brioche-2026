import { useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "../lib/dayjsIt";
import { daysInMonth, formatDayRow, weekdayIso } from "../lib/date";
import { supabase } from "../lib/supabase";
import { toast } from "../lib/toast";
import SkeletonStyles, { SkeletonCard, SkeletonBox } from "../components/Skeleton";
import { Page, Card, SectionTitle } from "../components/ui";

type ProductKey =
  | "Vuote"
  | "Farcite"
  | "Krapfen"
  | "Trancio focaccia"
  | "Focaccine"
  | "Pizzette";

const PRODUCTS: ProductKey[] = ["Vuote", "Farcite", "Krapfen", "Trancio focaccia", "Focaccine", "Pizzette"];

/**
 * ✅ TEMPLATE SETTIMANALE (come da tabella)
 * weekdayIso(): 1=Lunedì ... 7=Domenica
 */
const WEEKLY_TEMPLATE: Record<number, Record<ProductKey, number>> = {
  1: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Lunedì
  2: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Martedì
  3: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Mercoledì
  4: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Giovedì
  5: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Venerdì
  6: { Vuote: 10, Farcite: 82, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 }, // Sabato
  7: { Vuote: 10, Farcite: 65, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 5, Focaccine: 5 }, // Domenica
};

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
        onPointerDown={(e) => {
          e.preventDefault();
          startRepeat(-1);
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          stop();
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
          startRepeat(+1);
        }}
        onPointerUp={(e) => {
          e.preventDefault();
          stop();
        }}
      >
        +
      </button>
    </div>
  );
}

type ProductRow = { id: string; name: string; default_price_cents: number | null };
type PriceSettingRow = { product_id: string; price_cents: number };

function badgeForDay(isCompiled: boolean, isModified: boolean) {
  if (!isCompiled) return "⏳ Non compilato";
  if (isModified) return "⚠️ Modificato";
  return "✅ OK";
}

export default function MonthView() {
  const params = useParams();
  const monthStr = params.month ?? "1";
  const monthIndex = Number(monthStr) - 1;

  const days = useMemo(() => daysInMonth(monthIndex), [monthIndex]);
  const monthName = dayjs(new Date(2026, monthIndex, 1)).format("MMMM YYYY");

  const [openDay, setOpenDay] = useState<string | null>(null);
  const [received, setReceived] = useState<Record<string, Record<ProductKey, number>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<string | null>(null);

  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});
  const [priceCentsByName, setPriceCentsByName] = useState<Record<string, number>>({});

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

        const products = (prodData ?? []) as ProductRow[];

        const idByName: Record<string, string> = {};
        const defaultPriceByName: Record<string, number> = {};
        for (const p of products) {
          idByName[p.name] = p.id;
          defaultPriceByName[p.name] = p.default_price_cents ?? 0;
        }

        const { data: psData, error: psErr } = await supabase.from("price_settings").select("product_id,price_cents");
        if (psErr) throw psErr;

        const ps = (psData ?? []) as PriceSettingRow[];
        const priceByName: Record<string, number> = { ...defaultPriceByName };
        for (const row of ps) {
          const name = products.find((p) => p.id === row.product_id)?.name;
          if (name) priceByName[name] = row.price_cents;
        }

        const start = dayjs(new Date(2026, monthIndex, 1)).format("YYYY-MM-DD");
        const end = dayjs(new Date(2026, monthIndex + 1, 1)).format("YYYY-MM-DD");

        const { data: delivs, error: delErr } = await supabase
          .from("deliveries")
          .select("id,delivery_date,note")
          .gte("delivery_date", start)
          .lt("delivery_date", end);

        if (delErr) throw delErr;

        const deliveryIds = (delivs ?? []).map((d: any) => d.id);

        let items: any[] = [];
        if (deliveryIds.length > 0) {
          const { data: itData, error: itErr } = await supabase
            .from("delivery_items")
            .select("delivery_id,product_id,received_qty")
            .in("delivery_id", deliveryIds);

          if (itErr) throw itErr;
          items = itData ?? [];
        }

        const dateByDeliveryId: Record<string, string> = {};
        const notesByDate: Record<string, string> = {};
        (delivs ?? []).forEach((d: any) => {
          dateByDeliveryId[d.id] = d.delivery_date;
          if (d.note) notesByDate[d.delivery_date] = d.note;
        });

        const receivedByDate: Record<string, Record<ProductKey, number>> = {};
        for (const it of items) {
          const date = dateByDeliveryId[it.delivery_id];
          if (!date) continue;

          const name = products.find((p) => p.id === it.product_id)?.name as ProductKey | undefined;
          if (!name) continue;

          if (!receivedByDate[date]) receivedByDate[date] = {} as Record<ProductKey, number>;
          receivedByDate[date][name] = Number(it.received_qty ?? 0);
        }

        if (!alive) return;

        setProductIdByName(idByName);
        setPriceCentsByName(priceByName);
        setReceived(receivedByDate);
        setNotes(notesByDate);
      } catch (e) {
        console.error(e);
        toast.error("Errore caricamento dati");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [monthIndex]);

  const saveDay = async (date: string) => {
    try {
      setSavingDay(date);

      const wd = weekdayIso(date);
      const expected = WEEKLY_TEMPLATE[wd];
      const values = (received[date] ?? expected) as Record<ProductKey, number>;

      const { data: delivery, error: delErr } = await supabase
        .from("deliveries")
        .upsert({ delivery_date: date, note: notes[date] ?? null }, { onConflict: "delivery_date" })
        .select("id")
        .single();

      if (delErr) throw delErr;
      const deliveryId = delivery.id as string;

      for (const p of PRODUCTS) {
        const productId = productIdByName[p];
        if (!productId) continue;

        const unitPrice = priceCentsByName[p] ?? 0;

        const { error: itErr } = await supabase.from("delivery_items").upsert(
          {
            delivery_id: deliveryId,
            product_id: productId,
            expected_qty: expected[p] ?? 0,
            received_qty: values[p] ?? 0,
            unit_price_cents: unitPrice,
            note: null,
          },
          { onConflict: "delivery_id,product_id" }
        );

        if (itErr) throw itErr;
      }

      toast.success("Salvato ✓");
    } catch (e) {
      console.error(e);
      toast.error("Errore salvataggio");
    } finally {
      setSavingDay(null);
    }
  };

  if (loading) {
    return (
      <div className="fiuriContainer">
        <SkeletonStyles />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <SkeletonBox h={26} w={220} r={12} />
          <SkeletonBox h={22} w={120} r={999} />
        </div>
        <div style={{ height: 12 }} />
        <SkeletonCard lines={2} rows={4} />
        <div style={{ height: 10 }} />
        <SkeletonCard lines={2} rows={4} />
      </div>
    );
  }

  return (
    <Page title={monthName}>
      {days.map((date) => {
        const isOpen = openDay === date;
        const wd = weekdayIso(date);
        const expected = WEEKLY_TEMPLATE[wd];
        const dayReceived = (received[date] ?? expected) as Record<ProductKey, number>;

        const isCompiled = received[date] !== undefined;
        const isModified = isCompiled && PRODUCTS.some((p) => (dayReceived[p] ?? 0) !== (expected[p] ?? 0));
        const badge = badgeForDay(isCompiled, isModified);

        return (
          <div key={date} className="accordionItem" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className="accordionHeader"
              onClick={() => setOpenDay(isOpen ? null : date)}
              aria-expanded={isOpen}
              style={{ width: "100%", textAlign: "left" }}
            >
              <strong style={{ fontSize: 14 }}>{formatDayRow(date)}</strong>
              <span className="badge">{badge}</span>
            </button>

            {isOpen ? (
              <div className="accordionBody">
                <Card>
                  <SectionTitle>Quantità</SectionTitle>

                  <div style={{ border: "1px solid rgba(0,0,0,0.06)", borderRadius: 14, padding: 10 }}>
                    {PRODUCTS.map((p, idx) => {
                      const last = idx === PRODUCTS.length - 1;
                      const exp = Number(expected[p] ?? 0);
                      const rec = Number(dayReceived[p] ?? 0);
                      const isRowModified = rec !== exp;

                      return (
                        <div
                          key={p}
                          style={{
                            borderBottom: last ? "none" : "1px solid rgba(0,0,0,0.06)",
                            padding: "10px 0",
                          }}
                        >
                          <div className={`row ${isRowModified ? "row--modified" : ""}`}>
                            <div className="rowLeft">
                              <div style={{ fontWeight: 1000, fontSize: 14 }}>{p}</div>
                              <div className="muted" style={{ fontWeight: 900 }}>
                                Atteso: {exp}
                              </div>
                            </div>

                            <Stepper
                              value={rec}
                              expected={exp}
                              onChange={(v) => {
                                setReceived((prev) => ({
                                  ...prev,
                                  [date]: {
                                    ...(prev[date] ?? ({ ...expected } as Record<ProductKey, number>)),
                                    [p]: clampQty(v),
                                  } as Record<ProductKey, number>,
                                }));
                              }}
                              onReset={() => {
                                setReceived((prev) => ({
                                  ...prev,
                                  [date]: {
                                    ...(prev[date] ?? ({ ...expected } as Record<ProductKey, number>)),
                                    [p]: exp,
                                  } as Record<ProductKey, number>,
                                }));
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ height: 12 }} />

                  <SectionTitle>Note</SectionTitle>
                  <textarea
                    className="input"
                    placeholder="Note"
                    value={notes[date] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [date]: e.target.value }))}
                    style={{ minHeight: 80 }}
                  />

                  <div className="stickyActions" style={{ marginTop: 12 }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() =>
                        setReceived((prev) => ({
                          ...prev,
                          [date]: { ...expected } as Record<ProductKey, number>,
                        }))
                      }
                    >
                      Tutto OK
                    </button>

                    <button className="btn btnPrimary" type="button" disabled={savingDay === date} onClick={() => saveDay(date)}>
                      {savingDay === date ? "Salvataggio..." : "Salva"}
                    </button>
                  </div>
                </Card>
              </div>
            ) : null}
          </div>
        );
      })}
    </Page>
  );
}
