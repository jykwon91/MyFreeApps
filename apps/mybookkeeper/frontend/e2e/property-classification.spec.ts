import { test, expect } from "./fixtures/auth";

const RUN_ID = Date.now();

/** Locate a <select> inside the FormField that has the given label text */
function selectByLabel(container: import("@playwright/test").Locator, label: string) {
  return container.locator(`xpath=.//div[label/span[text()="${label}"]]/select`);
}

/** Map classification values to their tile button labels */
const CLASSIFICATION_TILE_LABELS: Record<string, string> = {
  investment: "Investment Property",
  primary_residence: "Primary Residence",
  second_home: "Second Home",
  unclassified: "Not Sure Yet",
};

async function pickClassification(container: import("@playwright/test").Locator, classification: string) {
  const label = CLASSIFICATION_TILE_LABELS[classification] ?? classification;
  await container.getByRole("button", { name: label }).click();
}

async function createClassifiedProperty(
  page: import("@playwright/test").Page,
  name: string,
  classification: string,
  opts: { type?: string } = {},
) {
  const section = page.locator("section").first();
  await section.locator("input").first().fill(name);
  await page.getByPlaceholder(/6738 Peerless St/i).fill("100 Test Ave");
  await page.getByPlaceholder("Houston").fill("Austin");
  await page.getByPlaceholder("TX").fill("TX");
  await page.getByPlaceholder("77023").fill("78701");

  await pickClassification(section, classification);

  if (classification === "investment" && opts.type) {
    await selectByLabel(section, "Rental type").selectOption(opts.type);
  }

  await page.getByRole("button", { name: /add property/i }).click();
  await expect(page.getByText("Property created", { exact: true }).first()).toBeVisible({ timeout: 10000 });
}

async function cleanupProperty(api: { get: (url: string) => Promise<Response>; delete: (url: string) => Promise<Response> }, name: string) {
  const res = await api.get("/properties");
  const props = await res.json();
  const found = props.find((p: { name: string; id: string }) => p.name === name);
  if (found) await api.delete(`/properties/${found.id}`);
}

test.describe("Property Classification", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/properties");
    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add property/i })).toBeVisible({ timeout: 15000 });
  });

  test("classification tile picker is visible in create form", async ({ authedPage: page }) => {
    const section = page.locator("section").first();
    await expect(section.getByRole("button", { name: "Investment Property" })).toBeVisible();
    await expect(section.getByRole("button", { name: "Primary Residence" })).toBeVisible();
    await expect(section.getByRole("button", { name: "Second Home" })).toBeVisible();
    await expect(section.getByRole("button", { name: "Not Sure Yet" })).toBeVisible();
  });

  test("rental type selector only appears when classification is investment", async ({ authedPage: page }) => {
    const section = page.locator("section").first();

    // Select investment — rental type should appear
    await pickClassification(section, "investment");
    await expect(selectByLabel(section, "Rental type")).toBeVisible();

    // Select primary_residence — rental type should disappear
    await pickClassification(section, "primary_residence");
    await expect(selectByLabel(section, "Rental type")).not.toBeVisible();

    // Select second_home — rental type should stay hidden
    await pickClassification(section, "second_home");
    await expect(selectByLabel(section, "Rental type")).not.toBeVisible();
  });

  test("create investment property shows correct labels in list", async ({ authedPage: page, api }) => {
    const name = `E2E Invest ${RUN_ID}`;
    await createClassifiedProperty(page, name, "investment", { type: "long_term" });

    const card = page.locator("li").filter({ hasText: name });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText(/Investment Property/)).toBeVisible();
    await expect(card.getByText(/Long-Term Rental/)).toBeVisible();

    await cleanupProperty(api, name);
  });

  test("create primary residence shows correct label and no rental type", async ({ authedPage: page, api }) => {
    const name = `E2E Primary ${RUN_ID}`;
    await createClassifiedProperty(page, name, "primary_residence");

    const card = page.locator("li").filter({ hasText: name });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText(/Primary Residence/)).toBeVisible();
    await expect(card.getByText(/Short-Term Rental|Long-Term Rental/)).not.toBeVisible();

    await cleanupProperty(api, name);
  });

  test("unclassified property shows amber warning badge", async ({ authedPage: page, api }) => {
    const name = `E2E Unclass ${RUN_ID}`;
    await createClassifiedProperty(page, name, "unclassified");

    const card = page.locator("li").filter({ hasText: name });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText("Needs Classification").first()).toBeVisible();

    await cleanupProperty(api, name);
  });

  test("unclassified property triggers alert banner", async ({ authedPage: page, api }) => {
    const name = `E2E Alert ${RUN_ID}`;
    await createClassifiedProperty(page, name, "unclassified");

    // The conversational alert should appear
    await expect(page.getByText(/still need to be classified/)).toBeVisible({ timeout: 10000 });

    await cleanupProperty(api, name);
  });

  test("edit property classification from unclassified to investment", async ({ authedPage: page, api }) => {
    const name = `E2E Reclass ${RUN_ID}`;
    await createClassifiedProperty(page, name, "unclassified");

    const card = page.locator("li").filter({ hasText: name });
    await expect(card).toBeVisible({ timeout: 10000 });

    // Click edit
    await card.getByTitle("Edit").click();
    await expect(page.getByRole("button", { name: /save/i })).toBeVisible({ timeout: 5000 });
    const editCard = page.locator("li").filter({ has: page.getByRole("button", { name: /save/i }) });

    // Change classification to investment via tile picker
    await editCard.getByRole("button", { name: "Investment Property" }).click();
    await expect(selectByLabel(editCard, "Rental type")).toBeVisible();
    await selectByLabel(editCard, "Rental type").selectOption("short_term");

    await editCard.getByRole("button", { name: /save/i }).click();

    // Verify the card now shows Investment Property
    await expect(page.locator("li").filter({ hasText: name }).getByText(/Investment Property/)).toBeVisible({ timeout: 10000 });
    await expect(page.locator("li").filter({ hasText: name }).getByText("Needs Classification")).not.toBeVisible();

    await cleanupProperty(api, name);
  });

  test("skeleton renders without errors on page load", async ({ authedPage: page }) => {
    await page.goto("/properties");
    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
  });
});
