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

type ProductMini = { id: string; name: string };
type WeeklyRow = { weekday: number; product_id: string; expected_qty: number | null };
type DeliveryRow = { id: string; delivery_date: string };
type ItemRow = { delivery_id: string; product_id: string; received_qty: number | null };

function stableKey(obj: Record<string, number>) {
  const keys = Object.keys(obj).sort();
  return keys.map((k) => `${k}:${obj[k] ?? 0}`).join("|");
}

export default function Months() {
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ProductMini[]>([]);
  const [nameById, setNameById] = useState<Record<string, string>>({});
  const [productIdByName, setProductIdByName] = useState<Record<string, string>>({});

  const [expectedByWeekday, setExpectedByWeekday] = useState<Record<number, Record<string, number>>>({
    1: {},
    2: {},
    3: {},
    4: {},
    5: {},
    6: {},
    7: {},
  });

  const [deliveriesByDate, setDeliveriesByDate] = useState<Record<string, string>>({}); // date -> deliveryId
  const [receivedByDate, setReceivedByDate] = useState<Record<string, Record<string, number>>>({}); // date -> name -> qty

  const lastExpectedKeyRef = useRef<string>("");

  // 1) load products + deliveries/items (una volta)
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

        const prods = (prodData ?? []) as ProductMini[];

        const byId: Record<string, string> = {};
        const idByName: Record<string, string> = {};
        for (const p of prods) {
          byId[p.id] = p.name;
          idByName[p.name] = p.id;
        }

        // tutte le deliveries del 2026
        const { data: delData, error: delErr } = await supabase
          .from("deliveries")
          .select("id,delivery_date")
          .gte("delivery_date", "2026-01-01")
          .lt("delivery_date", "2027-01-01");

        if (delErr) throw delErr;

        const delivs = (delData ?? []) as DeliveryRow[];
        const dateToDeliveryId: Record<string, string> = {};
        const deliveryIds = delivs.map((d) => d.id);

        for (const d of delivs) dateToDeliveryId[d.delivery_date] = d.id;

        let items: ItemRow[] = [];
        if (deliveryIds.length > 0) {
          const { data: itData, error: itErr } = await supabase
            .from("delivery_items")
            .select("delivery_id,product_id,received_qty")
            .in("delivery_id", deliveryIds);

          if (itErr) throw itErr;
          items = (itData ?? []) as ItemRow[];
        }

        const recByDate: Record<string, Record<string, number>> = {};
        const deliveryIdToDate: Record<string, string> = {};
        for (const d of delivs) deliveryIdToDate[d.id] = d.delivery_date;

        for (const it of items) {
          const date = deliveryIdToDate[it.delivery_id];
          if (!date) continue;

          const nm = byId[it.product_id];
          if (!nm) continue;

          if (!recByDate[date]) recByDate[date] = {};
          recByDate[date][nm] = Number(it.received_qty ?? 0);
        }

        if (!alive) return;
        setProducts(prods);
        setNameById(byId);
        setProductIdByName(idByName);
        setDeliveriesByDate(dateToDeliveryId);
        setReceivedByDate(recByDate);

        // init expected 0
        setExpectedByWeekday(() => {
          const next: Record<number, Record<string, number>> = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {}, 7: {} };
          for (let w = 1; w <= 7; w++) {
            for (const nm of ALL_NAMES) next[w][nm] = 0;
          }
          return next;
        });
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

  // 2) polling weekly_expected (ogni 2s)
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

        // key per evitare re-render inutili
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

  const statusForMonth = (month: number) => {
    const monthIndex = month - 1;
    const days = daysInMonth(monthIndex);

    let anyMissing = false;
    let anyModified = false;

    for (const date of days) {
      const deliveryId = deliveriesByDate[date];
      if (!deliveryId) {
        anyMissing = true;
        continue;
      }

      const expected = expectedForDate(date);
      const rec = receivedByDate[date] ?? {};

      // se compilato ma differisce da expected → modificato
      const diff = ALL_NAMES.some((nm) => Number(rec[nm] ?? 0) !== Number(expected[nm] ?? 0));
      if (diff) anyModified = true;
    }

    if (anyMissing) return { text: "⏳ Non compilato", cls: "" };
    if (anyModified) return { text: "⚠️ Modificato", cls: "" };
    return { text: "✅ OK", cls: "" };
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
          const st = statusForMonth(m);

          return (
            <Link
              key={m}
              to={`/mesi/${m}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="row" style={{ padding: "12px 0" }}>
                <div className="rowLeft">
                  <div style={{ fontWeight: 900, fontSize: 24, textTransform: "capitalize" }}>
                    {label} 2026
                  </div>
                </div>
                <span className="badge">{st.text}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
