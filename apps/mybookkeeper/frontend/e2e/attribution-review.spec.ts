import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { holdRequests } from "./fixtures/hold-requests";
import { createProperty, deleteProperty } from "./fixtures/seed-data";
import { toastRegion } from "@platform/ui/test-support/toast";
import { deleteApplicant } from "./fixtures/applicants";

/**
 * E2E for the attribution review queue — PR D (Airbnb-payout review UX).
 *
 * Flows under test:
 * 1. Real flow: seed a property + an Airbnb-payout review row → /payment-review
 *    → pick the property → Assign → success toast → row leaves the queue →
 *    assert transactions.property_id is set in the DB → cleanup.
 * 2. A rent-unmatched row and an Airbnb-unmatched row in the same queue render
 *    their own (non-swapped) shapes.
 * 3. The loading skeleton mirrors the two-column loaded row structure.
 */

interface SeedAttributionReviewPayload {
  channel?: string | null;
  amount?: string;
  transaction_date?: string;
  description?: string;
  confidence?: "fuzzy" | "unmatched";
  proposed_property_id?: string;
}

interface SeedAttributionReviewResponse {
  id: string;
  transaction_id: string;
}

async function seedAttributionReview(
  api: APIRequestContext,
  payload: SeedAttributionReviewPayload,
): Promise<SeedAttributionReviewResponse> {
  const res = await api.post("/test/seed-attribution-review", { data: payload });
  expect(res.ok(), `seed-attribution-review: ${res.status()} ${await res.text()}`).toBe(true);
  return res.json() as Promise<SeedAttributionReviewResponse>;
}

async function deleteAttributionReview(
  api: APIRequestContext,
  reviewId: string,
): Promise<void> {
  const res = await api.delete(`/test/attribution-review/${reviewId}`);
  if (!res.ok()) throw new Error(`deleteAttributionReview failed: ${res.status()} ${await res.text()}`);
}

