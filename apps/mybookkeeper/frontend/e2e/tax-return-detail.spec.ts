import { expect, test, type APIRequestContext } from "@playwright/test";
import { seededOrg } from "./fixtures/seeded-org";
import { createApprovedTransaction, createProperty } from "./fixtures/seed-data";
import { toastRegion } from "@platform/ui/test-support/toast";

const TAX_YEAR = 2025;
const RENT = 1800;
const REPAIRS = 250;

interface ScheduleEInstance {
  property_id: string | null;
  fields: { field_id: string; value: number | string | boolean | null }[];
}

let returnId = "";
let propertyId = "";

async function seed(api: APIRequestContext): Promise<void> {
  const property = await createProperty(api, {
    name: "E2E Duplex",
    type: "long_term",
    classification: "investment",
  });
  propertyId = property.id;
  // Entered by hand: the path that once left Schedule E empty.
  await createApprovedTransaction(api, {
    property_id: property.id,
    transaction_type: "income",
    category: "rental_revenue",
    amount: RENT.toFixed(2),
    transaction_date: `${TAX_YEAR}-03-15`,
    tax_relevant: true,
    vendor: "E2E Tenant",
  });
  await createApprovedTransaction(api, {
    property_id: property.id,
    transaction_type: "expense",
    category: "maintenance",
    amount: REPAIRS.toFixed(2),
    transaction_date: `${TAX_YEAR}-04-10`,
    tax_relevant: true,
    vendor: "E2E Plumber",
  });
  const res = await api.post("/tax-returns", { data: { tax_year: TAX_YEAR } });
  expect(res.status(), await res.text()).toBe(201);
  returnId = ((await res.json()) as { id: string }).id;
}

/** Schedule E line values, keyed by property id; the all-properties total is under "total". */
async function scheduleE(api: APIRequestContext): Promise<Record<string, Record<string, unknown>>> {
  const res = await api.get(`/tax-returns/${returnId}/forms/schedule_e`);
  expect(res.ok(), await res.text()).toBe(true);
  const { instances } = (await res.json()) as { instances: ScheduleEInstance[] };
  return Object.fromEntries(instances.map((i) => [
    i.property_id ?? "total",
    Object.fromEntries(i.fields.map((f) => [f.field_id, f.value])),
  ]));
}

// One return, walked through in order: opened fresh, recomputed, then left.
test.describe.configure({ mode: "serial" });

test.describe("Tax Return Detail", () => {
  const org = seededOrg("tax-return-detail", seed);

  test("a new return opens from the list and waits for a recompute", async ({ page }) => {
    await org().signIn(page);
    await page.goto("/tax-returns");
    const card = page.getByRole("button", { name: new RegExp(`^${TAX_YEAR}`) });
    await expect(card).toContainText("Needs recompute");
    await card.click();

    await expect(page).toHaveURL(`/tax-returns/${returnId}`);
    await expect(page.getByRole("heading", { name: `${TAX_YEAR} Tax Return` })).toBeVisible();
    await expect(page.getByText("Needs recompute")).toBeVisible();
    await expect(page.getByText("No forms yet")).toBeVisible();
    await expect(page.getByText("I don't see any tax documents linked to this return yet.")).toBeVisible();
    await expect(page.getByText("All checks passed")).toBeVisible();
    await expect(page.getByText("I don't have any tax forms to review yet.", { exact: false })).toBeVisible();
  });

  test("recompute puts hand-entered rent and repairs on Schedule E", async ({ page }) => {
    await org().signIn(page);
    // Held until the button has been seen busy, so the check can't race the response.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/tax-returns/${returnId}/recompute`, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`/tax-returns/${returnId}`);

    await page.getByRole("button", { name: "Recompute" }).click();
    await expect(page.getByRole("button", { name: "Recomputing..." })).toBeDisabled();
    release();

    await expect(toastRegion(page).getByText("Recompute complete. I've recalculated everything.")).toBeVisible();
    await expect(page.getByText("Needs recompute")).toHaveCount(0);

    expect(await scheduleE(org().api)).toEqual({
      [propertyId]: { line_3: RENT, line_7: REPAIRS, line_20: REPAIRS, line_21: RENT - REPAIRS },
      total: { line_26: RENT - REPAIRS },
    });

    const card = page.getByRole("button", { name: /^Schedule E/ });
    await expect(card).toContainText("2 instances");
    await card.click();
    await expect(page).toHaveURL(`/tax-returns/${returnId}?form=schedule_e`);
    await expect(page.getByRole("row", { name: /Rents received/ })).toContainText("$1,800.00");
    await expect(page.getByRole("row", { name: /Cleaning and maintenance/ })).toContainText("$250.00");
  });

  test("back returns to the list", async ({ page }) => {
    await org().signIn(page);
    await page.goto(`/tax-returns/${returnId}`);
    await page.getByRole("button", { name: "Back to Tax Returns" }).click();
    await expect(page).toHaveURL("/tax-returns");
    await expect(page.getByRole("button", { name: new RegExp(`^${TAX_YEAR}`) })).not.toContainText("Needs recompute");
  });
});
