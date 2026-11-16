/**
 * No-backend E2E for the amount check in the transaction editor.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Save & Approve and the prompt's Save & close are not native form submits, so the
 * amount input's own min/step never ran for them. Verifies, on /transactions:
 *   - Save & Approve with a cleared, zero, negative or sub-cent amount shows a field
 *     error and sends nothing (a cleared amount used to approve with the old one).
 *   - The prompt's Save & close repeats the amount problem inside the prompt.
 *   - A fixed amount clears the error and is sent with the approval.
 *   - A server refusal (422) shows the server's reason, not a generic failure.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages } from "./fixtures/mockTransactions";
import { json } from "@platform/ui/test-support/mockResponse";

const TXN_ID = "00000000-0000-0000-0000-0000000000b1";

const TXN = {
  id: TXN_ID,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  vendor: "Test Plumber",
  vendor_id: null,
  description: null,
  amount: "500.00",
  transaction_type: "expense",
  category: "contract_work",
  tags: [],
  property_id: null,
  tax_relevant: true,
  payment_method: null,
  channel: null,
  transaction_date: "2024-06-15",
  tax_year: 2024,
  status: "pending",
  is_manual: true,
  source_document_id: null,
  created_at: "2024-06-15T00:00:00Z",
  updated_at: "2024-06-15T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
};

interface FakeServer {
  patches: unknown[];
  refuseNextPatch: boolean;
}

async function stubApi(page: Page): Promise<FakeServer> {
  const server: FakeServer = { patches: [], refuseNextPatch: false };
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await stubWorkspaceShell(page, "owner");
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/vendors?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/review-count", (route) => route.fulfill(json({ count: 1 })));
  await stubTransactionPages(page, [TXN]);
  await page.route(`**/api/transactions/${TXN_ID}`, async (route, request: Request) => {
    if (request.method() !== "PATCH") {
      await route.fulfill(json(TXN));
      return;
    }
    server.patches.push(request.postDataJSON());
    if (server.refuseNextPatch) {
      server.refuseNextPatch = false;
      await route.fulfill(json({ detail: [{ loc: ["body", "amount"], msg: "Value error, That amount is too large.", type: "value_error" }] }, 422));
      return;
    }
    await route.fulfill(json({ ...TXN, ...(request.postDataJSON() as object), retroactive_count: 0 }));
  });
  return server;
}

async function openTransaction(page: Page) {
  await page.goto("/transactions");
  await page.getByText("Test Plumber").locator("visible=true").first().click();
  const panel = page.getByRole("dialog", { name: "Test Plumber" });
  await expect(panel.getByRole("spinbutton", { name: "Amount", exact: true })).toHaveValue("500.00");
  return panel;
}

test.describe("Transaction editor: amount check", () => {
  let server: FakeServer;

  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
    server = await stubApi(page);
  });

  for (const [value, message] of [
    ["", "Enter an amount above $0."],
    ["0", "Enter an amount above $0."],
    ["-5", "Use dollars and cents, like 84.20."],
    ["12.345", "Use dollars and cents, like 84.20."],
  ] as const) {
    test(`Save & Approve refuses ${JSON.stringify(value)} and sends nothing`, async ({ page }) => {
      const panel = await openTransaction(page);
      const amount = panel.getByRole("spinbutton", { name: "Amount", exact: true });
      await amount.fill(value);

      await panel.getByRole("button", { name: "Save & Approve" }).click();

      await expect(panel.getByRole("alert")).toHaveText(message);
      await expect(amount).toHaveAttribute("aria-invalid", "true");
      await expect(amount).toBeFocused();
      await expect(panel).toBeVisible();
      expect(server.patches).toEqual([]);
    });
  }

  test("the prompt's Save & close names the amount problem and stays open", async ({ page }) => {
    const panel = await openTransaction(page);
    await panel.getByRole("spinbutton", { name: "Amount", exact: true }).fill("");
    await page.keyboard.press("Escape");

    const prompt = page.getByRole("alertdialog", { name: "Save your changes?" });
    await prompt.getByRole("button", { name: "Save & close" }).click();

    await expect(prompt.getByRole("alert")).toHaveText("Enter an amount above $0.");
    await expect(prompt).toBeVisible();
    expect(server.patches).toEqual([]);
  });

  test("a fixed amount clears the error and is approved", async ({ page }) => {
    const panel = await openTransaction(page);
    const amount = panel.getByRole("spinbutton", { name: "Amount", exact: true });
    await amount.fill("12.345");
    await panel.getByRole("button", { name: "Save & Approve" }).click();
    await expect(panel.getByRole("alert")).toBeVisible();

    await amount.fill("84.20");
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await panel.getByRole("button", { name: "Save & Approve" }).click();

    await expect(panel).toHaveCount(0);
    expect(server.patches).toEqual([{ amount: "84.20", status: "approved" }]);
  });

  test("a server refusal shows the server's reason", async ({ page }) => {
    const panel = await openTransaction(page);
    await panel.getByRole("spinbutton", { name: "Amount", exact: true }).fill("84.20");
    server.refuseNextPatch = true;

    await panel.getByRole("button", { name: "Save & Approve" }).click();

    await expect(page.getByText("That amount is too large.")).toBeVisible();
    await expect(panel).toBeVisible();
  });
});
