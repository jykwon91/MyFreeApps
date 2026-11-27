/**
 * No-backend E2E for splitting one expense across several properties.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job. Verifies, on /transactions:
 *   - Split evenly gives three houses $33.34 / $33.33 / $33.33 of a $100 payment and
 *     saves exactly those shares; the list then reads "Split 3 ways".
 *   - Uneven shares can't be saved until they add up to the amount.
 *   - Remove split sends a DELETE and the list names no property again.
 *   - A server refusal (422) shows the server's reason and keeps the editor open.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubTransactionPages } from "./fixtures/mockTransactions";
import { json } from "@platform/ui/test-support/mockResponse";
import { toastAboveModal } from "@platform/ui/test-support/toast";

const TXN_ID = "00000000-0000-0000-0000-0000000000c1";

const HOUSES = ["6732 Peerless", "6734 Peerless", "6738 Peerless"].map((name, index) => ({
  id: `00000000-0000-0000-0000-00000000010${index + 1}`,
  name,
  address: null,
  classification: "investment",
  type: "single_family",
  is_active: true,
  activity_periods: [],
  created_at: "2024-01-01T00:00:00Z",
}));

interface Share {
  property_id: string | null;
  amount: string;
}

const BASE_TXN = {
  id: TXN_ID,
  organization_id: ORG_ID,
  user_id: "00000000-0000-0000-0000-000000000001",
  vendor: "Zelle payment to Jason Law",
  vendor_id: null,
  description: null,
  amount: "100.00",
  transaction_type: "expense",
  transaction_scope: "rental",
  category: "maintenance",
  tags: [],
  property_id: null,
  property_splits: [] as Share[],
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

interface FakeServer {
  puts: unknown[];
  deletes: number;
  refuseNextPut: boolean;
}

async function stubApi(page: Page, splits: Share[] = [], propertyId: string | null = null): Promise<FakeServer> {
  const server: FakeServer = { puts: [], deletes: 0, refuseNextPut: false };
  // The list stub reads this array on every request, so a saved split shows on the refetch.
  const rows = [{ ...BASE_TXN, property_id: propertyId, property_splits: splits }];
  await page.route("**/api/**", (route, request: Request) => route.fulfill(json(request.method() === "GET" ? [] : {})));
  await stubWorkspaceShell(page, "owner");
  const emptyPage = json({ items: [], total: 0, has_more: false });
  await page.route("**/api/vendors?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/transactions/attribution-review-queue?**", (route) => route.fulfill(emptyPage));
  await page.route("**/api/properties", (route) => route.fulfill(json(HOUSES)));
  await stubTransactionPages(page, rows);
  await page.route(`**/api/transactions/${TXN_ID}`, (route) => route.fulfill(json(rows[0])));
  await page.route(`**/api/transactions/${TXN_ID}/property-splits`, async (route, request: Request) => {
    if (request.method() === "DELETE") {
      server.deletes += 1;
      rows[0] = { ...rows[0], property_splits: [] };
      await route.fulfill(json(rows[0]));
      return;
    }
    server.puts.push(request.postDataJSON());
    if (server.refuseNextPut) {
      server.refuseNextPut = false;
      await route.fulfill(json({ detail: "One of those properties isn't in this workspace." }, 422));
      return;
    }
    const { shares } = request.postDataJSON() as { shares: Share[] };
    rows[0] = { ...rows[0], property_id: null, property_splits: shares };
    await route.fulfill(json(rows[0]));
  });
  return server;
}

async function openTransaction(page: Page) {
  await page.goto("/transactions");
  await page.getByText("Zelle payment to Jason Law").locator("visible=true").first().click();
  const panel = page.getByRole("dialog", { name: "Zelle payment to Jason Law" });
  await expect(panel.getByRole("region", { name: "Split across properties" })).toBeVisible();
  return panel;
}

async function tickAllHouses(panel: ReturnType<Page["getByRole"]>) {
  for (const house of HOUSES) await panel.getByRole("checkbox", { name: `Include ${house.name}` }).check();
}

