/**
 * Stubs the service dashboard (app/api/service.py): GET
 * /service/drops/{id} answers the dashboard, and POST
 * /service/orders/{id}/advance moves the order to the target status, which
 * the next dashboard read shows.
 */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import type { SentRequest } from "@platform/ui/test-support/types/SentRequest";
import type { AdvanceOrderResponse, OrderStatus, ServiceDashboardPayload } from "@/types/service/service";
import { apiPath, pathId } from "./apiPath";
import { recordWrite } from "./recordWrite";
import { sampleDashboard } from "./serviceFixtures";

const DASHBOARD = /^\/service\/drops\/([^/]+)$/;
const ADVANCE = /^\/service\/orders\/([^/]+)\/advance$/;
const NOT_FOUND = { detail: "Not Found" };

export async function stubServiceApi(page: Page, dashboard: ServiceDashboardPayload = sampleDashboard()): Promise<SentRequest[]> {
  const writes: SentRequest[] = [];
  let state = dashboard;

  await page.route(apiPath(DASHBOARD), (route) =>
    pathId(DASHBOARD, route.request()) === state.drop.id
      ? route.fulfill(json(state))
      : route.fulfill(json(NOT_FOUND, 404)),
  );

  await page.route(apiPath(ADVANCE), (route) => {
    const orderId = pathId(ADVANCE, route.request());
    const { target_status } = recordWrite(writes, route.request()) as { target_status: OrderStatus };
    const order = state.slots.flatMap((slot) => slot.orders).find((o) => o.id === orderId);
    if (!order) return route.fulfill(json(NOT_FOUND, 404));
    state = {
      ...state,
      slots: state.slots.map((slot) => ({
        ...slot,
        orders: slot.orders.map((o) => (o.id === orderId ? { ...o, status: target_status } : o)),
      })),
    };
    const answer: AdvanceOrderResponse = {
      order: { id: order.id, status: target_status, slot_id: order.slot_id, ready_text_sent_at: null },
      sms_dispatched: null,
      sms_error: null,
    };
    return route.fulfill(json(answer));
  });

  return writes;
}
