/**
 * No-backend E2E for the "Save your changes?" prompt in the transaction editor.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies, on /transactions:
 *   - Closing an unedited transaction closes straight away.
 *   - Escape on an edited transaction asks first; Escape or a click outside the
 *     prompt keeps the edits (the prompt never throws them away by accident).
 *   - Discard closes without sending anything.
 *   - Save & close sends only the edited field, then closes.
 *   - A 500 on Save & close keeps the prompt open with an inline error, and a retry works.
 *   - The prompt's buttons are at least 44px tall and fit a phone-width screen.
 *   - Fields are named by their visible labels, and clicking a label focuses its field.
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import { ORG_ID, plantAuth } from "./fixtures/mockSession";
import { json } from "./fixtures/mockResponse";

const TXN_ID = "00000000-0000-0000-0000-0000000000a1";

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
  status: "approved",
  is_manual: true,
  source_document_id: null,
  created_at: "2024-06-15T00:00:00Z",
  updated_at: "2024-06-15T00:00:00Z",
  applicant_id: null,
  attribution_source: null,
};

interface FakeServer {
  patches: unknown[];
  failNextPatch: boolean;
}


async function stubApi(page: Page): Promise<FakeServer> {
  const server: FakeServer = { patches: [], failNextPatch: false };
  // Registered first so the specific routes below win; the page's other reads get an empty answer.
  await page.route("**/api/**", (route, request: Request) =>
    route.fulfill(json(request.method() === "GET" ? [] : {})),
  );
  await page.route("**/api/users/me", (route) =>
    route.fulfill(
      json({
        id: "00000000-0000-0000-0000-000000000001",
        email: "test@example.com",
        name: "Test User",
        is_active: true,
        is_superuser: false,
        is_verified: true,
        role: "owner",
      }),
    ),
  );
  await page.route("**/api/organizations", (route) =>
    route.fulfill(json([{ id: ORG_ID, name: "Test Workspace", role: "owner", org_role: "owner" }])),
  );
  await page.route("**/api/version", (route) => route.fulfill(json({ version: "test" })));
  await page.route("**/api/tax-profile", (route) =>
    route.fulfill(json({ onboarding_completed: true, tax_situations: [], filing_status: null, dependents_count: 0 })),
  );
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/vendors?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/review-count", (route) => route.fulfill(json({ count: 0 })));
  await page.route(/\/api\/transactions(\?.*)?$/, (route) => route.fulfill(json([TXN])));
  await page.route(`**/api/transactions/${TXN_ID}`, async (route, request: Request) => {
    if (request.method() !== "PATCH") {
      await route.fulfill(json(TXN));
      return;
    }
    server.patches.push(request.postDataJSON());
    if (server.failNextPatch) {
      server.failNextPatch = false;
      await route.fulfill(json({ detail: "boom" }, 500));
      return;
    }
    await route.fulfill(json({ ...TXN, ...(request.postDataJSON() as object), retroactive_count: 0 }));
  });
  return server;
}

async function openTransaction(page: Page): Promise<void> {
  await page.goto("/transactions");
  await page.getByText("Test Plumber").locator("visible=true").first().click();
  await expect(page.getByRole("textbox", { name: "Vendor", exact: true })).toHaveValue("Test Plumber");
}

async function editVendor(page: Page): Promise<void> {
  await page.getByRole("textbox", { name: "Vendor", exact: true }).fill("New Plumber");
}

const prompt = (page: Page) => page.getByRole("alertdialog", { name: "Save your changes?" });

test.describe("Transaction editor: unsaved changes", () => {
  let server: FakeServer;

  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
    server = await stubApi(page);
  });

  test("an unedited transaction closes straight away", async ({ page }) => {
    await openTransaction(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("textbox", { name: "Vendor", exact: true })).toHaveCount(0);
    await expect(prompt(page)).toHaveCount(0);
  });

  test("Escape and an outside click keep the edits", async ({ page }) => {
    await openTransaction(page);
    await editVendor(page);

    await page.keyboard.press("Escape");
    await expect(prompt(page)).toBeVisible();
    await expect(prompt(page).getByRole("button", { name: "Keep editing" })).toBeFocused();

    await page.mouse.click(5, 5);
    await expect(prompt(page)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(prompt(page)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Vendor", exact: true })).toHaveValue("New Plumber");
    expect(server.patches).toEqual([]);
  });

  test("Discard closes without saving", async ({ page }) => {
    await openTransaction(page);
    await editVendor(page);
    await page.keyboard.press("Escape");

    await prompt(page).getByRole("button", { name: "Discard" }).click();
    await expect(prompt(page)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Vendor", exact: true })).toHaveCount(0);
    expect(server.patches).toEqual([]);
  });

  test("Save & close sends the edit and closes", async ({ page }) => {
    await openTransaction(page);
    await editVendor(page);
    await page.keyboard.press("Escape");

    await prompt(page).getByRole("button", { name: "Save & close" }).click();
    await expect(prompt(page)).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Vendor", exact: true })).toHaveCount(0);
    expect(server.patches).toEqual([{ vendor: "New Plumber" }]);
  });

  test("a failed Save & close says so and keeps the prompt; retry saves", async ({ page }) => {
    await openTransaction(page);
    await editVendor(page);
    await page.keyboard.press("Escape");
    server.failNextPatch = true;

    await prompt(page).getByRole("button", { name: "Save & close" }).click();
    await expect(prompt(page).getByRole("alert")).toHaveText("I couldn't save your changes. Mind trying again?");

    await prompt(page).getByRole("button", { name: "Save & close" }).click();
    await expect(prompt(page)).toHaveCount(0);
    expect(server.patches).toHaveLength(2);
  });

  test("each field is named by its label, and clicking the label focuses it", async ({ page }) => {
    await openTransaction(page);
    const panel = page.getByRole("dialog", { name: "Test Plumber" });
    await expect(panel.getByRole("spinbutton", { name: "Amount", exact: true })).toHaveValue("500.00");

    await panel.getByText("Amount", { exact: true }).click();
    await expect(panel.getByLabel("Amount", { exact: true })).toBeFocused();
    await expect(panel.getByRole("group", { name: "Tax Relevant" }).getByRole("checkbox", { name: "Include in tax reports" })).toBeChecked();
  });

  test("the prompt fits a phone and its buttons are easy to tap", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await openTransaction(page);
    await editVendor(page);
    await page.keyboard.press("Escape");

    for (const name of ["Discard", "Keep editing", "Save & close"]) {
      const box = await prompt(page).getByRole("button", { name }).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.height, name).toBeGreaterThanOrEqual(44);
      expect(box!.x, name).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, name).toBeLessThanOrEqual(375);
    }
  });
});
