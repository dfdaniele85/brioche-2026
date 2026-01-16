import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail fast: evita bug strani in produzione
  throw new Error(
    "Missing Supabase env vars. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (and in Vercel env vars)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ fondamentale: sessione persistente tra refresh e dispositivi
    persistSession: true,
    autoRefreshToken: true,

    // Se NON usi magic link / OAuth redirect, meglio false (più stabile).
    // Se invece usi magic link/OAuth, mettilo true.
    detectSessionInUrl: false
  }
});

/* ====== TIPI ====== */

export type ProductRow = {
  id: string;
  name: string;
  category: string;
  is_farcite_total: boolean;
  default_price_cents: number;
  created_at: string;
};

export type PriceSettingRow = {
  product_id: string;
  price_cents: number;
};

export type WeeklyExpectedRow = {
  weekday: number; // ISO 1..7
  product_id: string;
  expected_qty: number;
};

export type DeliveryRow = {
  id: string;
  delivery_date: string; // YYYY-MM-DD
  is_closed: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type DeliveryItemRow = {
  delivery_id: string;
  product_id: string;
  received_qty: number;
};
