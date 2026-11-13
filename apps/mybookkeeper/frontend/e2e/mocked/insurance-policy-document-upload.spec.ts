/**
 * No-backend E2E for getting a declarations page into the "Add insurance
 * policy" dialog.
 *
 * Runs at iPhone width under playwright.layout.config.ts, because the phone is
 * where this matters: a dec page arrives as a carrier email attachment or a
 * photo, and the alternative is retyping nine fields — carrier, policy number,
 * both dates, the dwelling limit, the premium and its period, and two
 * deductibles — off a PDF on a second screen, into figures that then drive an
 * expiration badge and an are-you-overpaying comparison.
 *
 * Fully mocked via page.route(): what is being pinned is this dialog's
 * behaviour, not the extractor's reading of any particular file.
 *
 * Verifies:
 *   - A file picked on the device is read without leaving the dialog
 *   - Picking is the whole interaction — the fields fill with nothing else pressed
 *   - An empty library shows no picker rather than an empty one
 *   - The upload posts to the reference-only route, not /documents/upload
 *   - A library document is still readable when there is one
 *   - Terms with no field of their own are surfaced rather than dropped
 *   - No horizontal overflow, and the controls stay tappable at 390px
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { AttributionReviewQueueResponse } from "@mybookkeeper/api-client/types/attribution/attribution-review-queue-response";

// Registered first, so every stub below wins over it. Any call this spec does
// not stub (the sidebar's integrations and review-queue reads, say) gets an
// empty answer instead of reaching the absent backend.
test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
});

const PROPERTY_ID = "00000000-0000-0000-0000-0000000000c1";
const DOCUMENT_ID = "00000000-0000-0000-0000-0000000000d1";

const IPHONE = { width: 390, height: 844 };

const DEC_PAGE_FILE = {
  name: "peerless-dec-page.pdf",
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4 declarations page"),
};

/** Every key, as the endpoint serializes it — the form reads optional ones too. */
const DRAFT = {
  source_document_id: DOCUMENT_ID,
  policy_name: "Landlord Protection — 6734 Peerless St",
  carrier: "Texas Mutual",
  policy_number: "TXM-4471902",
  effective_date: "2026-03-01",
  expiration_date: "2027-03-01",
  coverage_amount_cents: 40000000,
  premium_cents: 240000,
  premium_frequency: "annual",
  deductible_cents: 250000,
  wind_hail_deductible_pct: "2.00",
  notes: null,
  confidence: "high",
  warnings: [],
  unrepresented: [],
};

async function stubShell(page: Page): Promise<void> {
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/properties", (route) =>
    route.fulfill(json([{ id: PROPERTY_ID, name: "6734 Peerless St" }])),
  );
  // The attribution-review badge reads an object, not the list the catch-all
  // answers with, so it gets its real (empty) shape here.
  await page.route("**/api/transactions/attribution-review-queue*", (route) =>
    route.fulfill(json({ items: [], total: 0, pending_count: 0 } satisfies AttributionReviewQueueResponse)),
  );
}

