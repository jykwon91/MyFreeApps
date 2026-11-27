/**
 * No-backend E2E for payee rules: "Always file payments to this payee like this".
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job. Verifies, on /transactions:
 *   - Ticking the option on a payment split three ways and saving posts a rule that
 *     splits evenly across the same three houses, with the row's category and scope.
 *   - When past payments match, it asks with the count first; confirming posts
 *     apply-to-past and says how many it filed, then the panel closes.
 *   - "Not now" files nothing in the past.
 *   - In Vendor Rules, a payee rule shows its scope and split, and "Apply to past"
 *     asks with the count before filing.
 *   - The option is touch-sized on a phone.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { toastAboveModal } from "@platform/ui/test-support/toast";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";
import { settledBoundingBox } from "@platform/ui/test-support/settledBoundingBox";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages } from "./fixtures/mockTransactions";

const TXN_ID = "00000000-0000-0000-0000-0000000000d1";
const RULE_ID = "00000000-0000-0000-0000-0000000000e1";
const PAYEE = "Zelle payment to Jason Law";
const STORED_PATTERN = "zelle payment to jason law";
const OPTION = "Always file payments to this payee like this";

const HOUSES = ["6732 Peerless", "6734 Peerless", "6738 Peerless"].map((name, index) => ({
  id: `00000000-0000-0000-0000-00000000020${index + 1}`,
  name,
  address: null,
  classification: "investment",
  type: "single_family",
  is_active: true,
  activity_periods: [],
  created_at: "2024-01-01T00:00:00Z",
}));

const TXN = {
  id: TXN_ID,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  vendor: PAYEE,
  vendor_id: null,
  description: null,
  amount: "300.00",
  transaction_type: "expense",
  transaction_scope: "rental",
  category: "maintenance",
  tags: ["maintenance"],
  property_id: null,
  property_splits: HOUSES.map((house) => ({ property_id: house.id, amount: "100.00" })),
  tax_relevant: true,
  is_capital_improvement: false,
  payment_method: null,
  channel: null,
  transaction_date: "2026-06-15",
  tax_year: 2026,
  status: "approved",
  is_manual: false,
  source_document_id: null,
  created_at: "2026-06-15T00:00:00Z",
  updated_at: "2026-06-15T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
};

const RULE = {
  id: RULE_ID,
  organization_id: ORG_ID,
  match_type: "vendor",
  match_pattern: STORED_PATTERN,
  match_context: null,
  category: "maintenance",
  property_id: null,
  activity_id: null,
  transaction_scope: "rental",
  split_property_ids: HOUSES.map((house) => house.id),
  source: "manual",
  priority: 0,
  times_applied: 0,
  is_active: true,
  created_at: "2026-11-27T00:00:00Z",
};

interface FakeServer {
  created: unknown[];
  applied: number;
  pastCount: number;
}

async function stubApi(page: Page, pastCount: number, rules: unknown[] = []): Promise<FakeServer> {
  const server: FakeServer = { created: [], applied: 0, pastCount };
  await page.route("**/api/**", (route, request: Request) => route.fulfill(json(request.method() === "GET" ? [] : {})));
  await stubWorkspaceShell(page, "owner");
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/vendors?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/properties", (route) => route.fulfill(json(HOUSES)));
  await stubTransactionPages(page, [TXN]);
  await page.route(`**/api/transactions/${TXN_ID}`, (route) => route.fulfill(json(TXN)));
  await page.route("**/api/classification-rules", async (route, request: Request) => {
    if (request.method() === "POST") {
      server.created.push(request.postDataJSON());
      await route.fulfill(json(RULE, 201));
      return;
    }
    await route.fulfill(json(rules));
  });
  await page.route(`**/api/classification-rules/${RULE_ID}/past-matches`, (route) =>
    route.fulfill(json({ count: server.pastCount })),
  );
  await page.route(`**/api/classification-rules/${RULE_ID}/apply-to-past`, async (route) => {
    server.applied += 1;
    await route.fulfill(json({ applied: server.pastCount }));
  });
  return server;
}

async function openTransaction(page: Page) {
  await page.goto("/transactions");
  await page.getByText(PAYEE).locator("visible=true").first().click();
  return page.getByRole("dialog", { name: PAYEE });
}

test.describe("Payee rules", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("saves a rule that splits like this payment, then files the past ones after a count confirm", async ({ page }) => {
    const server = await stubApi(page, 14);
    const panel = await openTransaction(page);

    await panel.getByRole("checkbox", { name: new RegExp(OPTION) }).check();
    await panel.getByRole("button", { name: "Save" }).click();

    const question = page.getByRole("dialog").filter({ hasText: "File past payments too?" });
    await expect(question).toContainText(`I found 14 past payments from ${STORED_PATTERN}`);
    expect(server.created).toEqual([{
      match_type: "vendor",
      match_pattern: PAYEE,
      category: "maintenance",
      transaction_scope: "rental",
      split_property_ids: HOUSES.map((house) => house.id),
    }]);
    expect(server.applied).toBe(0);

    await question.getByRole("button", { name: "File 14 payments" }).click();

    await expect(toastAboveModal(page, `Done! I filed 14 past payments from ${STORED_PATTERN}.`)).toBeVisible();
    expect(server.applied).toBe(1);
    await expect(panel).toHaveCount(0);
  });

  test("Not now files nothing in the past", async ({ page }) => {
    const server = await stubApi(page, 3);
    const panel = await openTransaction(page);

    await panel.getByRole("checkbox", { name: new RegExp(OPTION) }).check();
    await panel.getByRole("button", { name: "Save" }).click();
    await page.getByRole("dialog").filter({ hasText: "File past payments too?" }).getByRole("button", { name: "Not now" }).click();

    await expect(panel).toHaveCount(0);
    expect(server.created).toHaveLength(1);
    expect(server.applied).toBe(0);
  });

  test("the rules panel shows the split and applies a rule to the past after a count confirm", async ({ page }) => {
    const server = await stubApi(page, 15, [RULE]);
    await page.goto("/transactions");
    await page.getByRole("button", { name: /vendor rules/i }).click();
    const rules = page.getByRole("dialog", { name: "Classification Rules" });

    const row = rules.locator("tbody tr").first();
    await expect(row).toContainText("Rental");
    await expect(row).toContainText("Split evenly: 6732 Peerless, 6734 Peerless, 6738 Peerless");

    await row.getByRole("button", { name: `Apply the rule for ${STORED_PATTERN} to past payments` }).click();
    const question = page.getByRole("dialog").filter({ hasText: "File past payments too?" });
    await expect(question).toContainText("I found 15 past payments");
    await question.getByRole("button", { name: "File 15 payments" }).click();

    await expect(toastAboveModal(page, `Done! I filed 15 past payments from ${STORED_PATTERN}.`)).toBeVisible();
    expect(server.applied).toBe(1);
  });

  test("the option is touch-sized on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await stubApi(page, 0);
    const panel = await openTransaction(page);

    const option = panel.locator("label", { hasText: OPTION });
    const box = await settledBoundingBox(option);
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});
