import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

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
): Promise<SeedAttributionReviewResponse | null> {
  const res = await api.post("/test/seed-attribution-review", { data: payload });
  if (!res.ok()) {
    // Seed endpoint not wired (ALLOW_TEST_ADMIN_PROMOTION off) — caller skips.
    return null;
  }
  return res.json() as Promise<SeedAttributionReviewResponse>;
}

async function deleteAttributionReview(
  api: APIRequestContext,
  reviewId: string,
): Promise<void> {
  await api.delete(`/test/attribution-review/${reviewId}`).catch(() => {});
}

async function seedApplicant(
  api: APIRequestContext,
  legalName: string,
): Promise<string | null> {
  const res = await api.post("/test/seed-applicant", {
    data: { legal_name: legalName, stage: "lease_signed" },
  });
  if (!res.ok()) return null;
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteApplicant(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/applicants/${id}`).catch(() => {});
}

async function getTransaction(
  api: APIRequestContext,
  id: string,
): Promise<{ property_id: string | null } | null> {
  const res = await api.get(`/transactions/${id}`);
  if (!res.ok()) return null;
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

    const seeded = await seedAttributionReview(api, {
      channel: "airbnb",
      confidence: "unmatched",
      amount: "920.00",
      description: desc,
    });
    test.skip(
      seeded === null,
      "seed-attribution-review endpoint not wired (ALLOW_TEST_ADMIN_PROMOTION off)",
    );

    try {
      await page.goto("/payment-review");
      await page.waitForLoadState("networkidle");

      const row = page.locator("div.bg-card").filter({ hasText: desc });
      await expect(row).toBeVisible({ timeout: 5000 });
      await expect(row.getByText("Airbnb payout")).toBeVisible();

      const select = row.getByRole("combobox", { name: /pick a property/i });
      await expect(select).toBeVisible({ timeout: 3000 });
      await select.selectOption({ label: `E2E Attr Prop ${runId}` });

      const assignBtn = row.getByRole("button", { name: /^Assign$/ });
      await expect(assignBtn).toBeEnabled();
      await assignBtn.click();

      // Conversational success toast from handleConfirmProperty.
      await expect(page.getByText(/book this payout/i)).toBeVisible({
        timeout: 8000,
      });

      // The resolved row drops out of the pending queue (tag invalidated).
      await expect(row).toBeHidden({ timeout: 5000 });

      // The transaction now carries the chosen property in the DB.
      const txn = await getTransaction(api, seeded!.transaction_id);
      expect(txn?.property_id).toBe(property.id);
    } finally {
      // Delete the review row + its transaction first (FK to property),
      // then the property.
      await deleteAttributionReview(api, seeded!.id);
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
    const applicantId = await seedApplicant(api, `E2E Mixed Tenant ${runId}`);

    const rentSeed = await seedAttributionReview(api, {
      channel: null,
      confidence: "unmatched",
      amount: "1500.00",
      description: rentDesc,
    });
    const bnbSeed = await seedAttributionReview(api, {
      channel: "airbnb",
      confidence: "unmatched",
      amount: "920.00",
      description: bnbDesc,
    });
    test.skip(
      rentSeed === null || bnbSeed === null,
      "seed-attribution-review endpoint not wired (ALLOW_TEST_ADMIN_PROMOTION off)",
    );

    try {
      await page.goto("/payment-review");
      await page.waitForLoadState("networkidle");

      const rentRow = page.locator("div.bg-card").filter({ hasText: rentDesc });
      const bnbRow = page.locator("div.bg-card").filter({ hasText: bnbDesc });
      await expect(rentRow).toBeVisible({ timeout: 5000 });
      await expect(bnbRow).toBeVisible({ timeout: 5000 });

      // Rent row: tenant-shaped — tenant picker, no channel badge, no property picker.
      await expect(
        rentRow.getByText("Couldn't match this to any of your tenants."),
      ).toBeVisible();
      await expect(
        rentRow.getByRole("combobox", { name: /pick a tenant/i }),
      ).toBeVisible();
      await expect(rentRow.getByText("Airbnb payout")).toHaveCount(0);
      await expect(
        rentRow.getByRole("combobox", { name: /pick a property/i }),
      ).toHaveCount(0);

      // Airbnb row: property-shaped — channel badge + property picker, no tenant picker.
      await expect(bnbRow.getByText("Airbnb payout")).toBeVisible();
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
      await deleteAttributionReview(api, rentSeed!.id);
      await deleteAttributionReview(api, bnbSeed!.id);
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
    const property = await createProperty(api, { name: `E2E Skel Prop ${runId}` });
    const seeded = await seedAttributionReview(api, {
      channel: "airbnb",
      confidence: "unmatched",
      amount: "920.00",
      description: desc,
    });
    test.skip(
      seeded === null,
      "seed-attribution-review endpoint not wired (ALLOW_TEST_ADMIN_PROMOTION off)",
    );

    // Delay the queue response so the skeleton is observable.
    await page.route("**/attribution-review-queue*", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    try {
      await page.goto("/payment-review");

      // Skeleton: a 3-row placeholder list (border rows that are NOT the
      // real bg-card item), each with the same two-column shape.
      const skeletonRows = page.locator("div.border.rounded-lg:not(.bg-card)");
      await expect(skeletonRows).toHaveCount(3);
      await expect(skeletonRows.first().locator(".flex-1")).toBeVisible();
      await expect(page.locator(".animate-pulse").first()).toBeVisible();

      // After the queue resolves the skeleton is replaced by real rows that
      // share the same two-column structure (left flex-1 + right shrink-0).
      await expect(skeletonRows).toHaveCount(0, { timeout: 8000 });
      const row = page.locator("div.bg-card").filter({ hasText: desc });
      await expect(row).toBeVisible({ timeout: 5000 });
      await expect(row.locator(".flex-1")).toBeVisible();
      await expect(row.locator(".shrink-0")).toBeVisible();
    } finally {
      await page.unroute("**/attribution-review-queue*");
      await deleteAttributionReview(api, seeded!.id);
      await deleteProperty(api, property.id);
    }
  });
});
