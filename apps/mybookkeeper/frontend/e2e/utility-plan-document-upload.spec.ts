/**
 * No-backend E2E for getting a document into the "Add utility plan" dialog.
 *
 * Runs at iPhone width under playwright.layout.config.ts, because the phone is
 * where this broke: the card offered a dropdown of the document library and no
 * way to add anything to it, so an operator holding a photo of their Electricity
 * Facts Label was told to go and upload it on another page first. On a fresh
 * library the dropdown had a single empty entry, which is what got reported.
 *
 * Fully mocked via page.route(): what is being pinned is this dialog's
 * behaviour, not the extractor's reading of any particular file.
 *
 * Verifies:
 *   - A file picked on the device is read without leaving the dialog
 *   - Picking is the whole interaction — the fields fill with nothing else pressed
 *   - An empty library shows no picker rather than an empty one
 *   - The read prefills the form the operator then saves
 *   - The upload posts to the reference-only route, not /documents/upload
 *   - A library document is still readable when there is one
 *   - No horizontal overflow, and the controls stay tappable at 390px
 */
import { test, expect, type Page } from "@playwright/test";

const ORG_ID = "00000000-0000-0000-0000-000000000010";
const PROPERTY_ID = "00000000-0000-0000-0000-0000000000c1";
const DOCUMENT_ID = "00000000-0000-0000-0000-0000000000d1";

const IPHONE = { width: 390, height: 844 };
const MIN_TOUCH_TARGET = 44;

const EFL_FILE = {
  name: "rhythm-efl.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 electricity facts label"),
};

/** Every key, as the endpoint serializes it — the form reads optional ones too. */
const DRAFT = {
  source_document_id: DOCUMENT_ID,
  service_type: "electricity",
  provider_name: "Rhythm",
  plan_name: "Digital Discount 12",
  account_number: null,
  rate_type: "fixed",
  energy_charge_cents_per_kwh: "10.5000",
  tdu_charge_cents_per_kwh: null,
  avg_price_cents_per_kwh_at_1000: "10.5000",
  monthly_base_charge_cents: 0,
  term_months: 12,
  service_start_date: null,
  term_end_date: "2027-08-11",
  early_termination_fee_cents: 15000,
  has_bill_credit: false,
  bill_credit_amount_cents: null,
  bill_credit_threshold_kwh: null,
  min_usage_fee_cents: null,
  min_usage_threshold_kwh: null,
  post_promo_monthly_cents: null,
  equipment_fee_monthly_cents: null,
  download_mbps: null,
  upload_mbps: null,
  data_cap_gb: null,
  notes: null,
  confidence: "high",
  warnings: [],
  unrepresented: [],
};

function json(body: unknown) {
  return { status: 200, contentType: "application/json", body: JSON.stringify(body) };
}

function plantAuth(page: Page): Promise<void> {
  return page.addInitScript(
    ([orgId]) => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
      window.localStorage.setItem("token", `${header}.${payload}.fake-signature`);
      window.localStorage.setItem("v1_activeOrgId", orgId);
    },
    [ORG_ID],
  );
}

async function stubShell(page: Page): Promise<void> {
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
    route.fulfill(json([{ id: ORG_ID, name: "Test Workspace", role: "owner" }])),
  );
  await page.route("**/api/version", (route) => route.fulfill(json({ version: "test" })));
  await page.route("**/api/tax-profile", (route) =>
    route.fulfill(
      json({
        onboarding_completed: true,
        tax_situations: [],
        filing_status: null,
        dependents_count: 0,
      }),
    ),
  );
  await page.route("**/api/properties", (route) =>
    route.fulfill(json([{ id: PROPERTY_ID, name: "6734 Peerless St" }])),
  );
}

