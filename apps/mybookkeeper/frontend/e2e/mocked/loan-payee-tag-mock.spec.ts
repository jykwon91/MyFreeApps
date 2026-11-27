/**
 * No-backend E2E for counting a payee's payments as a mortgage or a loan.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - an outgoing transaction's panel offers "Count as mortgage" / "Count as loan";
 *   - tagging sends the kind, toasts, and the panel says what it counts as;
 *   - Cash flow then shows those payments on the "Mortgages & loans" line;
 *   - "Stop counting it" sends a DELETE and the panel offers the tag again;
 *   - a failed save says so and leaves the payee untagged;
 *   - the buttons are touch-sized and fit a phone screen.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { toastAboveModal } from "@platform/ui/test-support/toast";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";
import { settledBoundingBox } from "@platform/ui/test-support/settledBoundingBox";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages } from "./fixtures/mockTransactions";

const TXN_ID = "00000000-0000-0000-0000-0000000000b1";
const PAYEE = "Pat Doe External F";
const PAYMENT_CENTS = 341_396;

const TXN = {
  id: TXN_ID,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  vendor: PAYEE,
  vendor_id: null,
  description: null,
  amount: "3413.96",
  transaction_type: "transfer",
  category: "transfer",
  tags: [],
  property_id: null,
  property_splits: [],
  tax_relevant: false,
  payment_method: null,
  channel: null,
  transaction_date: "2026-11-02",
  tax_year: 2026,
  status: "approved",
  is_manual: false,
  source_document_id: null,
  created_at: "2026-11-02T00:00:00Z",
  updated_at: "2026-11-02T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
};

interface FakeServer {
  kind: "mortgage" | "loan" | null;
  puts: unknown[];
  deletes: number;
  failNextPut: boolean;
}

function cashFlow(kind: FakeServer["kind"]) {
  const loans = kind === null ? 0 : PAYMENT_CENTS;
  // Untagged, a payment to yourself is a move between your own money, not money out.
  const out = 120_000 + loans;
  return {
    range: "6m", scope: "all", account_id: null, currency: "USD", bank_history_start: "2024-11-27",
    months: [{ month: "2026-11", money_in_cents: 800_000, money_out_cents: out, mortgages_loans_cents: loans, net_cents: 800_000 - out }],
    totals: { money_in_cents: 800_000, money_out_cents: out, mortgages_loans_cents: loans, net_cents: 800_000 - out },
  };
}

async function stubApi(page: Page): Promise<FakeServer> {
  const server: FakeServer = { kind: null, puts: [], deletes: 0, failNextPut: false };
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/vendors?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/review-count", (route) => route.fulfill(json({ count: 0 })));
  await page.route("**/api/financial-accounts**", (route) => route.fulfill(json({ items: [], totals: [] })));
  await stubTransactionPages(page, [TXN]);
  await page.route(`**/api/transactions/${TXN_ID}`, (route) => route.fulfill(json(TXN)));
  await page.route(`**/api/transactions/${TXN_ID}/loan-payee`, async (route, request: Request) => {
    if (request.method() === "PUT") {
      server.puts.push(request.postDataJSON());
      if (server.failNextPut) {
        server.failNextPut = false;
        await route.fulfill(json({ detail: "boom" }, 500));
        return;
      }
      server.kind = (request.postDataJSON() as { kind: FakeServer["kind"] }).kind;
    } else if (request.method() === "DELETE") {
      server.deletes += 1;
      server.kind = null;
    }
    await route.fulfill(json({ payee: PAYEE, kind: server.kind, can_tag: true }));
  });
  await page.route(/\/api\/cash-flow(\?.*)?$/, (route) => route.fulfill(json(cashFlow(server.kind))));
  return server;
}

async function openPanel(page: Page): Promise<void> {
  await page.goto("/transactions");
  await page.getByText(PAYEE).locator("visible=true").first().click();
}

async function openTransaction(page: Page): Promise<void> {
  await openPanel(page);
  await expect(page.getByTestId("loan-payee-untagged")).toBeVisible();
}

async function openTransactionTagged(page: Page): Promise<void> {
  await openPanel(page);
  await expect(page.getByTestId("loan-payee-tagged")).toBeVisible();
}

test.describe("Counting a payee as a mortgage or loan", () => {
  let server: FakeServer;

  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
    server = await stubApi(page);
  });

  test("tagging counts the payments on Cash flow's mortgages & loans line, and can be taken back", async ({ page }) => {
    await page.goto("/cash-flow");
    await expect(page.getByTestId("cash-flow-total-loans")).toContainText("$0.00");

    await openTransaction(page);
    await page.getByRole("button", { name: "Count as mortgage" }).click();
    await expect(toastAboveModal(page, `Got it — payments to ${PAYEE} are on the "Mortgages & loans" line now.`)).toBeVisible();
    await expect(page.getByTestId("loan-payee-tagged")).toContainText(`Payments to ${PAYEE} count as a mortgage payment.`);
    expect(server.puts).toEqual([{ kind: "mortgage" }]);

    await page.goto("/cash-flow");
    await expect(page.getByTestId("cash-flow-total-loans")).toContainText("$3,413.96");
    await expect(page.getByTestId("cash-flow-total-out")).toContainText("$4,613.96");

    await openTransactionTagged(page);
    await page.getByRole("button", { name: "Stop counting it" }).click();
    await expect(page.getByTestId("loan-payee-untagged")).toBeVisible();
    expect(server.deletes).toBe(1);
  });

  test("a failed save says so and leaves the payee untagged", async ({ page }) => {
    server.failNextPut = true;
    await openTransaction(page);
    await page.getByRole("button", { name: "Count as loan" }).click();
    await expect(toastAboveModal(page, "I couldn't save that. Want to try again?")).toBeVisible();
    await expect(page.getByTestId("loan-payee-untagged")).toBeVisible();
    expect(server.kind).toBeNull();
  });

  test("the buttons are touch-sized and fit a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openTransaction(page);
    for (const name of ["Count as mortgage", "Count as loan"]) {
      const box = await settledBoundingBox(page.getByRole("button", { name }));
      expect(box).not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    }
  });
});
