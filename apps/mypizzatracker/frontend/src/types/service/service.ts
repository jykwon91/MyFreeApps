/**
 * Service dashboard types -- mirrors backend schemas at
 * apps/mypizzatracker/backend/app/schemas/service/service_schemas.py
 *
 * Order status enum is shared with backend ORDER_STATUSES; any addition
 * here must update the backend tuple in the same PR per
 * feedback_enum_changes_cross_stack.md.
 */

export type OrderStatus =
  | "not_started"
  | "cooking"
  | "ready_text_sent"
  | "ready_waiting"
  | "picked_up"
  | "no_show";

export const ORDER_STATUSES: OrderStatus[] = [
  "not_started",
  "cooking",
  "ready_text_sent",
  "ready_waiting",
  "picked_up",
  "no_show",
];

export const TERMINAL_STATUSES: OrderStatus[] = ["picked_up", "no_show"];

export interface DashboardCustomer {
  id: string;
  name: string;
  phone: string;
}

export interface DashboardOrderPizzaTopping {
  topping_type_id: string;
  name: string;
  price_delta_snapshot: string; // Decimal serialized
}

export interface DashboardOrderPizza {
  id: string;
  pizza_type_id: string;
  name: string;
  modifications_text: string | null;
  is_free: boolean;
  price_snapshot: string; // Decimal serialized
  toppings: DashboardOrderPizzaTopping[];
}

export interface DashboardOrder {
  id: string;
  slot_id: string;
  status: OrderStatus;
  payment_method_tag: string;
  payment_status: string;
  ready_text_sent_at: string | null;
  created_at: string;
  updated_at: string;
  customer: DashboardCustomer;
  pizzas: DashboardOrderPizza[];
  total: string; // Decimal serialized
  pizza_count: number;
}

export interface DashboardSlot {
  id: string;
  pickup_time: string; // "HH:MM:SS"
  max_pizzas: number;
  pizza_count: number;
  remaining_capacity: number;
  orders: DashboardOrder[];
}

export interface DashboardDrop {
  id: string;
  name: string;
  date: string; // "YYYY-MM-DD"
  status: "planning" | "active" | "closed";
  slot_window_start: string;
  slot_window_end: string;
  in_progress_count: number;
}

export interface ServiceDashboardPayload {
  drop: DashboardDrop;
  slots: DashboardSlot[];
  server_time: string;
}

/**
 * Response shape for ``POST /service/orders/{id}/advance``.
 *
 * ``sms_dispatched`` is non-null only when the transition targeted
 * ``ready_text_sent``:
 *   - ``true``  — SMS sent successfully (or console-logged in dev).
 *   - ``false`` — Twilio rejected; ``sms_error`` carries the reason.
 *   - ``null``  — transition didn't involve SMS.
 */
export interface AdvanceOrderResponse {
  order: {
    id: string;
    status: OrderStatus;
    slot_id: string;
    ready_text_sent_at: string | null;
  };
  sms_dispatched: boolean | null;
  sms_error: string | null;
}
