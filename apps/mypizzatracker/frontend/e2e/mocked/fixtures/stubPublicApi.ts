/**
 * Stubs the customer-facing API (app/api/public.py) the way it answers
 * without a token: the menu, the current drop (404 when none is taking
 * orders), placing an order (201 with its confirmation), reading an order back
 * by id (404 for one it never placed) and the phone lookup (404 for a phone it
 * doesn't know).
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import type { PublicOrderConfirmation, PublicOrderCreateBody } from "@/types/public/public";
import { NO_ACTIVE_DROP, NO_CUSTOMER } from "../constants/refusalDetails";
import type { PublicApiStub } from "../types/PublicApiStub";
import type { PublicApiStubOptions } from "../types/PublicApiStubOptions";
import { apiPath, pathId } from "./apiPath";
import { orderIdAt } from "./fixtureIds";
import { confirmationFromOrder, samplePublicDrop, samplePublicMenu } from "./publicFixtures";
import { recordWrite } from "./recordWrite";

const MENU = /^\/public\/menu$/;
const CURRENT_DROP = /^\/public\/drops\/current$/;
const ORDERS = /^\/public\/orders$/;
const ORDER = /^\/public\/orders\/([^/]+)$/;
const LOOKUP = /^\/public\/customers\/lookup$/;
const ORDER_NOT_FOUND = "Order not found. Double-check the order link from your confirmation.";
const FIRST_NEW = 100;

export async function stubPublicApi(
  page: Page,
  { noActiveDrop = false, orders = [], knownCustomers = {} }: PublicApiStubOptions = {},
): Promise<PublicApiStub> {
  const stub: PublicApiStub = { writes: [], lookups: [] };
  const placed: PublicOrderConfirmation[] = [...orders];
  let created = FIRST_NEW;

  await page.route(apiPath(MENU), (route) => route.fulfill(json(samplePublicMenu())));
  await page.route(apiPath(CURRENT_DROP), (route) =>
    route.fulfill(noActiveDrop ? json({ detail: NO_ACTIVE_DROP }, 404) : json(samplePublicDrop())),
  );

  await page.route(apiPath(ORDERS), (route) => {
    const body = recordWrite(stub.writes, route.request()) as PublicOrderCreateBody;
    const confirmation = confirmationFromOrder(orderIdAt(created++), body);
    placed.push(confirmation);
    return route.fulfill(json(confirmation, 201));
  });
  await page.route(apiPath(ORDER), (route) => {
    const order = placed.find((o) => o.order_id === pathId(ORDER, route.request()));
    return route.fulfill(order ? json(order) : json({ detail: ORDER_NOT_FOUND }, 404));
  });

  await page.route(apiPath(LOOKUP), (route) => {
    const phone = new URL(route.request().url()).searchParams.get("phone") ?? "";
    stub.lookups.push(phone);
    const customer = knownCustomers[phone.replace(/\D/g, "")];
    return route.fulfill(customer ? json(customer) : json({ detail: NO_CUSTOMER }, 404));
  });

  return stub;
}
