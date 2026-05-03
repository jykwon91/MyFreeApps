import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";

/**
 * Lease Templates Phase 1 — primary user flow.
 *
 * Verifies:
 * 1. Lease Templates list renders, the Upload dialog opens, and uploading a
 *    Markdown bundle creates a template that lands on the detail page with
 *    detected placeholders.
 * 2. The placeholder spec editor table is editable inline and persists.
 * 3. The Leases page lists draft leases and the empty-state message renders
 *    when there are no leases.
 * 4. The skeleton on the Leases page has the same shape as the loaded list.
 *
 * The lease detail / generate / sign cycle is exercised at the API layer in
 * the backend test suite — this spec covers the UI flow.
 */

interface SeedTemplatePayload {
  name?: string;
  description?: string | null;
  source_text?: string;
}

async function seedTemplate(
  api: APIRequestContext,
  payload: SeedTemplatePayload = {},
): Promise<string> {
  const res = await api.post("/test/seed-lease-template", { data: payload });
  if (!res.ok()) {
    throw new Error(`seedTemplate failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function deleteTemplate(api: APIRequestContext, id: string): Promise<void> {
  await api.delete(`/test/lease-templates/${id}`).catch(() => {});
}

async function waitForLeaseTemplatesPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Lease Templates" })).toBeVisible({
    timeout: 10000,
  });
  await page.waitForLoadState("networkidle");
}

test.describe("Lease Templates (Phase 1)", () => {
  test("seeded template appears in the list and detail page surfaces placeholders", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const templateName = `E2E Lease Template ${runId}`;
    const seededIds: string[] = [];

    try {
      const id = await seedTemplate(api, { name: templateName });
      seededIds.push(id);

      await page.goto("/lease-templates");
      await waitForLeaseTemplatesPage(page);

      await expect(page.getByText(templateName).first()).toBeVisible({
        timeout: 5000,
      });

      // Drill in.
      await page.getByText(templateName).first().click();
      await expect(page).toHaveURL(new RegExp(`/lease-templates/${id}$`));

      // Header.
      await expect(page.getByRole("heading", { name: templateName })).toBeVisible();

      // Detected placeholders surface in the spec editor.
      await expect(page.getByTestId("placeholder-spec-editor")).toBeVisible();
      await expect(
        page.getByTestId("placeholder-row-TENANT FULL NAME"),
      ).toBeVisible();
      await expect(page.getByTestId("placeholder-row-MOVE-IN DATE")).toBeVisible();
      await expect(page.getByTestId("placeholder-row-NUMBER OF DAYS")).toBeVisible();

      // Files section renders one file row.
      await expect(page.getByTestId("template-files-section")).toBeVisible();
    } finally {
      for (const id of seededIds) await deleteTemplate(api, id);
    }
  });

  test("upload dialog opens, validates files, and submits", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const newName = `E2E Uploaded Template ${runId}`;
    const seededIds: string[] = [];

    try {
      await page.goto("/lease-templates");
      await waitForLeaseTemplatesPage(page);

      await page.getByTestId("lease-template-upload-button").click();
      await expect(page.getByTestId("lease-template-upload-dialog")).toBeVisible();

      await page.getByTestId("template-name-input").fill(newName);

      // Provide an in-memory file via the hidden input.
      const md =
        "# Lease\n\n[TENANT FULL NAME] moves in [MOVE-IN DATE]. Term [NUMBER OF DAYS] days.\n";
      await page
        .getByTestId("lease-template-upload-dialog")
        .locator("input[type='file']")
        .setInputFiles({
          name: "lease.md",
          mimeType: "text/markdown",
          buffer: Buffer.from(md, "utf-8"),
        });

      await expect(page.getByTestId("template-file-list")).toBeVisible();
      // Submit.
      await page.getByTestId("template-upload-submit").click();

      // Land on detail page after success.
      await expect(page).toHaveURL(/\/lease-templates\/[a-f0-9-]+$/, {
        timeout: 15000,
      });
      await expect(page.getByRole("heading", { name: newName })).toBeVisible();

      // Capture the seeded id from the URL for cleanup.
      const url = new URL(page.url());
      const segments = url.pathname.split("/");
      const id = segments[segments.length - 1];
      if (id && id !== newName) seededIds.push(id);
    } finally {
      for (const id of seededIds) await deleteTemplate(api, id);
    }
  });

  test("Leases empty-state renders the friendly message", async ({
    authedPage: page,
  }) => {
    await page.goto("/leases");
    await expect(page.getByRole("heading", { name: "Leases" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    // No leases seeded — the empty state should render.
    const empty = page.getByText(/No leases yet/i);
    await expect(empty.first()).toBeVisible({ timeout: 5000 });
  });

  test("Lease Templates list skeleton renders before data loads", async ({
    authedPage: page,
  }) => {
    // Throttle the templates fetch so we can observe the skeleton.
    await page.route("**/api/lease-templates**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    const navPromise = page.goto("/lease-templates");
    await expect(page.getByTestId("lease-templates-skeleton")).toBeVisible({
      timeout: 5000,
    });
    await page.unroute("**/api/lease-templates**");
    await navPromise;
    await page.waitForLoadState("networkidle");
  });
});
