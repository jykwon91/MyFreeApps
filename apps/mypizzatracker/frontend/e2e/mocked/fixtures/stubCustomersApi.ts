/**
 * Stubs the customer DB (app/api/customers.py): GET /customers lists in
 * customer_repo's order and filters ?search= like it does (the trimmed text
 * anywhere in the name, case-insensitively, or the search's digits anywhere
 * in the stored digits-only phone), and PATCH /customers/{id}/notes saves the
 * notes the next read shows.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import type { CustomerListItem, CustomerNotesUpdate } from "@/types/customer/customer";
import type { CustomersApiStub } from "../types/CustomersApiStub";
import { apiPath, pathId } from "@platform/ui/test-support/apiPath";
import { customerReadOf, listOrder, sampleCustomers } from "./customerFixtures";
import { digitsOnly } from "./digitsOnly";
import { recordWrite } from "@platform/ui/test-support/recordWrite";

const CUSTOMERS = /^\/customers$/;
const NOTES = /^\/customers\/([^/]+)\/notes$/;
const NOT_FOUND = { detail: "Not Found" };

function matches(customer: CustomerListItem, search: string): boolean {
  const digits = digitsOnly(search);
  return (
    customer.name.toLowerCase().includes(search.trim().toLowerCase()) || (digits !== "" && customer.phone.includes(digits))
  );
}

export async function stubCustomersApi(page: Page, customers: CustomerListItem[] = sampleCustomers()): Promise<CustomersApiStub> {
  const stub: CustomersApiStub = { writes: [], searches: [] };
  let state = [...customers];

  await page.route(apiPath(CUSTOMERS), (route) => {
    const search = new URL(route.request().url()).searchParams.get("search") ?? "";
    stub.searches.push(search);
    const listed = listOrder(state);
    return route.fulfill(json(search.trim() ? listed.filter((c) => matches(c, search)) : listed));
  });

  await page.route(apiPath(NOTES), (route) => {
    const id = pathId(NOTES, route.request());
    const customer = state.find((c) => c.id === id);
    if (!customer) return route.fulfill(json(NOT_FOUND, 404));
    const { notes } = recordWrite(stub.writes, route.request()) as CustomerNotesUpdate;
    // Like customer_service.update_notes: trimmed, and blank becomes null.
    const updated = { ...customer, notes: (notes ?? "").trim() || null };
    state = state.map((c) => (c.id === id ? updated : c));
    return route.fulfill(json(customerReadOf(updated)));
  });

  return stub;
}
