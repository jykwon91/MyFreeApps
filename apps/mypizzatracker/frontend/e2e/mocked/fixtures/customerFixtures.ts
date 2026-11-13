/** Customers as GET /customers answers them (CustomerListItem, app/schemas/customer/customer_schemas.py). */
import type { CustomerListItem, CustomerRead } from "@/types/customer/customer";
import { FIXTURE_NOW } from "../constants/fixtureTimes";
import { daysBefore } from "./daysBefore";
import { customerIdAt } from "./fixtureIds";

/**
 * In GET /customers order (customer_repo.list_customers): most recent order
 * first, customers who never ordered last, by name within each. Anyone with
 * orders has a last_order_at (the newest order's created_at).
 */
export function listOrder(customers: CustomerListItem[]): CustomerListItem[] {
  return [...customers].sort((a, b) => {
    if (a.last_order_at === b.last_order_at) return a.name.localeCompare(b.name);
    if (a.last_order_at === null) return 1;
    if (b.last_order_at === null) return -1;
    return b.last_order_at.localeCompare(a.last_order_at);
  });
}

/** Ana ordered yesterday, Cleo two weeks ago, and Ben never has. */
export function sampleCustomers(): CustomerListItem[] {
  return listOrder([
    { id: customerIdAt(1), name: "Ana Lopez", phone: "5125550101", notes: "Prefers extra crispy", order_count: 4, last_order_at: daysBefore(FIXTURE_NOW, 1) },
    { id: customerIdAt(2), name: "Ben Ortiz", phone: "5125550102", notes: null, order_count: 0, last_order_at: null },
    { id: customerIdAt(3), name: "Cleo Park", phone: "5125550103", notes: null, order_count: 2, last_order_at: daysBefore(FIXTURE_NOW, 14) },
  ]);
}

/** What PATCH /customers/{id}/notes answers: the customer with the new notes. */
export function customerReadOf(item: CustomerListItem): CustomerRead {
  return { id: item.id, name: item.name, phone: item.phone, notes: item.notes, created_at: FIXTURE_NOW, updated_at: FIXTURE_NOW };
}
