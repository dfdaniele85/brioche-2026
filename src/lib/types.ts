export type Role = "admin" | "staff";

export type Product = {
  id: string;
  name: string;
  default_price_cents: number;
  sort_order: number;
  active: boolean;
};

export type PriceSetting = {
  product_id: string;
  price_cents: number;
};

export type TemplateItem = {
  id: string;
  weekday: number; // 1..7
  product_id: string;
  expected_qty: number;
};

export type Delivery = {
  id: string;
  delivery_date: string; // YYYY-MM-DD
  note: string | null;
};

export type DeliveryItem = {
  id: string;
  delivery_id: string;
  product_id: string;
  expected_qty: number;
  received_qty: number;
  unit_price_cents: number;
  note: string | null;
};

export type DayStatus = "NON_COMPILATO" | "OK" | "MODIFICATO" | "NOTE";
