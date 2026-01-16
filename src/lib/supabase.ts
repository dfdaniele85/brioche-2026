import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,        // ✅ fondamentale
    autoRefreshToken: true,
    detectSessionInUrl: true
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
  weekday: number;
  product_id: string;
  expected_qty: number;
};

export type DeliveryRow = {
  id: string;
  delivery_date: string;
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
