import { test, expect, type APIRequestContext } from "./fixtures/auth";
import { createProperty, deleteProperty } from "./fixtures/seed-data";

/**
 * Markdown rendering for listing descriptions.
 *
 * Covers:
 *  1. Public apply page (/apply/:slug) renders markdown correctly.
 *  2. Listing detail page renders markdown correctly.
 *  3. Listing edit form shows a live preview that renders markdown.
 *  4. XSS safety: javascript: links and raw <script> do not create
 *     executable elements on the public apply page.
 *
 * Each test seeds data via real API, then tears it down in `finally`.
 */

interface CreatedListing {
  id: string;
  slug: string;
}

async function createListing(
  api: APIRequestContext,
  payload: {
    property_id: string;
    title: string;
    monthly_rate: string;
    description?: string;
  },
): Promise<CreatedListing> {
  const res = await api.post("/listings", {
    data: {
      room_type: "private_room",
      status: "active",
      private_bath: false,
      parking_assigned: false,
      furnished: false,
      pets_on_premises: false,
      ...payload,
    },
  });
  if (!res.ok()) {
    throw new Error(`createListing failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string; slug: string };
  return { id: body.id, slug: body.slug };
}

async function deleteListing(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/listings/${id}`).catch(() => {});
}

test.describe("Markdown rendering for listing descriptions", () => {
  test("public apply page renders markdown — bold, list, and link produce HTML elements", async ({
    page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, {
      name: `E2E Markdown Property ${runId}`,
    });
    let listing: CreatedListing | null = null;

    try {
      const markdownDescription = [
        "**Bright studio** near the medical center.",
        "",
        "Included amenities:",
        "- High-speed wifi",
        "- In-unit laundry",
        "- Reserved parking",
        "",
        "Questions? [Contact us](https://example.com/contact)",
      ].join("\n");

      listing = await createListing(api, {
        property_id: property.id as string,
        title: `E2E Markdown Listing ${runId}`,
        monthly_rate: "1799.00",
        description: markdownDescription,
      });

      // Navigate to the public apply page (unauthenticated).
      // The apply page does not require auth.
      await page.goto(`/apply/${listing.slug}`);
      await page.waitForLoadState("networkidle");

      // Description should be present
      const header = page.locator("header").first();

      // Bold — rendered as <strong>, NOT literal asterisks
      const bold = header.locator("strong");
      await expect(bold).toBeVisible();
      await expect(bold).toHaveText("Bright studio");

      // No literal ** asterisks visible
      const headerText = await header.textContent();
      expect(headerText).not.toContain("**");

      // Unordered list — rendered as <ul>/<li>
      const list = header.locator("ul");
      await expect(list).toBeVisible();
      const items = header.locator("li");
      await expect(items).toHaveCount(3);

      // Link — rendered as <a> with correct attributes
      const link = header.locator("a");
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute("href", "https://example.com/contact");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await expect(link).toHaveAttribute("target", "_blank");
    } finally {
      if (listing) await deleteListing(api, listing.id);
      await deleteProperty(api, property.id as string);
    }
  });

  test("public apply page — javascript: link is NOT rendered as an executable link", async ({
    page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, {
      name: `E2E XSS Property ${runId}`,
    });
    let listing: CreatedListing | null = null;

    try {
      listing = await createListing(api, {
        property_id: property.id as string,
        title: `E2E XSS Listing ${runId}`,
        monthly_rate: "999.00",
        description: "[click](javascript:alert(1))\n\n<script>window.__xss = true</script>",
      });

      await page.goto(`/apply/${listing.slug}`);
      await page.waitForLoadState("networkidle");

      // No <a> element should have a javascript: href
      const links = page.locator("a[href^='javascript:']");
      await expect(links).toHaveCount(0);

      // No <script> element injected by the markdown content
      const scripts = page.locator("script");
      const scriptCount = await scripts.count();
      // There may be legitimate script tags from the app bundle,
      // but none should have been injected by the description content.
      // We verify the XSS sentinel was NOT set.
      const xssSet = await page.evaluate(() => (window as Window & { __xss?: boolean }).__xss);
      expect(xssSet).toBeUndefined();
    } finally {
      if (listing) await deleteListing(api, listing.id);
      await deleteProperty(api, property.id as string);
    }
  });

  test("listing detail page renders markdown description", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, {
      name: `E2E Detail Markdown Property ${runId}`,
    });
    let listing: CreatedListing | null = null;

    try {
      listing = await createListing(api, {
        property_id: property.id as string,
        title: `E2E Detail Markdown Listing ${runId}`,
        monthly_rate: "1500.00",
        description: "**Bold pricing** available monthly.",
      });

      await page.goto(`/listings/${listing.id}`);
      await page.waitForLoadState("networkidle");

      // Description section is rendered
      const section = page.getByTestId("listing-description-section");
      await expect(section).toBeVisible();

      // Bold text rendered as <strong>
      const strong = section.locator("strong");
      await expect(strong).toBeVisible();
      await expect(strong).toHaveText("Bold pricing");

      // No literal asterisks in the description section
      const sectionText = await section.textContent();
      expect(sectionText).not.toContain("**");
    } finally {
      if (listing) await deleteListing(api, listing.id);
      await deleteProperty(api, property.id as string);
    }
  });

  test("listing edit form shows live markdown preview as the operator types", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const property = await createProperty(api, {
      name: `E2E Preview Property ${runId}`,
    });
    let listing: CreatedListing | null = null;

    try {
      listing = await createListing(api, {
        property_id: property.id as string,
        title: `E2E Preview Listing ${runId}`,
        monthly_rate: "1200.00",
      });

      await page.goto(`/listings/${listing.id}`);
      await page.waitForLoadState("networkidle");

      // Open edit form
      await page.getByTestId("edit-listing-button").click();
      await expect(page.getByRole("heading", { name: /edit listing/i })).toBeVisible();

      // No preview initially (description was null)
      await expect(page.getByTestId("listing-form-description-preview")).not.toBeVisible();

      // Type markdown into description textarea
      const descField = page.getByTestId("listing-form-description");
      await descField.fill("**Premium amenities** included");

      // Preview appears and renders the markdown
      const preview = page.getByTestId("listing-form-description-preview");
      await expect(preview).toBeVisible();

      const strong = preview.locator("strong");
      await expect(strong).toBeVisible();
      await expect(strong).toHaveText("Premium amenities");

      // Literal asterisks should NOT appear in the preview
      const previewText = await preview.textContent();
      expect(previewText).not.toContain("**");
    } finally {
      if (listing) await deleteListing(api, listing.id);
      await deleteProperty(api, property.id as string);
    }
  });
});
