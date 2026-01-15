import type { Product } from "./catalog";
import { computeFarciteTotal, isRealProduct } from "./catalog";

export type QtyByProductId = Record<string, number>;

export type DayDraft = {
  isClosed: boolean;
  notes: string;
  qtyByProductId: QtyByProductId; // SOLO prodotti reali
};

/**
 * Utility: normalizza quantità (no negative, interi)
 */
export function normalizeQty(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const v = Math.trunc(n);
  return v < 0 ? 0 : v;
}

/**
 * Crea una mappa qty iniziale partendo da preset weekly_expected.
 * products: lista completa (incluso Farcite totale)
 * expectedByProductId: SOLO prodotti reali
 */
export function qtyFromWeeklyExpected(
  products: Product[],
  expectedByProductId: Record<string, number>
): QtyByProductId {
  const out: QtyByProductId = {};
  for (const p of products) {
    if (!isRealProduct(p)) continue;
    out[p.id] = normalizeQty(expectedByProductId[p.id] ?? 0);
  }
  return out;
}

/**
 * Crea una mappa qty iniziale partendo da delivery_items salvati.
 * products: lista completa
 * receivedByProductId: SOLO prodotti reali
 */
export function qtyFromDeliveryItems(
  products: Product[],
  receivedByProductId: Record<string, number>
): QtyByProductId {
  const out: QtyByProductId = {};
  for (const p of products) {
    if (!isRealProduct(p)) continue;
    out[p.id] = normalizeQty(receivedByProductId[p.id] ?? 0);
  }
  return out;
}

/**
 * Regola business:
 * - Se isClosed: tutte le qty reali devono essere 0
 */
export function applyClosedRule(draft: DayDraft): DayDraft {
  if (!draft.isClosed) return draft;
  const next: QtyByProductId = {};
  for (const [pid] of Object.entries(draft.qtyByProductId)) {
    next[pid] = 0;
  }
  return { ...draft, qtyByProductId: next };
}

/**
 * Totale pezzi:
 * - somma SOLO prodotti reali (quindi NON include Farcite (TOTALE))
 */
export function computeTotalPieces(qtyByProductId: QtyByProductId): number {
  return Object.values(qtyByProductId).reduce((sum, n) => sum + (n ?? 0), 0);
}

export type PriceByProductId = Record<string, number>; // cents

/**
 * Totale € (in centesimi):
 * - somma SOLO prodotti reali * prezzo unitario
 * - mai doppio conteggio Farcite totale
 */
export function computeTotalCents(
  qtyByProductId: QtyByProductId,
  priceByProductId: PriceByProductId
): number {
  let total = 0;
  for (const [pid, qtyRaw] of Object.entries(qtyByProductId)) {
    const qty = normalizeQty(qtyRaw);
    const price = normalizeQty(priceByProductId[pid] ?? 0);
    total += qty * price;
  }
  return total;
}

/**
 * Day initial state:
 * - se delivery esiste: usa delivery items salvati (o 0 se isClosed)
 * - se delivery NON esiste: usa weekly_expected del weekday
 * - notes: se non esiste delivery => ""
 */
export function dayInitialState(params: {
  products: Product[];
  hasDelivery: boolean;
  deliveryIsClosed: boolean;
  deliveryNotes: string | null;
  receivedByProductId: Record<string, number>; // solo reali
  expectedByProductId: Record<string, number>; // solo reali
}): DayDraft {
  const {
    products,
    hasDelivery,
    deliveryIsClosed,
    deliveryNotes,
    receivedByProductId,
    expectedByProductId
  } = params;

  const baseQty = hasDelivery
    ? qtyFromDeliveryItems(products, receivedByProductId)
    : qtyFromWeeklyExpected(products, expectedByProductId);

  const draft: DayDraft = {
    isClosed: hasDelivery ? deliveryIsClosed : false,
    notes: hasDelivery ? (deliveryNotes ?? "") : "",
    qtyByProductId: baseQty
  };

  return applyClosedRule(draft);
}

/**
 * Regola business "Apri":
 * - isClosed false
 * - ripristina qty = weekly_expected del weekday
 */
export function reopenToWeeklyExpected(params: {
  products: Product[];
  expectedByProductId: Record<string, number>;
}): DayDraft {
  const qty = qtyFromWeeklyExpected(params.products, params.expectedByProductId);
  return {
    isClosed: false,
    notes: "",
    qtyByProductId: qty
  };
}

/**
 * Farcite totale (KPI visivo):
 * calcolato live dalla mappa qty (reali) e dall’elenco prodotti
 */
export function farciteTotalKpi(products: Product[], qtyByProductId: QtyByProductId): number {
  return computeFarciteTotal(products, qtyByProductId);
}

/**
 * Formatta centesimi in euro (it): "€ 12,30"
 */
export function formatEuro(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.trunc(cents) : 0;
  const euros = safe / 100;
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(euros);
}
