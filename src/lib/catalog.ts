import type { ProductRow } from "./supabase";

export type Product = ProductRow;

/**
 * Categoria Farcite (come in DB)
 * Nota: lascio anche l'export con typo storico per compatibilità.
 */
export const FARCIte_CATEGORY = "Farcite";
export const FARCITE_CATEGORY = FARCIte_CATEGORY;

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
export function computeFarciteTotal(products: Product[], qtyByProductId: Record<string, number>): number {
  return products.filter(isFarciteFlavor).reduce((sum, p) => sum + (qtyByProductId[p.id] ?? 0), 0);
}

/**
 * UI helper:
 * - su mobile, per le Farcite togliamo prefissi tipo "Farcite - "
 * - su desktop lasciamo il nome completo
 *
 * Non tocchiamo il DB: è solo display.
 */
export function displayProductName(p: Product, opts?: { compactFarcitePrefix?: boolean }): string {
  const compact = opts?.compactFarcitePrefix ?? false;

  if (!compact) return p.name;

  // solo per gusti farcite (non per totale)
  if (!isFarciteFlavor(p)) return p.name;

  // casi comuni:
  // "Farcite - Albicocca" -> "Albicocca"
  // "Farcite – Albicocca" -> "Albicocca" (trattino lungo)
  // "Farcite: Albicocca"  -> "Albicocca"
  const raw = (p.name ?? "").trim();

  const prefixes = ["Farcite -", "Farcite –", "Farcite:", "Farcite —"];
  for (const pref of prefixes) {
    if (raw.toLowerCase().startsWith(pref.toLowerCase())) {
      return raw.slice(pref.length).trim();
    }
  }

  // fallback: se il nome contiene " - " proviamo a prendere la parte dopo
  const dashIdx = raw.indexOf(" - ");
  if (dashIdx > -1) {
    return raw.slice(dashIdx + 3).trim();
  }

  return raw;
}