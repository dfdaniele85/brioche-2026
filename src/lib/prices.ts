export function centsToEur(cents: number): number {
  return (Number(cents) || 0) / 100;
}

export function formatEurFromCents(cents: number): string {
  return centsToEur(cents).toFixed(2).replace(".", ",") + " €";
}

export function eurStringToCents(input: string): number {
  const s = (input ?? "").toString().trim().replace("€", "").replace(/\s/g, "");
  if (!s) return 0;
  const normalized = s.replace(",", ".");
  const n = Number(normalized);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}
