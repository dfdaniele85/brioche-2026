export function centsToEuro(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function euroToCents(euroStr: string) {
  const normalized = euroStr.replace(",", ".").trim();
  const n = Number(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
