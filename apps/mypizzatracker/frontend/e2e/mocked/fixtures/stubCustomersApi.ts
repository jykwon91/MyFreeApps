/**
 * Stubs the customer DB (app/api/customers.py): GET /customers filters by
 * ?search= on name or phone digits, and PATCH /customers/{id}/notes saves the
 * notes the next read shows.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import type { CustomerListItem, CustomerNotesUpdate } from "@/types/customer/customer";
import type { CustomersApiStub } from "../types/CustomersApiStub";
import { apiPath, pathId } from "./apiPath";
import { customerReadOf, sampleCustomers } from "./customerFixtures";
import { recordWrite } from "./recordWrite";

const CUSTOMERS = /^\/customers$/;
const NOTES = /^\/customers\/([^/]+)\/notes$/;
const NOT_FOUND = { detail: "Not Found" };

function matches(customer: CustomerListItem, search: string): boolean {
  return customer.name.toLowerCase().includes(search.toLowerCase()) || customer.phone.includes(search);
}

export async function stubCustomersApi(page: Page, customers: CustomerListItem[] = sampleCustomers()): Promise<CustomersApiStub> {
  const stub: CustomersApiStub = { writes: [], searches: [] };
  let state = [...customers];

  await page.route(apiPath(CUSTOMERS), (route) => {
    const search = new URL(route.request().url()).searchParams.get("search") ?? "";
    stub.searches.push(search);
    return route.fulfill(json(search ? state.filter((c) => matches(c, search)) : state));
  });

  await page.route(apiPath(NOTES), (route) => {
    const id = pathId(NOTES, route.request());
    const customer = state.find((c) => c.id === id);
    if (!customer) return route.fulfill(json(NOT_FOUND, 404));
    const { notes } = recordWrite(stub.writes, route.request()) as CustomerNotesUpdate;
    const updated = { ...customer, notes };
    state = state.map((c) => (c.id === id ? updated : c));
    return route.fulfill(json(customerReadOf(updated)));
  });

  return stub;
}
