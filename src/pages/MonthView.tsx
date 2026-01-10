import { useParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import { daysInMonth, formatDayRow, weekdayIso } from "../lib/date";
import { supabase } from "../lib/supabase";
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

// per compatibilità con dati storici (se esiste in products)
const LEGACY_FARCITE = "Farcite";

const CATEGORIES: Category[] = [
  { title: "Farcite", products: [...FARCITE_GUSTI] },
  { title: "Vuote", products: ["Vuote"] },
  { title: "Krapfen", products: ["Krapfen"] },
  { title: "Focaccine", products: ["Focaccine"] },
  { title: "Pizzette", products: ["Pizzette"] },
  { title: "Trancio focaccia", products: ["Trancio focaccia"] },
];

// lista completa da visualizzare/salvare (aggiungiamo eventuale “Farcite” legacy)
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
  const [priceCentsByName, setPriceCentsByName] = useState<Record<string, number>>({});
  const [expectedByWeekday, setExpectedByWeekday] = useState<Record<number, Record<string, number>>>({});

  const saveStatus = useSaveStatus();

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // 0) capiamo se esiste “Farcite” legacy
        const { data: legacyCheck, error: legacyErr } = await supabase
          .from("products")
          .select("id,name")
          .eq("name", LEGACY_FARCITE)
          .limit(1);

        if (legacyErr) throw legacyErr;
        const hasLegacy = (legacyCheck ?? []).length > 0;

        const ALL_NAMES = buildAllNames(hasLegacy);

        // 1) carica prodotti (id + default_price)
        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name,default_price_cents")
          .in("name", ALL_NAMES);

        if (prodErr) throw prodErr;
        const products = (prodData ?? []) as ProductRow[];

        const idByName: Record<string, string> = {};
        const defaultPriceByName: Record<string, number> = {};
        for (const p of products) {
          idByName[p.name] = p.id;
          defaultPriceByName[p.name] = p.default_price_cents ?? 0;
        }

        // 2) price_settings (override) - prendiamo tutti e poi applichiamo solo quelli che matchano
        const { data: psData, error: psErr } = await supabase
          .from("price_settings")
          .select("product_id,price_cents");

        if (psErr) throw psErr;
        const ps = (psData ?? []) as PriceSettingRow[];

        const priceByName: Record<string, number> = { ...defaultPriceByName };
        for (const row of ps) {
          const name = products.find((p) => p.id === row.product_id)?.name;
          if (name) priceByName[name] = row.price_cents;
        }

        // 3) weekly_expected (attese)
        // inizializza tutto a 0, poi applica valori db
        const expectedNext: Record<number, Record<string, number>> = {};
        for (let w = 1; w <= 7; w++) {
          expectedNext[w] = {};
          for (const nm of ALL_NAMES) expectedNext[w][nm] = 0;
        }

        const { data: weData, error: weErr } = await supabase
          .from("weekly_expected")
          .select("weekday,product_id,expected_qty");

        if (weErr) throw weErr;

        const weekly = (weData ?? []) as WeeklyExpectedRow[];
        const nameById: Record<string, string> = {};
        for (const p of products) nameById[p.id] = p.name;

        for (const r of weekly) {
          const nm = nameById[r.product_id];
          if (!nm) continue;
          if (!expectedNext[r.weekday]) expectedNext[r.weekday] = {};
          expectedNext[r.weekday][nm] = Number(r.expected_qty ?? 0);
        }

        // 4) carica deliveries del mese + items (received)
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

          const name = nameById[it.product_id];
          if (!name) continue;

          if (!receivedByDate[date]) receivedByDate[date] = {};
          receivedByDate[date][name] = Number(it.received_qty ?? 0);
        }

        if (!alive) return;

        setProductIdByName(idByName);
        setPriceCentsByName(priceByName);
        setExpectedByWeekday(expectedNext);
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

  const saveDay = async (date: string, allNames: string[]) => {
    try {
      setSavingDay(date);
      saveStatus.markSaving();

      const wd = weekdayIso(date);
      const expected = expectedByWeekday[wd] ?? {};
      const current = received[date] ?? {};

      const { data: delivery, error: delErr } = await supabase
        .from("deliveries")
        .upsert({ delivery_date: date, note: notes[date] ?? null }, { onConflict: "delivery_date" })
        .select("id")
        .single();

      if (delErr) throw delErr;
      const deliveryId = delivery.id as string;

      for (const name of allNames) {
        const productId = productIdByName[name];
        if (!productId) continue;

        const unitPrice = priceCentsByName[name] ?? 0;

        const { error: itErr } = await supabase.from("delivery_items").upsert(
          {
            delivery_id: deliveryId,
            product_id: productId,
            expected_qty: Number(expected[name] ?? 0),
            received_qty: Number(current[name] ?? 0),
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

  // ricostruisco la lista completa “visibile”
  const hasLegacy = Boolean(productIdByName[LEGACY_FARCITE]);
  const ALL_NAMES = buildAllNames(hasLegacy);

  return (
    <div className="fiuriContainer">
      <div className="row" style={{ alignItems: "center", gap: 10 }}>
        <h1 className="fiuriTitle" style={{ textTransform: "capitalize" }}>
          {monthName}
        </h1>
        <SaveStatusBadge status={saveStatus.status} />
      </div>

      <div style={{ height: 12 }} />

      {days.map((date) => {
        const isOpen = openDay === date;
        const wd = weekdayIso(date);
        const expected = expectedByWeekday[wd] ?? {};

        const dayReceived = received[date] ?? {};
        const isCompiled = received[date] !== undefined;

        // modificato se almeno un valore ricevuto è diverso dall’atteso
        const isModified =
          isCompiled &&
          ALL_NAMES.some((nm) => Number(dayReceived[nm] ?? 0) !== Number(expected[nm] ?? 0));

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
                  {/* Legacy farcite (se esiste) */}
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
                          value={Number(dayReceived[LEGACY_FARCITE] ?? 0)}
                          onChange={(v) => {
                            saveStatus.markDirty();
                            setReceived((prev) => ({
                              ...prev,
                              [date]: {
                                ...(prev[date] ?? {}),
                                [LEGACY_FARCITE]: v,
                              },
                            }));
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
                            value={Number(dayReceived[nm] ?? 0)}
                            onChange={(v) => {
                              saveStatus.markDirty();
                              setReceived((prev) => ({
                                ...prev,
                                [date]: {
                                  ...(prev[date] ?? {}),
                                  [nm]: v,
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
                      onChange={(e) => {
                        saveStatus.markDirty();
                        setNotes((prev) => ({ ...prev, [date]: e.target.value }));
                      }}
                      style={{ minHeight: 70 }}
                    />
                  </div>

                  <div
                    className="row"
                    style={{ justifyContent: "flex-end", gap: 10, marginTop: 12 }}
                  >
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        saveStatus.markDirty();
                        setReceived((prev) => ({
                          ...prev,
                          [date]: {
                            ...(prev[date] ?? {}),
                            ...Object.fromEntries(
                              ALL_NAMES.map((nm) => [nm, Number(expected[nm] ?? 0)])
                            ),
                          },
                        }));
                      }}
                    >
                      Tutto OK
                    </button>

                    <button
                      className="btn btnPrimary"
                      type="button"
                      disabled={savingDay === date}
                      onClick={() => saveDay(date, ALL_NAMES)}
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
