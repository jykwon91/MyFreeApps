/** Customers as GET /customers answers them (CustomerListItem, app/schemas/customer/customer_schemas.py). */
import type { CustomerListItem, CustomerRead } from "@/types/customer/customer";
import { FIXTURE_NOW } from "../constants/fixtureTimes";
import { customerIdAt } from "./fixtureIds";

export function sampleCustomers(): CustomerListItem[] {
  return [
    { id: customerIdAt(1), name: "Ana Lopez", phone: "5125550101", notes: "Prefers extra crispy", order_count: 4, last_order_at: null },
    { id: customerIdAt(2), name: "Ben Ortiz", phone: "5125550102", notes: null, order_count: 1, last_order_at: null },
    { id: customerIdAt(3), name: "Cleo Park", phone: "5125550103", notes: null, order_count: 2, last_order_at: null },
  ];
}

/** What PATCH /customers/{id}/notes answers: the customer with the new notes. */
export function customerReadOf(item: CustomerListItem): CustomerRead {
  return { id: item.id, name: item.name, phone: item.phone, notes: item.notes, created_at: FIXTURE_NOW, updated_at: FIXTURE_NOW };
}
