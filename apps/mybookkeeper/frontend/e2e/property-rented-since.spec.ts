/**
 * Property "Rented since" → Rental ROI. A home lived in before it was rented
 * should only be judged on the months it was rented: set the date on the
 * property, and the ROI page drops the earlier costs and averages over fewer
 * months.
 */
import { test, expect, type Page } from "@playwright/test";
import { format, startOfMonth, subMonths } from "date-fns";
import { seededOrg } from "./fixtures/seeded-org";
import { createProperty } from "./fixtures/seed-data";
import { seedTransactions } from "./fixtures/seed-transactions";
import type { SeedRow } from "./fixtures/seed-row";

const HOME = "E2E Rented Home";
const day = (monthsBack: number) => format(startOfMonth(subMonths(new Date(), monthsBack)), "yyyy-MM-dd");
const RENTED_SINCE = day(4);

/**
 * Whole window: ($3,000 + $600) / 12 = $300/mo break-even, $6,000 / 12 = $500/mo rent.
 * From four months back: $600 / 4 = $150/mo break-even, $6,000 / 4 = $1,500/mo rent.
 */
const rows: readonly SeedRow[] = [
  { property: "north", date: day(10), type: "expense", category: "utilities", vendor: "E2E Power Co", amount: "3000.00" },
  { property: "north", date: day(3), type: "expense", category: "utilities", vendor: "E2E Power Co", amount: "600.00" },
  { property: "north", date: day(2), type: "income", category: "rental_revenue", vendor: "E2E Tenant", amount: "6000.00" },
];

let homeId = "";

const org = seededOrg("rented-since", async (api) => {
  const home = await createProperty(api, { name: HOME, classification: "primary_residence" });
  homeId = home.id;
  await seedTransactions(api, { north: home.id, south: home.id }, rows);
});

async function openRentalRoi(page: Page): Promise<void> {
  await page.goto("/analytics");
  await expect(page.getByRole("tab", { name: "Rental ROI" })).toHaveAttribute("aria-selected", "true");
}

function roiRow(page: Page) {
  return page.getByTestId("rental-roi-row").filter({ hasText: HOME });
}

test.describe("Property rented since", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
  });

  test("setting it on the property makes Rental ROI count only the rented months", async ({ page }) => {
    await openRentalRoi(page);
    await expect(roiRow(page)).toContainText("$300");
    await expect(roiRow(page)).toContainText("$500");

    await page.goto("/properties");
    const card = page.locator("li").filter({ hasText: HOME });
    await card.getByTitle("Edit").click();
    const editCard = page.locator("li").filter({ has: page.getByRole("button", { name: /save/i }) });
    await expect(editCard.getByText("Rental ROI only counts costs and rent from this month on.", { exact: false })).toBeVisible();
    await editCard.getByLabel("Rented since").fill(RENTED_SINCE);
    await editCard.getByRole("button", { name: /save/i }).click();
    await expect(page.getByText("Property updated", { exact: true })).toBeVisible();

    const saved = await org().api.get("/properties");
    expect(saved.ok(), await saved.text()).toBe(true);
    const stored = ((await saved.json()) as { id: string; rented_since: string | null }[]).find((p) => p.id === homeId);
    expect(stored?.rented_since).toBe(RENTED_SINCE);

    await openRentalRoi(page);
    await expect(roiRow(page)).toContainText("$150");
    await expect(roiRow(page)).toContainText("$1,500");
  });
});
