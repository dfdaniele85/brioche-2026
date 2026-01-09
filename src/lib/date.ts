import dayjs from "dayjs";

export function daysInMonth(monthIndex0: number): string[] {
  const start = dayjs(new Date(2026, monthIndex0, 1));
  const count = start.daysInMonth();
  const out: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    out.push(dayjs(new Date(2026, monthIndex0, i)).format("YYYY-MM-DD"));
  }
  return out;
}

// 1=Lun ... 7=Dom (senza plugin isoWeekday)
export function weekdayIso(dateISO: string): number {
  // day(): 0=Dom ... 6=Sab
  const d = dayjs(dateISO).day();
  return d === 0 ? 7 : d;
}

export function formatDayRow(dateISO: string): string {
  const d = dayjs(dateISO);
  const names = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  const dayName = names[d.day()];
  return `${dayName} ${d.format("DD/MM/YYYY")}`;
}
