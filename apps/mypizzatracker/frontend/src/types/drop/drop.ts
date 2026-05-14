/**
 * Drop + Slot types -- mirrors backend schemas at
 * apps/mypizzatracker/backend/app/schemas/drop/drop_schemas.py
 *
 * Status enum and DropUpdate field policy must move with the backend
 * (per feedback_enum_changes_cross_stack.md).
 */

export type DropStatus = "planning" | "active" | "closed";

export const DROP_STATUSES: DropStatus[] = ["planning", "active", "closed"];

export const DROP_STATUS_LABELS: Record<DropStatus, string> = {
  planning: "Planning",
  active: "Active",
  closed: "Closed",
};

export interface Slot {
  id: string;
  drop_id: string;
  pickup_time: string; // ISO time "HH:MM:SS"
  max_pizzas: number;
}

export interface Drop {
  id: string;
  date: string; // ISO date "YYYY-MM-DD"
  name: string;
  slot_window_start: string; // "HH:MM:SS"
  slot_window_end: string;
  status: DropStatus;
  tip_total: string; // Decimal serialized as string
  created_at: string;
  updated_at: string;
  slots: Slot[];
}

export interface DropCreateBody {
  date: string;
  name: string;
  slot_window_start: string;
  slot_window_end: string;
}

export interface DropUpdateBody {
  name?: string;
  date?: string;
  slot_window_start?: string;
  slot_window_end?: string;
  status?: DropStatus;
  tip_total?: string;
}

export interface SlotCreateBody {
  pickup_time: string;
  max_pizzas: number;
}

export interface SlotUpdateBody {
  pickup_time?: string;
  max_pizzas?: number;
}
