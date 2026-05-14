/**
 * Customer-facing (public) types -- mirrors backend schemas at
 * apps/mypizzatracker/backend/app/schemas/public/public_schemas.py
 *
 * Decimals serialize as strings over JSON; use `parseFloat`/`Number`
 * for display arithmetic. Times use "HH:MM:SS" ISO format.
 */

export interface PublicPizza {
  id: string;
  name: string;
  price: string;
  description: string | null;
}

export interface PublicTopping {
  id: string;
  name: string;
  price_delta: string;
}

export interface PublicMenu {
  pizzas: PublicPizza[];
  toppings: PublicTopping[];
}

export interface PublicSlot {
  id: string;
  pickup_time: string; // "HH:MM:SS"
  max_pizzas: number;
  remaining_pizzas: number;
}

export interface PublicDrop {
  id: string;
  name: string;
  date: string; // "YYYY-MM-DD"
  slot_window_start: string;
  slot_window_end: string;
  slots: PublicSlot[];
}

export interface PublicOrderPizzaCreateBody {
  pizza_type_id: string;
  topping_type_ids: string[];
  modifications_text?: string | null;
}

export interface PublicOrderCreateBody {
  drop_id: string;
  slot_id: string;
  customer_name: string;
  customer_phone: string;
  payment_method_tag: string;
  pizzas: PublicOrderPizzaCreateBody[];
}

export interface PublicOrderPizzaConfirmation {
  pizza_name: string;
  pizza_price: string;
  toppings: string[];
  toppings_price_delta_total: string;
  modifications_text: string | null;
  line_total: string;
}

export type PublicOrderStatus =
  | "not_started"
  | "cooking"
  | "ready_text_sent"
  | "ready_waiting"
  | "picked_up"
  | "no_show";

export const PUBLIC_ORDER_STATUS_LABELS: Record<PublicOrderStatus, string> = {
  not_started: "Not started",
  cooking: "Cooking",
  ready_text_sent: "Ready (text sent)",
  ready_waiting: "Ready -- waiting",
  picked_up: "Picked up",
  no_show: "No show",
};

export type PublicPaymentStatus = "unpaid" | "paid";

export const PUBLIC_PAYMENT_STATUS_LABELS: Record<PublicPaymentStatus, string> = {
  unpaid: "Not yet paid",
  paid: "Paid",
};

export interface PublicOrderConfirmation {
  order_id: string;
  drop_name: string;
  drop_date: string;
  slot_pickup_time: string;
  customer_name: string;
  customer_phone: string;
  payment_method_tag: string;
  payment_status: PublicPaymentStatus;
  status: PublicOrderStatus;
  pizzas: PublicOrderPizzaConfirmation[];
  total: string;
  created_at: string;
}

/**
 * Common payment method labels for the customer to choose from. Free-form
 * tag on the backend; this list is just the curated UI options.
 */
export const PAYMENT_METHOD_OPTIONS: { tag: string; label: string }[] = [
  { tag: "venmo", label: "Venmo" },
  { tag: "zelle", label: "Zelle" },
  { tag: "cashapp", label: "Cash App" },
  { tag: "applepay", label: "Apple Pay" },
  { tag: "cash", label: "Cash" },
];
