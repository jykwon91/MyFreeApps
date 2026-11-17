/**
 * Analytics — Rental ROI. Runs against a fresh organization seeded with
 * RENTAL_ROI_SEED, so every monthly figure is known in advance.
 */
import { test, expect, type Page } from "@playwright/test";
import { holdRequests } from "./fixtures/hold-requests";
import { seededOrg } from "./fixtures/seeded-org";
import { RENTAL_ROI_SEED as SEED, seedRentalRoi } from "./fixtures/rental-roi-seed";

const ROI_PATH = "/analytics/rental-roi";

const org = seededOrg("rental-roi", seedRentalRoi);

function row(page: Page, name: string) {
  return page.getByTestId("rental-roi-row").filter({ hasText: name });
}

async function openRentalRoi(page: Page, query = ""): Promise<void> {
  await page.goto(`/analytics${query}`);
  await expect(page.getByRole("tab", { name: "Rental ROI" })).toHaveAttribute("aria-selected", "true");
}

test.describe("Analytics — Rental ROI", () => {
  test.beforeEach(async ({ page }) => {
    await org().signIn(page);
  });

  test("shows break-even, the target where there's a purchase price, and the gap", async ({ page }) => {
    await openRentalRoi(page);

    const headline = page.getByTestId("rental-roi-headline");
    await expect(headline.getByRole("heading")).toHaveText(SEED.headline);
    await expect(headline).toContainText(SEED.coverage);
    await expect(page.getByTestId("rental-roi-headline-actual")).toHaveText(SEED.actual);
    await expect(headline).toContainText(SEED.gap);

    const north = row(page, SEED.properties.north);
    await expect(north).toContainText(SEED.north.breakEven);
    await expect(north).toContainText(SEED.north.target8);
    await expect(north).toContainText(SEED.north.gap8);
    await expect(north).toContainText("Mortgage estimated from transactions");

    const south = row(page, SEED.properties.south);
    await expect(south).toContainText(SEED.south.breakEven);
    await expect(south.getByRole("link", { name: "Add purchase price" })).toBeVisible();
    await expect(south.getByRole("link", { name: "Add mortgage" })).toBeVisible();

    await expect(page.getByTestId("rental-roi-unassigned")).toContainText(SEED.unassigned);
  });

  test("changing the target return refetches and records it in the URL", async ({ page }) => {
    await openRentalRoi(page);
    const north = row(page, SEED.properties.north);
    await expect(north).toContainText(SEED.north.target8);

    const input = page.getByLabel("Target cash-on-cash return (%)");
    await input.fill("12");

    await expect(page).toHaveURL(/[?&]target=12(&|$)/);
    await expect(north).toContainText(SEED.north.target12);
    // Break-even doesn't depend on the target.
    await expect(north).toContainText(SEED.north.breakEven);

    await page.reload();
    await expect(input).toHaveValue("12");
    await expect(north).toContainText(SEED.north.target12);
  });

  test("Add purchase price opens that property's edit card", async ({ page }) => {
    await openRentalRoi(page);
    await row(page, SEED.properties.south).getByRole("link", { name: "Add purchase price" }).click();

    await expect(page).toHaveURL(/\/properties\?edit=[0-9a-f-]{36}$/);
    await expect(page.getByLabel("Purchase price")).toBeVisible();
  });

  test("on a phone each property is a card", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRentalRoi(page);

    await expect(page.getByTestId("rental-roi-total-card")).toBeVisible();
    await expect(page.getByTestId("rental-roi-card")).toHaveCount(2);
    await expect(page.getByRole("table", { name: "Monthly numbers by property" })).toBeHidden();
  });

  test("the skeleton has the loaded table's shape", async ({ page }) => {
    const release = await holdRequests(page, (url) => url.pathname.endsWith(ROI_PATH));
    await page.goto("/analytics");

    await expect(page.getByTestId("rental-roi-skeleton-headline")).toBeVisible();
    await expect(page.getByTestId("rental-roi-skeleton-input")).toBeVisible();
    const columns = await page.getByTestId("rental-roi-skeleton-table").locator("thead th").count();

    release();

    await expect(page.getByTestId("rental-roi-skeleton")).toHaveCount(0);
    const table = page.getByRole("table", { name: "Monthly numbers by property" });
    await expect(table.locator("thead th")).toHaveCount(columns);
    await expect(page.getByTestId("rental-roi-row")).toHaveCount(2);
    await expect(page.getByTestId("rental-roi-total-row")).toBeVisible();
  });
});

test.describe("Analytics — Rental ROI, no properties", () => {
  const empty = seededOrg("rental-roi-empty");

  test("an organization with no rentals is asked to add one", async ({ page }) => {
    await empty().signIn(page);
    await openRentalRoi(page);

    await expect(page.getByText("Add a property to see what it needs to earn each month.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Add a property" })).toHaveAttribute("href", "/properties");
  });
});