async function seedApplicant(
  api: APIRequestContext,
  legalName: string,
): Promise<string> {
  const res = await api.post("/test/seed-applicant", {
    data: { legal_name: legalName, stage: "lease_signed" },
  });
  expect(res.ok(), `seed-applicant: ${res.status()} ${await res.text()}`).toBe(true);
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function getTransaction(
  api: APIRequestContext,
  id: string,
): Promise<{ property_id: string | null }> {
  const res = await api.get(`/transactions/${id}`);
  expect(res.ok(), `GET /transactions/${id}: ${res.status()}`).toBe(true);
  return res.json() as Promise<{ property_id: string | null }>;
}

test.describe("Attribution review — Airbnb payout UX (PR D)", () => {
  test("assign an Airbnb payout to a property → txn.property_id set in DB", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const desc = `E2E Airbnb payout ${runId}`;
    const property = await createProperty(api, { name: `E2E Attr Prop ${runId}` });
    let seeded: SeedAttributionReviewResponse | undefined;

    try {
      seeded = await seedAttributionReview(api, {
        channel: "airbnb",
        confidence: "unmatched",
        amount: "920.00",
        description: desc,
      });
      await page.goto("/payment-review");
      await page.waitForLoadState("networkidle");

      const row = page.getByTestId("attribution-review-item").filter({ hasText: desc });
      await expect(row).toBeVisible({ timeout: 5000 });
      await expect(row.getByText("Airbnb payout", { exact: true })).toBeVisible();

      const select = row.getByRole("combobox", { name: /pick a property/i });
      await expect(select).toBeVisible({ timeout: 3000 });
      await select.selectOption({ label: `E2E Attr Prop ${runId}` });

      const assignBtn = row.getByRole("button", { name: /^Assign$/ });
      await expect(assignBtn).toBeEnabled();
      await assignBtn.click();

      // Conversational success toast from handleConfirmProperty.
      await expect(toastRegion(page).getByText(/book this payout/i)).toBeVisible({
        timeout: 8000,
      });

      // The resolved row drops out of the pending queue (tag invalidated).
      await expect(row).toBeHidden({ timeout: 5000 });

      // The transaction now carries the chosen property in the DB.
      const txn = await getTransaction(api, seeded.transaction_id);
      expect(txn.property_id).toBe(property.id);
    } finally {
      // Delete the review row + its transaction first (FK to property),
      // then the property.
      if (seeded) await deleteAttributionReview(api, seeded.id);
      await deleteProperty(api, property.id);
    }
  });

  test("rent-unmatched and Airbnb-unmatched rows render their own (non-swapped) shapes", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const rentDesc = `E2E rent unmatched ${runId}`;
    const bnbDesc = `E2E airbnb unmatched ${runId}`;

    // Airbnb-unmatched needs ≥1 property for the picker to render; rent-unmatched
    // needs a lease_signed applicant for the tenant picker to render.
    const property = await createProperty(api, { name: `E2E Mixed Prop ${runId}` });
    let applicantId: string | undefined;
    let rentSeed: SeedAttributionReviewResponse | undefined;
    let bnbSeed: SeedAttributionReviewResponse | undefined;

    try {
      applicantId = await seedApplicant(api, `E2E Mixed Tenant ${runId}`);
      rentSeed = await seedAttributionReview(api, {
        channel: null,
        confidence: "unmatched",
        amount: "1500.00",
        description: rentDesc,
      });
      bnbSeed = await seedAttributionReview(api, {
        channel: "airbnb",
        confidence: "unmatched",
        amount: "920.00",
        description: bnbDesc,
      });
      await page.goto("/payment-review");
      await page.waitForLoadState("networkidle");

      const rentRow = page.getByTestId("attribution-review-item").filter({ hasText: rentDesc });
      const bnbRow = page.getByTestId("attribution-review-item").filter({ hasText: bnbDesc });
      await expect(rentRow).toBeVisible({ timeout: 5000 });
      await expect(bnbRow).toBeVisible({ timeout: 5000 });

      // Rent row: tenant-shaped — tenant picker, no channel badge, no property picker.
      await expect(
        rentRow.getByText("Couldn't match this to any of your tenants."),
      ).toBeVisible();
      await expect(
        rentRow.getByRole("combobox", { name: /pick a tenant/i }),
      ).toBeVisible();
      await expect(rentRow.getByText("Airbnb payout", { exact: true })).toHaveCount(0);
      await expect(
        rentRow.getByRole("combobox", { name: /pick a property/i }),
      ).toHaveCount(0);

      // Airbnb row: property-shaped — channel badge + property picker, no tenant picker.
      await expect(bnbRow.getByText("Airbnb payout", { exact: true })).toBeVisible();
      await expect(
        bnbRow.getByText("Couldn't figure out which property this payout belongs to."),
      ).toBeVisible();
      await expect(
        bnbRow.getByRole("combobox", { name: /pick a property/i }),
      ).toBeVisible();
      await expect(
        bnbRow.getByRole("combobox", { name: /pick a tenant/i }),
      ).toHaveCount(0);
    } finally {
      if (rentSeed) await deleteAttributionReview(api, rentSeed.id);
      if (bnbSeed) await deleteAttributionReview(api, bnbSeed.id);
      if (applicantId) await deleteApplicant(api, applicantId);
      await deleteProperty(api, property.id);
    }
  });

  test("loading skeleton mirrors the two-column loaded row structure", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const desc = `E2E skeleton airbnb ${runId}`;
    const property = await createProperty(api, { name: `E2E Skel Prop ${runId}` });    let seeded: SeedAttributionReviewResponse | undefined;

    // Delay the queue response so the skeleton is observable.
    const release = await holdRequests(page, (url) => url.pathname === "/api/transactions/attribution-review-queue");

    try {
      seeded = await seedAttributionReview(api, {
        channel: "airbnb",
        confidence: "unmatched",
        amount: "920.00",
        description: desc,
      });
      await page.goto("/payment-review");

      // Skeleton: a 3-row placeholder list, each with the same two columns
      // (details + actions) as a loaded row.
      const skeletonRows = page.getByTestId("attribution-review-skeleton-row");
      await expect(skeletonRows).toHaveCount(3);
      await expect(skeletonRows.first().getByTestId("attribution-review-skeleton-main")).toBeVisible();
      await expect(skeletonRows.first().getByTestId("attribution-review-skeleton-actions")).toBeVisible();
      await expect(skeletonRows.first().locator(".animate-pulse").first()).toBeVisible();
      const skeletonDirection = await skeletonRows
        .first()
        .evaluate((el) => getComputedStyle(el).flexDirection);

      // Once the queue answers, the skeleton is replaced by real rows with
      // the same two columns.
      release();
      await expect(skeletonRows).toHaveCount(0, { timeout: 8000 });
      const row = page.getByTestId("attribution-review-item").filter({ hasText: desc });
      await expect(row).toBeVisible({ timeout: 5000 });
      await expect(row.getByTestId("attribution-review-item-main")).toBeVisible();
      await expect(row.getByTestId("attribution-review-item-actions")).toBeVisible();
      expect(await row.evaluate((el) => getComputedStyle(el).flexDirection)).toBe(skeletonDirection);
    } finally {
      if (seeded) await deleteAttributionReview(api, seeded.id);
      await deleteProperty(api, property.id);
    }
  });
});