test.describe("Transaction editor: split across properties", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
  });

  test("splits evenly across three houses and the list says Split 3 ways", async ({ page }) => {
    const server = await stubApi(page);
    const panel = await openTransaction(page);
    const section = panel.getByRole("region", { name: "Split across properties" });

    await section.getByRole("button", { name: "Split across properties" }).click();
    await tickAllHouses(section);
    await section.getByRole("button", { name: "Split evenly" }).click();

    await expect(section.getByRole("textbox", { name: "Amount for 6732 Peerless" })).toHaveValue("33.34");
    await expect(section.getByRole("textbox", { name: "Amount for 6734 Peerless" })).toHaveValue("33.33");
    await expect(section.getByRole("textbox", { name: "Amount for 6738 Peerless" })).toHaveValue("33.33");
    await expect(section.getByRole("status")).toHaveText("$100.00 of $100.00 assigned");

    await section.getByRole("button", { name: "Save split" }).click();

    await expect(toastAboveModal(page, "Got it. I split it 3 ways.")).toBeVisible();
    expect(server.puts).toEqual([
      {
        shares: [
          { property_id: HOUSES[0].id, amount: "33.34" },
          { property_id: HOUSES[1].id, amount: "33.33" },
          { property_id: HOUSES[2].id, amount: "33.33" },
        ],
      },
    ]);
    await expect(section.getByText("Split across 3 properties")).toBeVisible();
    await expect(panel.getByRole("combobox", { name: "Property" })).toHaveValue("");
    await expect(panel.getByTestId("property-split-hint")).toHaveText("Picking one property here ends the split.");
    await expect(panel.getByText("Unsaved changes")).toHaveCount(0);

    await panel.getByRole("button", { name: "Close panel" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("split-ways-badge").locator("visible=true").first()).toHaveText("Split 3 ways");
  });

  test("a row filed under one house loses that house when split, and isn't left unsaved", async ({ page }) => {
    await stubApi(page, [], HOUSES[0].id);
    const panel = await openTransaction(page);
    const section = panel.getByRole("region", { name: "Split across properties" });
    await expect(panel.getByRole("combobox", { name: "Property" })).toHaveValue(HOUSES[0].id);

    await section.getByRole("button", { name: "Split across properties" }).click();
    await tickAllHouses(section);
    await section.getByRole("button", { name: "Split evenly" }).click();
    await section.getByRole("button", { name: "Save split" }).click();

    await expect(section.getByText("Split across 3 properties")).toBeVisible();
    await expect(panel.getByRole("combobox", { name: "Property" })).toHaveValue("");
    await expect(panel.getByText("Unsaved changes")).toHaveCount(0);
  });

  test("uneven shares can't be saved until they add up", async ({ page }) => {
    const server = await stubApi(page);
    const panel = await openTransaction(page);
    const section = panel.getByRole("region", { name: "Split across properties" });

    await section.getByRole("button", { name: "Split across properties" }).click();
    await section.getByRole("textbox", { name: "Amount for 6732 Peerless" }).fill("70");
    await section.getByRole("textbox", { name: "Amount for 6734 Peerless" }).fill("20");

    await expect(section.getByRole("status")).toHaveText("$10.00 left to assign");
    await expect(section.getByRole("button", { name: "Save split" })).toBeDisabled();

    await section.getByRole("textbox", { name: "Amount for 6734 Peerless" }).fill("30");
    await section.getByRole("button", { name: "Save split" }).click();

    await expect(section.getByText("Split across 2 properties")).toBeVisible();
    expect(server.puts).toEqual([
      { shares: [{ property_id: HOUSES[0].id, amount: "70.00" }, { property_id: HOUSES[1].id, amount: "30.00" }] },
    ]);
  });

  test("removing a split leaves the row with no property", async ({ page }) => {
    const server = await stubApi(page, HOUSES.map((house, index) => ({ property_id: house.id, amount: index === 0 ? "33.34" : "33.33" })));
    await page.goto("/transactions");
    await expect(page.getByTestId("split-ways-badge").locator("visible=true").first()).toHaveText("Split 3 ways");

    const panel = await openTransaction(page);
    await panel.getByRole("button", { name: "Remove split" }).click();

    await expect(toastAboveModal(page, "Split removed. Pick a property for it when you're ready.")).toBeVisible();
    expect(server.deletes).toBe(1);
    await expect(panel.getByRole("button", { name: "Split across properties" })).toBeVisible();

    await panel.getByRole("button", { name: "Close panel" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByTestId("split-ways-badge")).toHaveCount(0);
  });

  test("a server refusal shows its reason and keeps the editor open", async ({ page }) => {
    const server = await stubApi(page);
    server.refuseNextPut = true;
    const panel = await openTransaction(page);
    const section = panel.getByRole("region", { name: "Split across properties" });

    await section.getByRole("button", { name: "Split across properties" }).click();
    await tickAllHouses(section);
    await section.getByRole("button", { name: "Split evenly" }).click();
    await section.getByRole("button", { name: "Save split" }).click();

    await expect(toastAboveModal(page, "One of those properties isn't in this workspace.")).toBeVisible();
    await expect(section.getByRole("button", { name: "Save split" })).toBeVisible();
  });
});
