import React from "react";
import Topbar from "../components/Topbar";
import { supabase } from "../lib/supabase";
import type {
  WeeklyExpectedRow,
  DeliveryRow,
  DeliveryItemRow,
  PriceSettingRow
} from "../lib/supabase";

import {
  daysInMonth,
  weekdayIso,
  formatIsoDate,
  formatDayRow
} from "../lib/date";

import {
  computeTotalCents,
  computeTotalPieces,
  formatEuro
} from "../lib/compute";

import { downloadCsv, exportPdfViaPrint } from "../lib/export";

type MonthKey = {
  year: number;
  monthIndex0: number;
};

type LoadState = "loading" | "ready" | "error";

function monthLabel(m: MonthKey): string {
  const dt = new Date(m.year, m.monthIndex0, 1);
  return dt.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric"
  });
}

function clampMonth(m: MonthKey): MonthKey {
  let { year, monthIndex0 } = m;
  while (monthIndex0 < 0) {
    monthIndex0 += 12;
    year -= 1;
  }
  while (monthIndex0 > 11) {
    monthIndex0 -= 12;
    year += 1;
  }
  return { year, monthIndex0 };
}

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export default function Summary(): JSX.Element {
  const now = React.useMemo(() => new Date(), []);
  const [month, setMonth] = React.useState<MonthKey>({
    year: now.getFullYear(),
    monthIndex0: now.getMonth()
  });

  const [loadState, setLoadState] = React.useState<LoadState>("loading");

  const [weeklyByWeekday, setWeeklyByWeekday] =
    React.useState<Record<number, Record<string, number>>>({});

  const [deliveries, setDeliveries] =
    React.useState<Record<string, DeliveryRow>>({});

  const [itemsByDate, setItemsByDate] =
    React.useState<Record<string, Record<string, number>>>({});

  const [priceByProductId, setPriceByProductId] =
    React.useState<Record<string, number>>({});

  const days = daysInMonth(month.year, month.monthIndex0);

  const monthStartIso = formatIsoDate(
    new Date(month.year, month.monthIndex0, 1)
  );
  const monthEndIsoExclusive = formatIsoDate(
    new Date(month.year, month.monthIndex0, days + 1)
  );

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadState("loading");

        const { data: weekly } =
          await supabase.from("weekly_expected").select("*");

        const { data: prices } =
          await supabase.from("price_settings").select("*");

        const { data: dels } = await supabase
          .from("deliveries")
          .select("*")
          .gte("delivery_date", monthStartIso)
          .lt("delivery_date", monthEndIsoExclusive);

        const delMap: Record<string, DeliveryRow> = {};
        (dels ?? []).forEach((d) => {
          delMap[d.delivery_date] = d;
        });

        const delIds = (dels ?? []).map((d) => d.id);
        let items: DeliveryItemRow[] = [];

        if (delIds.length) {
          const { data } = await supabase
            .from("delivery_items")
            .select("*")
            .in("delivery_id", delIds);
          items = data ?? [];
        }

        if (cancelled) return;

        const wk: Record<number, Record<string, number>> = {};
        for (let i = 1; i <= 7; i++) wk[i] = {};
        (weekly ?? []).forEach((r: WeeklyExpectedRow) => {
          wk[r.weekday][r.product_id] = r.expected_qty;
        });

        const priceMap: Record<string, number> = {};
        (prices ?? []).forEach((p: PriceSettingRow) => {
          priceMap[p.product_id] = p.price_cents;
        });

        const idToDate: Record<string, string> = {};
        (dels ?? []).forEach((d) => {
          idToDate[d.id] = d.delivery_date;
        });

        const itMap: Record<string, Record<string, number>> = {};
        items.forEach((it) => {
          const date = idToDate[it.delivery_id];
          if (!date) return;
          if (!itMap[date]) itMap[date] = {};
          itMap[date][it.product_id] = it.received_qty;
        });

        setWeeklyByWeekday(wk);
        setDeliveries(delMap);
        setItemsByDate(itMap);
        setPriceByProductId(priceMap);

        setLoadState("ready");
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoadState("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [monthStartIso, monthEndIsoExclusive]);

  function computeDay(iso: string): {
    pieces: number;
    cents: number;
    status: "Preset" | "Salvato" | "Chiuso";
  } {
    const del = deliveries[iso];
    if (del) {
      if (del.is_closed) {
        return { pieces: 0, cents: 0, status: "Chiuso" };
      }
      const recv = itemsByDate[iso] ?? {};
      return {
        pieces: computeTotalPieces(recv),
        cents: computeTotalCents(recv, priceByProductId),
        status: "Salvato"
      };
    }

    const dt = new Date(iso + "T00:00:00");
    const w = weekdayIso(dt);
    const exp = weeklyByWeekday[w] ?? {};

    return {
      pieces: computeTotalPieces(exp),
      cents: computeTotalCents(exp, priceByProductId),
      status: "Preset"
    };
  }

  const rows = React.useMemo(() => {
    const out: Array<{
      iso: string;
      label: string;
      status: string;
      pieces: number;
      cents: number;
    }> = [];

    for (let d = 1; d <= days; d++) {
      const dt = new Date(month.year, month.monthIndex0, d);
      const iso = formatIsoDate(dt);
      const label = formatDayRow(dt);
      const t = computeDay(iso);
      out.push({
        iso,
        label,
        status: t.status,
        pieces: t.pieces,
        cents: t.cents
      });
    }
    return out;
  }, [
    days,
    month.year,
    month.monthIndex0,
    deliveries,
    itemsByDate,
    weeklyByWeekday,
    priceByProductId
  ]);

  const kpis = React.useMemo(() => {
    let openDays = 0;
    let closedDays = 0;
    let totalPieces = 0;
    let totalCents = 0;

    for (const r of rows) {
      if (r.status === "Chiuso") closedDays += 1;
      else openDays += 1;
      totalPieces += r.pieces;
      totalCents += r.cents;
    }

    const avgPieces =
      openDays > 0 ? Math.round((totalPieces / openDays) * 10) / 10 : 0;

    return {
      openDays,
      closedDays,
      totalPieces,
      totalCents,
      avgPieces
    };
  }, [rows]);

  function exportCsv() {
    const header = ["Data", "Stato", "Pezzi", "Euro"].join(",");

    const lines = rows.map((r) => {
      const euro = (r.cents / 100).toFixed(2).replace(".", ",");
      return [
        escapeCsv(r.iso),
        escapeCsv(r.status),
        String(r.pieces),
        escapeCsv(euro)
      ].join(",");
    });

    const csv = [header, ...lines].join("\n");
    const filename = `brioche-${month.year}-${String(
      month.monthIndex0 + 1
    ).padStart(2, "0")}.csv`;

    downloadCsv(filename, csv);
  }

  function exportPdf() {
    exportPdfViaPrint({ title: `Brioche ${monthLabel(month)}` });
  }

  if (loadState !== "ready") {
    return (
      <>
        <Topbar title="Riepilogo" subtitle="Caricamento…" />
        <div className="container">Caricamento…</div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Riepilogo"
        subtitle={monthLabel(month)}
        right={
          <div className="row">
            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={() =>
                setMonth((m) =>
                  clampMonth({
                    year: m.year,
                    monthIndex0: m.monthIndex0 - 1
                  })
                )
              }
            >
              ◀
            </button>

            <button
              type="button"
              className="btn btnGhost btnSmall"
              onClick={() =>
                setMonth((m) =>
                  clampMonth({
                    year: m.year,
                    monthIndex0: m.monthIndex0 + 1
                  })
                )
              }
            >
              ▶
            </button>

            <button
              type="button"
              className="btn btnSmall btnExportCsv"
              onClick={exportCsv}
            >
              Esporta CSV
            </button>

            <button
              type="button"
              className="btn btnSmall btnExportPdf"
              onClick={exportPdf}
            >
              Esporta PDF
            </button>
          </div>
        }
      />

      <div className="container stack">
        <div className="card">
          <div className="cardInner stack">
            <div className="rowBetween">
              <div className="pill pillOk">
                Giorni aperti: {kpis.openDays}
              </div>
              <div className="pill pillWarn">
                Giorni chiusi: {kpis.closedDays}
              </div>
            </div>

            <div className="rowBetween">
              <div className="pill">
                Pezzi totali: {kpis.totalPieces}
              </div>
              <div className="pill">
                {formatEuro(kpis.totalCents)}
              </div>
            </div>

            <div className="subtle">
              Media pezzi/giorno (solo giorni aperti): {kpis.avgPieces}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardInner list">
            {rows.map((r) => (
              <div key={r.iso} className="listRow">
                <div>
                  <div style={{ fontWeight: 900 }}>{r.label}</div>
                  <div className="subtle">{r.status}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="kpi">{r.pieces}</div>
                  <div className="subtle">{formatEuro(r.cents)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="subtle">
          PDF: usa “Stampa” → “Salva come PDF”. Layout ottimizzato.
        </div>
      </div>
    </>
  );
}
