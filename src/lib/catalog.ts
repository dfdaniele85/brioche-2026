import type { ProductRow } from "./supabase";

export type Product = ProductRow;

export const FARCIte_CATEGORY = "Farcite";

/**
 * Ritorna true se è la riga "Farcite (TOTALE)"
 */
export function isFarciteTotal(p: Product): boolean {
  return p.is_farcite_total === true;
}

/**
 * Prodotti reali = tutti tranne Farcite (TOTALE)
 */
export function isRealProduct(p: Product): boolean {
  return !p.is_farcite_total;
}

/**
 * Tutti i gusti Farcite (esclude il totale)
 */
export function isFarciteFlavor(p: Product): boolean {
  return p.category === FARCIte_CATEGORY && !p.is_farcite_total;
}

/**
 * Calcola Farcite totale come somma dei gusti
 */
export function computeFarciteTotal(
  products: Product[],
  qtyByProductId: Record<string, number>
): number {
  return products
    .filter(isFarciteFlavor)
    .reduce((sum, p) => sum + (qtyByProductId[p.id] ?? 0), 0);
}
