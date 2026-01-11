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
  "Farcite - Pan gocciole",
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
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const timerRef = useRef<number | null>(null);
  const delayRef = useRef<number | null>(null);

  const stop = () => {
    if (delayRef.current) clearTimeout(delayRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
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

  return (
    <div className="stepper" onPointerUp={stop} onPointerLeave={stop}>
      <button
        className="stepBtn"
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          startRepeat(-1);
        }}
      >
        −
      </button>

      <div className="qty">{value}</div>

      <button
        className="stepBtn"
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
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
  const [note, setNote] = useState("");

  const saveStatus = useSaveStatus();

  /** 🔢 TOTALE FARCITE */
  const totalFarcite = useMemo(() => {
    return FARCITE_GUSTI.reduce((sum, nm) => sum + (received[nm] ?? 0), 0);
  }, [received]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data: prodData } = await supabase
          .from("products")
          .select("id,name,default_price_cents")
          .in("name", ALL_NAMES);

        const idByName: Record<string, string> = {};
        const byId: Record<string, string> = {};
        const defaultPrice: Record<string, number> = {};

        (prodData ?? []).forEach((p: ProductRow) => {
          idByName[p.name] = p.id;
          byId[p.id] = p.name;
          defaultPrice[p.name] = p.default_price_cents ?? 0;
        });

        setProductIdByName(idByName);
        setNameById(byId);
        setPriceCentsByName(defaultPrice);

        const zero: Record<string, number> = {};
        ALL_NAMES.forEach((n) => (zero[n] = 0));
        setExpected(zero);
        setReceived(zero);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [today]);

  if (loading) {
    return (
      <div className="fiuriContainer">
        <div className="fiuriCard">Caricamento…</div>
      </div>
    );
  }

  return (
    <Page
      title="Oggi"
      right={
        <>
          <div className="muted" style={{ fontWeight: 900 }}>{title}</div>
          <SaveStatusBadge status={saveStatus.status} />
        </>
      }
    >
      <Card>
        {CATEGORIES.map((cat) => (
          <div key={cat.title} style={{ marginBottom: 16 }}>
            <SectionTitle>
              {cat.title}
              {cat.title === "Farcite" && (
                <span style={{ marginLeft: 10 }} className="badge">
                  Totale: {totalFarcite}
                </span>
              )}
            </SectionTitle>

            {cat.products.map((nm) => {
              const exp = expected[nm] ?? 0;
              const rec = received[nm] ?? 0;

              return (
                <div key={nm} className="row" style={{ padding: "8px 0" }}>
                  <div className="rowLeft">
                    <strong>{nm}</strong>
                    <div className="muted">Atteso: {exp}</div>
                  </div>

                  <Stepper
                    value={rec}
                    expected={exp}
                    onChange={(v) => {
                      saveStatus.markDirty();
                      setReceived((p) => ({ ...p, [nm]: v }));
                    }}
                    onReset={() => {
                      saveStatus.markDirty();
                      setReceived((p) => ({ ...p, [nm]: exp }));
                    }}
                  />
                </div>
              );
            })}
          </div>
        ))}

        <SectionTitle>Note</SectionTitle>
        <textarea
          className="input"
          value={note}
          onChange={(e) => {
            saveStatus.markDirty();
            setNote(e.target.value);
          }}
        />
      </Card>
    </Page>
  );
}
