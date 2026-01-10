import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import dayjs from "../lib/dayjsIt";
import { daysInMonth, weekdayIso } from "../lib/date";
import { supabase } from "../lib/supabase";
import { Page, Card, SectionTitle } from "../components/ui";

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
  const next: Record<number, Record<string, number>> = {};
  for (let w = 1; w <= 7; w++) {
    next[w] = {};
    for (const nm of ALL_NAMES) next[w][nm] = 0;
  }
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

  /* LOAD INIT */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

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

        const { data: delData, error: delErr } = await supabase
          .from("deliveries")
          .select("id,delivery_date")
          .gte("delivery_date", "2026-01-01")
          .lt("delivery_date", "2027-01-01");

        if (delErr) throw delErr;

        const dateToDeliveryId: Record<string, string> = {};
        const deliveryIds: string[] = [];

        (delData ?? []).forEach((d: any) => {
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
        (delData ?? []).forEach((d: any) => {
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
      } catch (e) {
        console.error(e);
        alert("Errore caricamento mesi");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  /* POLLING expected */
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
          next[r.weekday][nm] = Number(r.expected_qty ?? 0);
        });

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
    const t = window.setInterval(tick, 2000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [loading, productIdByName, nameById]);

  const expectedForDate = (date: string) => expectedByWeekday[weekdayIso(date)] ?? {};

  const statusForMonth = (month: number) => {
    const ds = daysInMonth(month - 1);

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
      const exp = expectedForDate(date);
      const rec = receivedByDate[date] ?? {};
      if (ALL_NAMES.some((nm) => Number(rec[nm] ?? 0) !== Number(exp[nm] ?? 0))) {
        anyModified = true;
      }
    }

    if (anyCompiled && anyModified) return "⚠️ Modificato";
    if (anyMissing) return "⏳ Non compilato";
    return "✅ OK";
  };

  if (loading) {
    return (
      <div className="fiuriContainer">
        <div className="fiuriCard">Caricamento…</div>
      </div>
    );
  }

  return (
    <Page title="Mesi">
      <Card>
        <SectionTitle>Anno 2026</SectionTitle>

        {months.map((m) => {
          const label = dayjs(new Date(2026, m - 1, 1)).format("MMMM");
          const badge = statusForMonth(m);

          return (
            <Link key={m} to={`/mesi/${m}`}>
              <div
                className="row"
                style={{
                  padding: "12px 0",
                  borderBottom: m === 12 ? "none" : "1px solid rgba(0,0,0,0.06)",
                }}
              >
                <div className="rowLeft">
                  <div style={{ fontWeight: 1000, fontSize: 15, textTransform: "capitalize" }}>
                    {label} 2026
                  </div>
                </div>
                <span className="badge">{badge}</span>
              </div>
            </Link>
          );
        })}
      </Card>
    </Page>
  );
}
