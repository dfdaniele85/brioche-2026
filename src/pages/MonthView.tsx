import { useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "../lib/dayjsIt";
import { daysInMonth, formatDayRow, weekdayIso } from "../lib/date";
import { supabase } from "../lib/supabase";

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

type ProductRow = { id: string; name: string; default_price_cents: number | null };
type PriceSettingRow = { product_id: string; price_cents: number };
type WeeklyRow = { weekday: number; product_id: string; expected_qty: number | null };

function stableKey(obj: Record<string, number>) {
  const keys = Object.keys(obj).sort();
  return keys.map((k) => `${k}:${obj[k] ?? 0}`).join("|");
}

export default function MonthView() {
  const params = useParams();
  const monthStr = params.month ?? "1";
  const monthIndex = Number(monthStr) - 1;

  const days = useMemo(() => daysInMonth(monthIndex), [monthIndex]);
  const monthName = dayjs(new Date(2026, monthIndex, 1)).format("MMMM YYYY");

  const [openDay, setOpenDay] = useState<string | null>(null);
  const [received, setReceived] = useState<Record<string, Record<string, number>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<string | null>(null);

  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [priceCentsByName, setPriceCentsByName] = useState<Record<string, number>>({});

  const [expectedByWeekday, setExpectedByWeekday] = useState<Record<number, Record<string, number>>>({
    1: {},
    2: {},
    3: {},
    4: {},
    5: {},
    6: {},
    7: {},
  });

  const lastExpectedKeyRef = useRef<string>("");

  // load base data (prodotti/prezzi + deliveries mese)
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

        const receivedByDate: Record<string, Record<string, number>> = {};
        for (const it of items) {
          const date = dateByDeliveryId[it.delivery_id];
          if (!date) continue;

          const nm = byId[it.product_id];
          if (!nm) continue;

          if (!receivedByDate[date]) receivedByDate[date] = {};
          receivedByDate[date][nm] = Number(it.received_qty ?? 0);
        }

        if (!alive) return;
        setProductIdByName(idByName);
        setNameById(byId);
        setPriceCentsByName(priceByName);
        setReceived(receivedByDate);
        setNotes(notesByDate);

        // init expected to 0
        setExpectedByWeekday(() => {
          const next: Record<number, Record<string, number>> = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {} };
          for (let w = 1; w <= 7; w++) {
            for (const nm of ALL_NAMES) next[w][nm] = 0;
          }
          return next;
        });
      } catch (e) {
        console.error(e);
        alert("Errore caricamento dati (guarda console)");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [monthIndex]);

  // polling expected settimanali (tutti i weekday insieme)
  useEffect(() => {
    if (loading) return;

    let alive = true;

    const tick = async () => {
      try {
        const ids = Object.values(productIdByName).filter(Boolean);
        if (ids.length === 0) return;

        const { data, error } = await supabase
          .from("weekly_expected")
          .select("weekday,product_id,expected_qty")
          .in("product_id", ids);

        if (error) throw error;

        const rows = (data ?? []) as WeeklyRow[];

        const next: Record<number, Record<string, number>> = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {} };
        for (let w = 1; w <= 7; w++) {
          for (const nm of ALL_NAMES) next[w][nm] = 0;
        }

        for (const r of rows) {
          const nm = nameById[r.product_id];
          if (!nm) continue;
          const w = Number(r.weekday);
          next[w][nm] = Number(r.expected_qty ?? 0);
        }

        const flat: Record<string, number> = {};
        for (let w = 1; w <= 7; w++) {
          for (const nm of ALL_NAMES) flat[`w${w}_${nm}`] = next[w][nm] ?? 0;
        }

        const key = stableKey(flat);
        if (key === lastExpectedKeyRef.current) return;
        lastExpectedKeyRef.current = key;

        if (!alive) return;
        setExpectedByWeekday(next);
      } catch (e) {
        console.error(e);
      }
    };

    void tick();
    const t = window.setInterval(() => void tick(), 2000);

    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loading, productIdByName, nameById]);

  const expectedForDate = (date: string) => {
    const wd = weekdayIso(date);
    return expectedByWeekday[wd] ?? {};
  };

  const saveDay = async (date: string) => {
    try {
      setSavingDay(date);

      const expected = expectedForDate(date);
      const values = received[date] ?? expected;

      const { data: delivery, error: delErr } = await supabase
        .from("deliveries")
        .upsert({ delivery_date: date, note: notes[date] ?? null }, { onConflict: "delivery_date" })
        .select("id")
        .single();

      if (delErr) throw delErr;
      const deliveryId = delivery.id as string;

      for (const nm of ALL_NAMES) {
        const productId = productIdByName[nm];
        if (!productId) continue;

        const unitPrice = priceCentsByName[nm] ?? 0;

        const { error: itErr } = await supabase.from("delivery_items").upsert(
          {
            delivery_id: deliveryId,
            product_id: productId,
            expected_qty: Number(expected[nm] ?? 0),
            received_qty: Number(values[nm] ?? 0),
            unit_price_cents: unitPrice,
            note: null,
          },
          { onConflict: "delivery_id,product_id" }
        );

        if (itErr) throw itErr;
      }

      alert("Salvato ✅");
    } catch (e) {
      console.error(e);
      alert("Errore salvataggio ❌ (guarda console)");
    } finally {
      setSavingDay(null);
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
      <h1 className="fiuriTitle" style={{ textTransform: "capitalize" }}>
        {monthName}
      </h1>
      <div style={{ height: 12 }} />

      {days.map((date) => {
        const isOpen = openDay === date;
        const expected = expectedForDate(date);
        const dayReceived = received[date] ?? expected;

        const isCompiled = received[date] !== undefined;
        const isModified =
          isCompiled && ALL_NAMES.some((p) => Number(dayReceived[p] ?? 0) !== Number(expected[p] ?? 0));

        const badge = !isCompiled ? "⏳ Non compilato" : isModified ? "⚠️ Modificato" : "✅ OK";

        return (
          <div key={date} className="accordionItem" style={{ marginBottom: 10 }}>
            <div className="accordionHeader" onClick={() => setOpenDay(isOpen ? null : date)}>
              <strong>{formatDayRow(date)}</strong>
              <span className="badge">{badge}</span>
            </div>

            {isOpen ? (
              <div className="accordionBody">
                <div className="fiuriCard" style={{ borderRadius: 16 }}>
                  {CATEGORIES.map((cat) => (
                    <div key={cat.title} style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 900, fontSize: 18 }}>{cat.title}</div>

                      {cat.products.map((p) => (
                        <div key={p} className="row" style={{ padding: "10px 0" }}>
                          <div className="rowLeft">
                            <div style={{ fontWeight: 900, fontSize: 20 }}>{p}</div>
                            <div className="muted" style={{ fontWeight: 900 }}>
                              Atteso: {Number(expected[p] ?? 0)}
                            </div>
                          </div>

                          <Stepper
                            value={Number(dayReceived[p] ?? 0)}
                            onChange={(v) => {
                              setReceived((prev) => ({
                                ...prev,
                                [date]: {
                                  ...(prev[date] ?? expected),
                                  [p]: v,
                                },
                              }));
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
                      value={notes[date] ?? ""}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [date]: e.target.value }))}
                      style={{ minHeight: 70 }}
                    />
                  </div>

                  <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() =>
                        setReceived((prev) => ({
                          ...prev,
                          [date]: { ...expected },
                        }))
                      }
                    >
                      Tutto OK
                    </button>

                    <button
                      className="btn btnPrimary"
                      type="button"
                      disabled={savingDay === date}
                      onClick={() => saveDay(date)}
                    >
                      {savingDay === date ? "Salvataggio..." : "Salva"}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
