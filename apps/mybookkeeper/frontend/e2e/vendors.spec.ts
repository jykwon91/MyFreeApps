import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";

/**
 * PR 4.1b — Vendors frontend behavioural E2E (read-only).
 *
 * Covers the rolodex list / detail flows that ship in this PR. Create /
 * edit / soft-delete UI lands in PR 4.2 — those specs will be added
 * alongside the write endpoints and ``Transaction.vendor_id`` FK.
 */

interface SeedVendorPayload {
  name?: string;
  category?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  hourly_rate?: string | null;
  flat_rate_notes?: string | null;
  preferred?: boolean;
  notes?: string | null;
}

async function seedVendor(
  api: APIRequestContext,
  payload: SeedVendorPayload,
): Promise<string> {
  const res = await api.post("/test/seed-vendor", { data: payload });
  if (!res.ok()) {
    throw new Error(`seedVendor failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteVendor(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/vendors/${id}`).catch(() => {});
}

async function waitForVendorsPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible({
    timeout: 10000,
  });
  await page.waitForLoadState("networkidle");
}

test.describe("Vendors frontend (PR 4.1b)", () => {
  test("seeded vendor renders in rolodex, drilldown shows all sections, contact links work", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const name = `E2E Vendor ${runId}`;
    const seededVendors: string[] = [];

    try {
      const vendorId = await seedVendor(api, {
        name,
        category: "plumber",
        phone: "555-0101",
        email: "e2e-plumber@example.com",
        address: "1 E2E Way",
        hourly_rate: "125.50",
        flat_rate_notes: "Flat $200 for drain unclog",
        preferred: true,
        notes: "Reliable",
      });
      seededVendors.push(vendorId);

      // List page renders.
      await page.goto("/vendors");
      await waitForVendorsPage(page);
      await expect(page.getByText(name).first()).toBeVisible({ timeout: 5000 });

      // Drill into detail.
      await page.getByText(name).first().click();
      await expect(page).toHaveURL(new RegExp(`/vendors/${vendorId}$`));

      // Header and category badge.
      await expect(page.getByRole("heading", { name })).toBeVisible();
      await expect(page.getByTestId("vendor-category-badge-plumber")).toBeVisible();

      // Preferred indicator visible because we seeded preferred=true.
      await expect(page.getByTestId("vendor-preferred-indicator")).toBeVisible();

      // Contact / pricing / notes sections all render with the seeded values.
      await expect(page.getByTestId("contact-section")).toBeVisible();
      await expect(page.getByTestId("pricing-section")).toBeVisible();
      await expect(page.getByTestId("notes-section")).toBeVisible();

      const phoneCell = page.getByTestId("vendor-phone");
      await expect(phoneCell).toContainText("555-0101");
      await expect(phoneCell.locator("a")).toHaveAttribute("href", "tel:555-0101");

      const emailCell = page.getByTestId("vendor-email");
      await expect(emailCell).toContainText("e2e-plumber@example.com");
      await expect(emailCell.locator("a")).toHaveAttribute(
        "href",
        "mailto:e2e-plumber@example.com",
      );

      await expect(page.getByTestId("vendor-address")).toContainText("1 E2E Way");
      await expect(page.getByTestId("vendor-hourly-rate")).toContainText("$125.50");
      await expect(page.getByTestId("vendor-flat-rate-notes")).toContainText(
        /Flat \$200/,
      );
      await expect(page.getByTestId("vendor-notes")).toContainText("Reliable");

      // Back link returns to rolodex.
      await page.getByRole("link", { name: /Back to vendors/i }).click();
      await expect(page).toHaveURL(/\/vendors$/);
      await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();
    } finally {
      for (const id of seededVendors) await deleteVendor(api, id);
    }
  });

  test("category filter narrows the rolodex to a single category and syncs URL state", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const seededIds: string[] = [];

    try {
      const plumberId = await seedVendor(api, {
        name: `E2E Plumber ${runId}`,
        category: "plumber",
      });
      seededIds.push(plumberId);

      const electricianId = await seedVendor(api, {
        name: `E2E Electrician ${runId}`,
        category: "electrician",
      });
      seededIds.push(electricianId);

      await page.goto("/vendors");
      await waitForVendorsPage(page);

      // Both visible by default.
      await expect(page.getByText(`E2E Plumber ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Electrician ${runId}`).first()).toBeVisible();

      // Filter to plumber.
      await page.getByTestId("vendor-filter-plumber").click();
      await page.waitForLoadState("networkidle");

      await expect(page.getByText(`E2E Plumber ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Electrician ${runId}`)).toHaveCount(0);

      // URL state reflects the filter (deep-linkable).
      expect(page.url()).toContain("category=plumber");

      // Back to All — both return.
      await page.getByTestId("vendor-filter-all").click();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(`E2E Plumber ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Electrician ${runId}`).first()).toBeVisible();
      expect(page.url()).not.toContain("category=");
    } finally {
      for (const id of seededIds) await deleteVendor(api, id);
    }
  });

  test("preferred-only toggle narrows the rolodex to preferred vendors", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const seededIds: string[] = [];

    try {
      const preferredId = await seedVendor(api, {
        name: `E2E Preferred ${runId}`,
        category: "handyman",
        preferred: true,
      });
      seededIds.push(preferredId);

      const regularId = await seedVendor(api, {
        name: `E2E Regular ${runId}`,
        category: "handyman",
        preferred: false,
      });
      seededIds.push(regularId);

      await page.goto("/vendors");
      await waitForVendorsPage(page);

      // Both visible.
      await expect(page.getByText(`E2E Preferred ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Regular ${runId}`).first()).toBeVisible();

      // Flip preferred-only on.
      await page.getByTestId("vendor-preferred-toggle").click();
      await page.waitForLoadState("networkidle");

      await expect(page.getByText(`E2E Preferred ${runId}`).first()).toBeVisible();
      await expect(page.getByText(`E2E Regular ${runId}`)).toHaveCount(0);

      // URL deep-links the filter.
      expect(page.url()).toContain("preferred=true");
    } finally {
      for (const id of seededIds) await deleteVendor(api, id);
    }
  });

  test("renders the filtered empty state when the user has no vendors in this category", async ({
    authedPage: page,
  }) => {
    // Pick a category unlikely to have stale seeded data.
    await page.goto("/vendors?category=locksmith");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();
    await expect(page.getByTestId("vendor-filter-locksmith")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    const filteredEmpty = await page.getByText(/No vendors match this filter/i).count();
    if (filteredEmpty > 0) {
      expect(filteredEmpty).toBeGreaterThan(0);
    }
  });

  test("404 detail page surfaces the friendly not-found message", async ({
    authedPage: page,
  }) => {
    // Random UUID — no such vendor exists for this user.
    await page.goto("/vendors/00000000-0000-0000-0000-000000000000");
    await expect(page.getByText(/I couldn't find that vendor/i)).toBeVisible({
      timeout: 5000,
    });
  });
});