async function stubInsurancePage(page: Page): Promise<void> {
  // Both spellings: the list request carries no query string, so a `?*`
  // pattern alone silently misses it.
  await page.route("**/api/insurance-policies", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
  await page.route("**/api/insurance-policies?*", (route) =>
    route.fulfill(json({ items: [], total: 0, has_more: false })),
  );
  await page.route("**/api/insurance-benchmarks?*", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
}

/** ``documents`` is what the library picker reads; empty is the phone case. */
async function stubDocuments(page: Page, documents: unknown[]): Promise<void> {
  await page.route("**/api/documents?*", (route) => route.fulfill(json(documents)));
  await page.route("**/api/documents", (route) => route.fulfill(json(documents)));
}

async function openDialog(page: Page): Promise<void> {
  await page.goto("/insurance-policies");
  const add = page.getByTestId("add-insurance-policy-button");
  await expect(add).toBeVisible({ timeout: 15000 });
  await add.click();
  await expect(page.getByTestId("add-insurance-policy-dialog")).toBeVisible();
  // The policy insures a building, so the dialog cannot be saved until one is
  // named. Choosing it up front keeps each test about the reading.
  await page.getByTestId("insurance-policy-property-select").selectOption(PROPERTY_ID);
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
  await stubInsurancePage(page);
});

test.describe("Adding an insurance policy from a document on the phone", () => {
  test("a file on the device is read without leaving the dialog", async ({ page }) => {
    await stubDocuments(page, []);

    let uploadedTo = "";
    await page.route("**/api/insurance-policies/extract-upload", (route) => {
      uploadedTo = route.request().url();
      return route.fulfill(json(DRAFT));
    });
    // If the dialog ever routes through the ordinary upload endpoint again, the
    // transaction extractor picks the file up and books the annual premium
    // printed on it as a payment that never happened. Failing the request is
    // how that regression surfaces here rather than in the books.
    await page.route("**/api/documents/upload", (route) =>
      route.fulfill({ status: 500, body: "the policy reader must not use this route" }),
    );

    await openDialog(page);

    await page.getByTestId("insurance-policy-file-input").setInputFiles(DEC_PAGE_FILE);

    await expect(page.getByTestId("insurance-policy-chosen-document")).toContainText(
      "peerless-dec-page.pdf",
    );
    // Picking is the whole interaction — nothing else to press.
    await expect(page.getByTestId("insurance-policy-read-document-button")).toHaveCount(
      0,
    );

    // The read is only worth anything if it lands in the form the operator saves.
    await expect(page.getByTestId("insurance-carrier-input")).toHaveValue("Texas Mutual");
    await expect(page.getByTestId("insurance-policy-number-input")).toHaveValue(
      "TXM-4471902",
    );
    await expect(page.getByTestId("insurance-premium-input")).toHaveValue("2400");
    await expect(page.getByTestId("insurance-premium-frequency-select")).toHaveValue(
      "annual",
    );
    await expect(page.getByTestId("insurance-expiration-date-input")).toHaveValue(
      "2027-03-01",
    );
    expect(uploadedTo).toContain("/insurance-policies/extract-upload");
  });

  test("an empty library offers no picker instead of an empty dropdown", async ({
    page,
  }) => {
    await stubDocuments(page, []);
    await openDialog(page);

    await expect(page.getByTestId("insurance-policy-file-dropzone")).toBeVisible();
    await expect(page.getByTestId("insurance-policy-library-picker")).toHaveCount(0);
  });

  test("a document already uploaded is still readable", async ({ page }) => {
    await stubDocuments(page, [
      { id: DOCUMENT_ID, file_name: "texas-mutual-dec.pdf", status: "completed" },
    ]);
    await page.route("**/api/insurance-policies/extract", (route) =>
      route.fulfill(json(DRAFT)),
    );

    await openDialog(page);

    await page.getByTestId("insurance-policy-library-picker").click();
    await page.getByTestId("insurance-policy-document-select").selectOption(DOCUMENT_ID);

    await expect(page.getByTestId("insurance-carrier-input")).toHaveValue("Texas Mutual");
  });

  test("coverages the form has no field for are surfaced, not dropped", async ({
    page,
  }) => {
    // A dec page states a dozen limits and this form holds one of them. Read,
    // returned and then silently discarded is the failure worth preventing.
    await stubDocuments(page, []);
    await page.route("**/api/insurance-policies/extract-upload", (route) =>
      route.fulfill(
        json({
          ...DRAFT,
          confidence: "medium",
          warnings: ["I couldn't tell how often the premium is billed."],
          unrepresented: ["personal liability limit $300,000"],
        }),
      ),
    );

    await openDialog(page);
    await page.getByTestId("insurance-policy-file-input").setInputFiles(DEC_PAGE_FILE);

    const notices = page.getByTestId("insurance-policy-draft-notices");
    await expect(notices).toContainText("how often the premium is billed");
    await expect(notices).toContainText("personal liability limit $300,000");
  });

  test("the dialog fits the phone and keeps its controls tappable", async ({ page }) => {
    await stubDocuments(page, [
      { id: DOCUMENT_ID, file_name: "texas-mutual-dec.pdf", status: "completed" },
    ]);
    await openDialog(page);

    expect(await hasHorizontalOverflow(page), "horizontal overflow at 390px").toBe(false);

    for (const testId of [
      "insurance-policy-choose-file-button",
      "insurance-policy-name-input",
    ]) {
      const box = await page.getByTestId(testId).boundingBox();
      expect(box, `${testId} has no box`).not.toBeNull();
      expect(box!.height, `${testId} height`).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    }
  });
});
