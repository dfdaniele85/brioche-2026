import dayjs from "dayjs";
import "dayjs/locale/it";

dayjs.locale("it");

/**
 * Numero di giorni in un mese
 * @param year es: 2026
 * @param monthIndex0 0 = Gennaio ... 11 = Dicembre
 */
export function daysInMonth(year: number, monthIndex0: number): number {
  return dayjs(new Date(year, monthIndex0, 1)).daysInMonth();
}

/**
 * ISO weekday: 1 = Lunedì ... 7 = Domenica
 */
export function weekdayIso(date: Date): number {
  const d = dayjs(date).day(); // 0..6 (0 domenica)
  return d === 0 ? 7 : d;
}

/**
 * Formato riga giorno per UI (es: "Lun 12")
 */
export function formatDayRow(date: Date): string {
  return dayjs(date).format("ddd D");
}

/**
 * YYYY-MM-DD (per DB)
 */
export function formatIsoDate(date: Date): string {
  return dayjs(date).format("YYYY-MM-DD");
}
