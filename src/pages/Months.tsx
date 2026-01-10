import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { daysInMonth, weekdayIso } from "../lib/date";
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

function makeExpectedZero(): Record<number, Record<string, number>> {
  const next: Record<number, Record<string, number>> = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {} };
  for (let w = 1; w <= 7; w++) for (const nm of ALL_NAMES) next[w][nm] = 0;
  return next;
}

export default function Months() {
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const [loading, setLoading] = useState(true);

  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});

  const [expectedByWeekday, setExpectedByWeekday] = useState<Record<number, Record<string, number>>>(makeExpectedZero);
  const [deliveriesByDate, setDeliveriesByDate] = useState<Record<string, string>>({});
  const [receivedByDate, setReceivedByDate] = useState<Record<string, Record<string, number>>>({});

  const lastExpectedKeyRef = useRef<string>("");

  // LOAD INIT (products + deliveries + items)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // products
        const { data: prodData, error: prodErr } = await supabase
          .from("products")
          .select("id,name")
          .in("name", ALL_NAMES);

        if (prodErr) throw prodErr;

        const byId: Record<string, string> = {};
        const idByName: Record<string, string> = {};
        (prodData ?? []).forEach((p: any) => {
          byId[p.id] = p.name;
          idByName[p.name] = p.id;
        });

        // deliveries 2026
        const { data: delData, error: delErr } = await supabase
          .from("deliveries")
          .select("id,delivery_date")
          .gte("delivery_date", "2026-01-01")
          .lt("delivery_date", "2027-01-01");

        if (delErr) throw delErr;

        const delivs = delData ?? [];
        const dateToDeliveryId: Record<string, string> = {};
        const deliveryIds: string[] = [];

        delivs.forEach((d: any) => {
          dateToDeliveryId[d.delivery_date] = d.id;
          deliveryIds.push(d.id);
        });

        let items: any[] = [];
        if (deliveryIds.length > 0) {
          const { data: itData, error: itErr } = await supabase
            .from("delivery_items")
            .select("delivery_id,product_id,received_qty")
            .in("delivery_id", deliveryIds);

          if (itErr) throw itErr;
          items = itData ?? [];
        }

        const deliveryIdToDate: Record<string, string> = {};
        delivs.forEach((d: any) => {
          deliveryIdToDate[d.id] = d.delivery_date;
        });

        const recByDate: Record<string, Record<string, number>> = {};
        items.forEach((it: any) => {
          const date = deliveryIdToDate[it.delivery_id];
          if (!date) return;

          const nm = byId[it.product_id];
          if (!nm) return;

          if (!recByDate[date]) recByDate[date] = {};
          recByDate[date][nm] = Number(it.received_qty ?? 0);
        });

        if (!alive) return;
        setNameById(byId);
        setProductIdByName(idByName);
        setDeliveriesByDate(dateToDeliveryId);
        setReceivedByDate(recByDate);
        setExpectedByWeekday(makeExpectedZero());
      } catch (e) {
        console.error(e);
        alert("Errore caricamento mesi (guarda console)");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // POLLING weekly_expected (2s)
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

        const next = makeExpectedZero();

        (data ?? []).forEach((r: any) => {
          const nm = nameById[r.product_id];
          if (!nm) return;
          const w = Number(r.weekday);
          if (!next[w]) return;
          next[w][nm] = Number(r.expected_qty ?? 0);
        });

        // evita rerender inutili
        const key = JSON.stringify(next);
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

  // POLLING deliveries/items (10s) così i badge cambiano anche dopo nuovi salvataggi
  useEffect(() => {
    if (loading) return;

    let alive = true;

    const refresh = async () => {
      try {
        if (Object.keys(nameById).length === 0) return;

        const { data: delData, error: delErr } = await supabase
          .from("deliveries")
          .select("id,delivery_date")
          .gte("delivery_date", "2026-01-01")
          .lt("delivery_date", "2027-01-01");

        if (delErr) throw delErr;

        const delivs = delData ?? [];
        const dateToDeliveryId: Record<string, string> = {};
        const deliveryIds: string[] = [];

        delivs.forEach((d: any) => {
          dateToDeliveryId[d.delivery_date] = d.id;
          deliveryIds.push(d.id);
        });

        let items: any[] = [];
        if (deliveryIds.length > 0) {
          const { data: itData, error: itErr } = await supabase
            .from("delivery_items")
            .select("delivery_id,product_id,received_qty")
            .in("delivery_id", deliveryIds);

          if (itErr) throw itErr;
          items = itData ?? [];
        }

        const deliveryIdToDate: Record<string, string> = {};
        delivs.forEach((d: any) => {
          deliveryIdToDate[d.id] = d.delivery_date;
        });

        const recByDate: Record<string, Record<string, number>> = {};
        items.forEach((it: any) => {
          const date = deliveryIdToDate[it.delivery_id];
          if (!date) return;

          const nm = nameById[it.product_id];
          if (!nm) return;

          if (!recByDate[date]) recByDate[date] = {};
          recByDate[date][nm] = Number(it.received_qty ?? 0);
        });

        if (!alive) return;
        setDeliveriesByDate(dateToDeliveryId);
        setReceivedByDate(recByDate);
      } catch (e) {
        console.error(e);
      }
    };

    void refresh();
    const t = window.setInterval(() => void refresh(), 10000);

    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      alive = false;
      window.clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [loading, nameById]);

  const expectedForDate = (date: string) => {
    const w = weekdayIso(date);
    return expectedByWeekday[w] ?? {};
  };

  const statusForMonth = (month: number) => {
    const monthIndex = month - 1;
    const ds = daysInMonth(monthIndex);

    let anyMissing = false;
    let anyCompiled = false;
    let anyModified = false;

    for (const date of ds) {
      const deliveryId = deliveriesByDate[date];
      if (!deliveryId) {
        anyMissing = true;
        continue;
      }

      anyCompiled = true;

      const expected = expectedForDate(date);
      const rec = receivedByDate[date] ?? {};

      const diff = ALL_NAMES.some((nm) => Number(rec[nm] ?? 0) !== Number(expected[nm] ?? 0));
      if (diff) anyModified = true;
    }

    // priorità: se c'è almeno un giorno compilato diverso dagli attesi -> ⚠️
    if (anyCompiled && anyModified) return "⚠️ Modificato";
    if (anyMissing) return "⏳ Non compilato";
    return "✅ OK";
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
      <h1 className="fiuriTitle">Mesi</h1>
      <div style={{ height: 12 }} />

      <div className="fiuriCard">
        {months.map((m) => {
          const label = dayjs(new Date(2026, m - 1, 1)).format("MMMM");
          const badge = statusForMonth(m);

          return (
            <Link key={m} to={`/mesi/${m}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div className="row" style={{ padding: "12px 0" }}>
                <div className="rowLeft">
                  <div style={{ fontWeight: 900, fontSize: 24, textTransform: "capitalize" }}>
                    {label} 2026
                  </div>
                </div>
                <span className="badge">{badge}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
