import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { daysInMonth, formatDayRow, weekdayIso } from "../lib/date";
import { supabase } from "../lib/supabase";

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

// weekdayIso: 1=Lun ... 7=Dom
const WEEKLY_TEMPLATE: Record<number, Record<ProductKey, number>> = {
  1: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  2: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  3: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  4: { Vuote: 5, Farcite: 51, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  5: { Vuote: 5, Farcite: 45, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  6: { Vuote: 10, Farcite: 82, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 6, Focaccine: 6 },
  7: { Vuote: 10, Farcite: 65, Krapfen: 4, "Trancio focaccia": 4, Pizzette: 5, Focaccine: 5 },
};

function Stepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="stepper">
      <button
        className="stepBtn"
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        −
      </button>
      <div className="qty">{value}</div>
      <button className="stepBtn" type="button" onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}

type ProductRow = {
  id: string;
  name: string;
  default_price_cents: number | null;
};

type PriceSettingRow = {
  product_id: string;
  price_cents: number;
};

export default function MonthView() {
  const params = useParams();
  const monthStr = params.month ?? "1";
  const monthIndex = Number(monthStr) - 1;

  const days = useMemo(() => daysInMonth(monthIndex), [monthIndex]);
  const monthName = dayjs(new Date(2026, monthIndex, 1)).format("MMMM YYYY");

  const [openDay, setOpenDay] = useState<string | null>(null);

  // ricevuto per giorno/prodotto
  const [received, setReceived] = useState<Record<string, Record<ProductKey, number>>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<string | null>(null);

  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});
  const [priceCentsByName, setPriceCentsByName] = useState<Record<string, number>>({});

  // carica prodotti + prezzi + eventuali dati già salvati del mese
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // 1) products
        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name,default_price_cents")
          .in("name", PRODUCTS);

        if (prodErr) throw prodErr;

        const products = (prodData ?? []) as ProductRow[];
        const idByName: Record<string, string> = {};
        const defaultPriceByName: Record<string, number> = {};
        products.forEach((p) => {
          idByName[p.name] = p.id;
          defaultPriceByName[p.name] = p.default_price_cents ?? 0;
        });

        // 2) price_settings (override)
        const { data: psData, error: psErr } = await supabase
          .from("price_settings")
          .select("product_id,price_cents");

        if (psErr) throw psErr;

        const ps = (psData ?? []) as PriceSettingRow[];
        const priceByName: Record<string, number> = { ...defaultPriceByName };
        ps.forEach((row) => {
          const name = products.find((p) => p.id === row.product_id)?.name;
          if (name) priceByName[name] = row.price_cents;
        });

        // 3) deliveries + delivery_items del mese
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
            .select("delivery_id,product_id,expected_qty,received_qty")
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
        items.forEach((it: any) => {
          const date = dateByDeliveryId[it.delivery_id];
          if (!date) return;

          const name = products.find((p) => p.id === it.product_id)?.name as ProductKey | undefined;
          if (!name) return;

          if (!receivedByDate[date]) receivedByDate[date] = {} as Record<ProductKey, number>;
          receivedByDate[date][name] = it.received_qty ?? 0;
        });

        if (!alive) return;
        setProductIdByName(idByName);
        setPriceCentsByName(priceByName);
        setReceived(receivedByDate);
        setNotes(notesByDate);
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

  const saveDay = async (date: string) => {
    try {
      setSavingDay(date);

      const wd = weekdayIso(date);
      const expected = WEEKLY_TEMPLATE[wd];

      // se non ho ricevuto per quel giorno, uso expected
      const values = (received[date] ?? expected) as Record<ProductKey, number>;

      // 1) upsert delivery (id)
      const { data: delivery, error: delErr } = await supabase
        .from("deliveries")
        .upsert(
          { delivery_date: date, note: notes[date] ?? null },
          { onConflict: "delivery_date" }
        )
        .select("id")
        .single();

      if (delErr) throw delErr;
      const deliveryId = delivery.id as string;

      // 2) upsert delivery_items (con product_id uuid!)
      for (const p of PRODUCTS) {
        const productId = productIdByName[p];
        if (!productId) {
          console.warn("Manca productId per", p);
          continue;
        }

        const unitPrice = priceCentsByName[p] ?? 0;

        const { error: itErr } = await supabase
          .from("delivery_items")
          .upsert(
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
      <div className="container">
        <div className="card">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <h2 style={{ textTransform: "capitalize" }}>{monthName}</h2>
      <div style={{ height: 12 }} />

      {days.map((date) => {
        const isOpen = openDay === date;
        const wd = weekdayIso(date);
        const expected = WEEKLY_TEMPLATE[wd];

        const dayReceived = (received[date] ?? expected) as Record<ProductKey, number>;

        const isCompiled = received[date] !== undefined;
        const isModified =
          isCompiled &&
          PRODUCTS.some((p) => (dayReceived[p] ?? 0) !== (expected[p] ?? 0));

        const badge = !isCompiled
          ? "⏳ Non compilato"
          : isModified
          ? "⚠️ Modificato"
          : "✅ OK";

        return (
          <div key={date} className="accordionItem" style={{ marginBottom: 10 }}>
            <div
              className="accordionHeader"
              onClick={() => setOpenDay(isOpen ? null : date)}
            >
              <strong>{formatDayRow(date)}</strong>
              <span className="badge">{badge}</span>
            </div>

            {isOpen ? (
              <div className="accordionBody">
                <div className="card" style={{ borderRadius: 12 }}>
                  <div className="row space">
                    <strong>Quantità</strong>
                    <span className="muted">Atteso → Ricevuto</span>
                  </div>

                  <hr />

                  {PRODUCTS.map((p) => (
                    <div key={p} className="row space" style={{ padding: "8px 0" }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{p}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          Atteso: {expected[p]}
                        </div>
                      </div>

                      <Stepper
                        value={dayReceived[p] ?? 0}
                        onChange={(v) => {
                          setReceived((prev) => ({
                            ...prev,
                            [date]: {
                              ...(prev[date] ?? expected),
                              [p]: v,
                            } as Record<ProductKey, number>,
                          }));
                        }}
                      />
                    </div>
                  ))}

                  <hr />

                  <div style={{ marginTop: 10 }}>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                      Note
                    </div>
                    <textarea
                      className="input"
                      placeholder="Note"
                      value={notes[date] ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [date]: e.target.value }))
                      }
                      style={{ width: "100%", minHeight: 70 }}
                    />
                  </div>

                  <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setReceived((prev) => ({
                          ...prev,
                          [date]: { ...expected } as Record<ProductKey, number>,
                        }));
                      }}
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
