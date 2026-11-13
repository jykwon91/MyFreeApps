/**
 * No-backend E2E for an order the backend refuses, signed out: the customer
 * reads the backend's reason in a toast, keeps what they entered and can send
 * the order again. The toast is the shared Toaster, mounted once above every
 * route, so it also shows on a signed-in page exactly once.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { toast, toastRegion } from "@platform/ui/test-support/toast";
import type { OrderRefusal } from "./types/OrderRefusal";
import { FIXTURE_NOW } from "./constants/fixtureTimes";
import { DROP_CLOSED, SLOT_FILLED, SLOT_GONE } from "./constants/refusalDetails";
import { fillDetails } from "./fixtures/publicOrderForm";
import { stubCustomersApi } from "./fixtures/stubCustomersApi";
import { stubPublicApi } from "./fixtures/stubPublicApi";
import { stubSignedInShellAt } from "./fixtures/stubSignedInShellAt";

const REFUSALS: Array<{ why: string; refusal: OrderRefusal }> = [
  { why: "the slot filled up", refusal: { status: 400, detail: SLOT_FILLED } },
  { why: "the drop closed", refusal: { status: 400, detail: DROP_CLOSED } },
  { why: "the slot is gone", refusal: { status: 404, detail: SLOT_GONE } },
];

for (const { why, refusal } of REFUSALS) {
  test(`when ${why}, the customer is told why and keeps the order to send again`, async ({ page }) => {
    await stubUnmatchedApi(page);
    const api = await stubPublicApi(page, { refuseOrders: refusal });

    await page.goto("/order");
    await page.getByRole("button", { name: /^5:00 PM/ }).click();
    await fillDetails(page, "Dana Cruz", "5125550199");
    await page.getByRole("button", { name: "Place order" }).click();

    await expect(toast(page, refusal.detail)).toBeVisible();
    expect(api.writes).toHaveLength(1);
    await expect(page.getByLabel("Name")).toHaveValue("Dana Cruz");
    await expect(page.getByRole("button", { name: "Place order" })).toBeEnabled();
  });
}

test("a toast on a signed-in page shows exactly once", async ({ page }) => {
  await page.clock.setFixedTime(FIXTURE_NOW);
  await stubSignedInShellAt(page, FIXTURE_NOW);
  await stubCustomersApi(page);

  await page.goto("/customers");
  const ben = page.getByRole("main").getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Ben Ortiz" }) });
  await ben.getByRole("button", { name: "Edit notes for Ben Ortiz" }).click();
  await ben.getByRole("textbox").fill("Allergic to mushrooms");
  await ben.getByRole("button", { name: "Save" }).click();

  await expect(toast(page, "Notes saved")).toHaveCount(1);
  await expect(toastRegion(page)).toHaveCount(1);
});
