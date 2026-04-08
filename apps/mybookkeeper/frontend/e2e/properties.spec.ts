import { test, expect } from "./fixtures/auth";

// Unique suffix per run to avoid collisions
const RUN_ID = Date.now();

function selectByLabel(container: import("@playwright/test").Locator, label: string) {
  return container.locator(`xpath=.//div[label/span[text()="${label}"]]/select`);
}

const CLASSIFICATION_TILE_LABELS: Record<string, string> = {
  investment: "Investment Property",
  primary_residence: "Primary Residence",
  second_home: "Second Home",
  unclassified: "Not Sure Yet",
};

// Helper: fill and submit the add-property form, returns the property name used
async function createPropertyViaUI(
  page: import("@playwright/test").Page,
  name: string,
  opts: { street?: string; city?: string; state?: string; zip?: string; classification?: string; type?: string } = {}
) {
  const section = page.locator("section").first();
  await section.locator("input").first().fill(name);
  await page.getByPlaceholder(/6738 Peerless St/i).fill(opts.street ?? "123 Test Street");
  await page.getByPlaceholder("Houston").fill(opts.city ?? "Austin");
  await page.getByPlaceholder("TX").fill(opts.state ?? "TX");
  await page.getByPlaceholder("77023").fill(opts.zip ?? "78701");
  // Default to investment classification — click the tile button
  const classLabel = CLASSIFICATION_TILE_LABELS[opts.classification ?? "investment"];
  await section.getByRole("button", { name: classLabel }).click();
  if (opts.type) {
    await selectByLabel(section, "Rental type").selectOption(opts.type);
  }
  await page.getByRole("button", { name: /add property/i }).click();
  await expect(page.getByText("Property created", { exact: true }).first()).toBeVisible({ timeout: 10000 });
}

test.describe("Properties CRUD", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/properties");
    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add property/i })).toBeVisible({ timeout: 15000 });
  });

  test("create a property — fills all fields and verifies it appears in the list", async ({ authedPage: page, api }) => {
    const name = `E2E Create ${RUN_ID}`;
    await createPropertyViaUI(page, name);

    // The new property card should appear in the list
    await expect(page.locator("li").filter({ hasText: name })).toBeVisible({ timeout: 10000 });

    // Cleanup via API
    const res = await api.get("/properties");
    const props = await res.json();
    const created = props.find((p: { name: string; id: string }) => p.name === name);
    if (created) await api.delete(`/properties/${created.id}`);
  });

  test("edit a property — changes name and verifies the update persists", async ({ authedPage: page, api }) => {
    const originalName = `E2E Edit Src ${RUN_ID}`;
    const updatedName = `E2E Edit Done ${RUN_ID}`;

    // Create via the UI form
    await createPropertyViaUI(page, originalName);
    await expect(page.locator("li").filter({ hasText: originalName })).toBeVisible({ timeout: 10000 });

    // Find the card and click Edit (pencil icon, title="Edit")
    const card = page.locator("li").filter({ hasText: originalName });
    await card.getByTitle("Edit").click();

    // Wait for edit form to appear
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible({ timeout: 5000 });
    const editCard = page.locator("li").filter({ has: page.getByRole("button", { name: /save/i }) });

    // Edit form appears — change the name
    const nameInput = editCard.locator("input").first();
    await nameInput.clear();
    await nameInput.fill(updatedName);

    await editCard.getByRole("button", { name: /save/i }).click();

    // Updated name should now appear in the list
    await expect(page.locator("li").filter({ hasText: updatedName })).toBeVisible({ timeout: 10000 });
    await expect(page.locator("li").filter({ hasText: originalName })).not.toBeVisible({ timeout: 5000 });

    // Cleanup via API
    const res = await api.get("/properties");
    const props = await res.json();
    const updated = props.find((p: { name: string; id: string }) => p.name === updatedName);
    if (updated) await api.delete(`/properties/${updated.id}`);
  });

  test("delete a property — confirms dialog and verifies it disappears", async ({ authedPage: page, api }) => {
    const name = `E2E Del ${RUN_ID}`;

    // Create via the UI form
    await createPropertyViaUI(page, name);
    await expect(page.locator("li").filter({ hasText: name })).toBeVisible({ timeout: 10000 });

    // Click the trash/remove button (title="Remove")
    const card = page.locator("li").filter({ hasText: name });
    await card.getByTitle("Remove").click();

    // Confirm dialog
    await expect(page.getByText(/are you sure/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^delete$/i }).click();

    // Property should be gone from the list
    await expect(page.locator("li").filter({ hasText: name })).not.toBeVisible({ timeout: 10000 });

    // Verify via API — should be 404
    const res = await api.get("/properties");
    const props = await res.json();
    const still = props.find((p: { name: string }) => p.name === name);
    expect(still).toBeUndefined();
  });

  test("add button is disabled when required fields are empty", async ({ authedPage: page }) => {
    const section = page.locator("section").first();
    const nameInput = section.locator("input").first();
    await nameInput.clear();
    await expect(page.getByRole("button", { name: /add property/i })).toBeDisabled();
  });
});
