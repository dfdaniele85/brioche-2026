import dayjs from "dayjs";

export const YEAR = 2026;

export function daysInMonth(monthIndex0: number): string[] {
  const start = dayjs(new Date(YEAR, monthIndex0, 1));
  const count = start.daysInMonth();
  return Array.from({ length: count }, (_, i) => start.add(i, "day").format("YYYY-MM-DD"));
}

export function weekdayIso(dateStr: string): number {
  const d = dayjs(dateStr).day(); // 0..6 (dom..sab)
  return d === 0 ? 7 : d; // ISO 1..7 (lun..dom)
}

export function formatDayRow(dateStr: string) {
  const d = dayjs(dateStr);
  const dow = d.format("ddd");
  return `${dow} ${d.format("DD/MM/YYYY")}`;
}
