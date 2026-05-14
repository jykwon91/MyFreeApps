/**
 * localStorage-backed list of recent order placements so a customer can
 * revisit /order/status (no id) and see the orders they've placed from
 * this browser. The actual order data lives server-side -- this list is
 * only the IDs + a snippet for display.
 *
 * Capped at 20 entries to bound storage growth. Oldest entries fall off.
 * Each entry is keyed by orderId so re-saving an existing order is a
 * no-op rather than a duplicate. Failures (storage disabled, parse
 * errors) are swallowed -- the list is a convenience, not a system of
 * record.
 */
const STORAGE_KEY = "mpt:saved-orders";
const MAX_ENTRIES = 20;

export interface SavedOrder {
  order_id: string;
  customer_name: string;
  drop_name: string;
  drop_date: string;
  slot_pickup_time: string;
  saved_at: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function listSavedOrders(): SavedOrder[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidSavedOrder);
  } catch {
    return [];
  }
}

export function saveOrder(entry: SavedOrder): void {
  if (!isBrowser()) return;
  try {
    const current = listSavedOrders().filter((o) => o.order_id !== entry.order_id);
    const next = [entry, ...current].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Swallow: storage may be full or disabled.
  }
}

export function removeSavedOrder(orderId: string): void {
  if (!isBrowser()) return;
  try {
    const next = listSavedOrders().filter((o) => o.order_id !== orderId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Swallow.
  }
}

function isValidSavedOrder(v: unknown): v is SavedOrder {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.order_id === "string" &&
    typeof o.customer_name === "string" &&
    typeof o.drop_name === "string" &&
    typeof o.drop_date === "string" &&
    typeof o.slot_pickup_time === "string" &&
    typeof o.saved_at === "string"
  );
}