async function stubUtilityPage(page: Page): Promise<void> {
  await page.route("**/api/utility-plans/renewal-alerts*", (route) =>
    route.fulfill(json({ expiring_count: 0, expired_count: 0, plans: [] })),
  );
  await page.route("**/api/utility-plans/rate-comparison*", (route) =>
    route.fulfill(json({ rows: [], benchmarks: [] })),
  );
  await page.route("**/api/market-rate-benchmarks*", (route) => route.fulfill(json([])));
  await page.route("**/api/utility-plans?*", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
  await page.route("**/api/utility-plans", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
}

/** ``documents`` is what the library picker reads; empty is the reported case. */
async function stubDocuments(page: Page, documents: unknown[]): Promise<void> {
  await page.route("**/api/documents?*", (route) => route.fulfill(json(documents)));
  await page.route("**/api/documents", (route) => route.fulfill(json(documents)));
}

async function openDialog(page: Page): Promise<void> {
  await page.goto("/utility-plans");
  const add = page.getByTestId("add-utility-plan-button");
  await expect(add).toBeVisible({ timeout: 15000 });
  await add.click();
  await expect(page.getByTestId("add-utility-plan-dialog")).toBeVisible();
}

function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.use({ viewport: IPHONE });

test.beforeEach(async ({ page }) => {
  await plantAuth(page);
  await stubShell(page);
  await stubUtilityPage(page);
});

test.describe("Adding a utility plan from a document on the phone", () => {
  test("a file on the device is read without leaving the dialog", async ({ page }) => {
    await stubDocuments(page, []);

    let uploadedTo = "";
    await page.route("**/api/utility-plans/extract-upload", (route) => {
      uploadedTo = route.request().url();
      return route.fulfill(json(DRAFT));
    });
    // If the dialog ever routes through the ordinary upload endpoint again, the
    // transaction extractor picks the file up and invents an expense. Failing
    // the request is how that regression surfaces here rather than in the books.
    await page.route("**/api/documents/upload", (route) =>
      route.fulfill({ status: 500, body: "the plan reader must not use this route" }),
    );

    await openDialog(page);

    await page
      .getByTestId("utility-plan-file-input")
      .setInputFiles(EFL_FILE);

    await expect(page.getByTestId("utility-plan-chosen-document")).toContainText(
      "rhythm-efl.pdf",
    );
    // Picking is the whole interaction — nothing else to press.
    await expect(
      page.getByTestId("utility-plan-read-document-button"),
    ).toHaveCount(0);

    // The read is only worth anything if it lands in the form the operator saves.
    await expect(page.getByTestId("utility-plan-provider-input")).toHaveValue("Rhythm");
    await expect(page.getByTestId("utility-plan-term-months-input")).toHaveValue("12");
    expect(uploadedTo).toContain("/utility-plans/extract-upload");
  });

  test("an empty library offers no picker instead of an empty dropdown", async ({
    page,
  }) => {
    await stubDocuments(page, []);
    await openDialog(page);

    await expect(page.getByTestId("utility-plan-file-dropzone")).toBeVisible();
    await expect(page.getByTestId("utility-plan-library-picker")).toHaveCount(0);
  });

  test("a document already uploaded is still readable", async ({ page }) => {
    await stubDocuments(page, [
      { id: DOCUMENT_ID, file_name: "constellation-efl.pdf", status: "completed" },
    ]);
    await page.route("**/api/utility-plans/extract", (route) =>
      route.fulfill(json(DRAFT)),
    );

    await openDialog(page);

    await page.getByTestId("utility-plan-library-picker").click();
    await page
      .getByTestId("utility-plan-document-select")
      .selectOption(DOCUMENT_ID);

    await expect(page.getByTestId("utility-plan-provider-input")).toHaveValue("Rhythm");
  });

  test("the dialog fits the phone and keeps its controls tappable", async ({ page }) => {
    await stubDocuments(page, [
      { id: DOCUMENT_ID, file_name: "constellation-efl.pdf", status: "completed" },
    ]);
    await openDialog(page);

    expect(await hasHorizontalOverflow(page), "horizontal overflow at 390px").toBe(
      false,
    );

    for (const testId of [
      "utility-plan-choose-file-button",
      "utility-plan-property-select",
    ]) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box, `${testId} has no box`).not.toBeNull();
      expect(box!.height, `${testId} height`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });
});
