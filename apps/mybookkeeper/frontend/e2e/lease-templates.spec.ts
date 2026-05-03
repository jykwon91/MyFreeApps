import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";

/**
 * Lease Templates Phase 1 — primary user flows.
 *
 * Each test creates its own data (via the test-only seed endpoint or via
 * the production multipart upload), performs an action, verifies the
 * outcome in both the UI and the API/DB layer, and cleans up.
 *
 * The lease detail / generate / sign cycle is exercised at the API layer
 * in the backend test suite — this spec covers the host's UI flow.
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

async function fetchTemplate(api: APIRequestContext, id: string) {
  const res = await api.get(`/lease-templates/${id}`);
  if (!res.ok()) {
    throw new Error(`fetchTemplate failed: ${res.status()} ${await res.text()}`);
  }
  return res.json();
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

      // Verify the API layer agrees with what the UI rendered.
      const fetched = await fetchTemplate(api, id);
      expect(fetched.placeholders.length).toBeGreaterThanOrEqual(5);
    } finally {
      for (const id of seededIds) await deleteTemplate(api, id);
    }
  });

  test("upload dialog creates a real template via multipart and persists in the DB", async ({
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
      await page.getByTestId("template-upload-submit").click();

      // Land on detail page after success.
      await expect(page).toHaveURL(/\/lease-templates\/[a-f0-9-]+$/, {
        timeout: 15000,
      });
      await expect(page.getByRole("heading", { name: newName })).toBeVisible();

      // Capture the seeded id from the URL for cleanup.
      const url = new URL(page.url());
      const id = url.pathname.split("/").pop() ?? "";
      if (id && id !== newName) seededIds.push(id);

      // Verify that the placeholders were extracted server-side.
      await expect(
        page.getByTestId("placeholder-row-TENANT FULL NAME"),
      ).toBeVisible();
      await expect(page.getByTestId("placeholder-row-MOVE-IN DATE")).toBeVisible();
      await expect(page.getByTestId("placeholder-row-NUMBER OF DAYS")).toBeVisible();

      // Verify the API layer agrees.
      const fetched = await fetchTemplate(api, id);
      expect(fetched.name).toBe(newName);
      const keys = (fetched.placeholders as Array<{ key: string }>).map(
        (p) => p.key,
      );
      expect(keys).toEqual(
        expect.arrayContaining([
          "TENANT FULL NAME",
          "MOVE-IN DATE",
          "NUMBER OF DAYS",
        ]),
      );
    } finally {
      for (const id of seededIds) await deleteTemplate(api, id);
    }
  });

  test("editing a placeholder's display_label persists in the DB", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const templateName = `E2E Editable Template ${runId}`;
    const seededIds: string[] = [];
    const newLabel = `Tenant legal name (edited ${runId})`;

    try {
      const id = await seedTemplate(api, { name: templateName });
      seededIds.push(id);

      await page.goto(`/lease-templates/${id}`);
      await expect(page.getByRole("heading", { name: templateName })).toBeVisible();

      const row = page.getByTestId("placeholder-row-TENANT FULL NAME");
      await expect(row).toBeVisible();

      // The first text input in the row is the display_label cell.
      const labelInput = row.locator("input[type='text']").first();
      await labelInput.fill(newLabel);
      await labelInput.blur();

      // Allow the autosave round-trip.
      await page.waitForTimeout(500);

      // Verify in the DB via the API.
      const fetched = await fetchTemplate(api, id);
      const updated = (fetched.placeholders as Array<{
        key: string;
        display_label: string;
      }>).find((p) => p.key === "TENANT FULL NAME");
      expect(updated?.display_label).toBe(newLabel);
    } finally {
      for (const id of seededIds) await deleteTemplate(api, id);
    }
  });

  test("deleting a template via the UI removes it from the list", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const templateName = `E2E Deletable Template ${runId}`;
    const seededIds: string[] = [];

    try {
      const id = await seedTemplate(api, { name: templateName });
      seededIds.push(id);

      await page.goto(`/lease-templates/${id}`);
      await expect(page.getByRole("heading", { name: templateName })).toBeVisible();

      // Auto-confirm the window.confirm() dialog.
      page.once("dialog", (dialog) => void dialog.accept());
      await page.getByTestId("lease-template-delete").click();

      // Lands back on list page with the template gone.
      await expect(page).toHaveURL(/\/lease-templates$/, { timeout: 10000 });
      await expect(page.getByText(templateName)).toHaveCount(0);

      // Verify the API layer reports the soft-delete (404 on GET).
      const res = await api.get(`/lease-templates/${id}`);
      expect(res.status()).toBe(404);

      // Cleanup endpoint hard-deletes — keep the array so finally block does it.
    } finally {
      for (const id of seededIds) await deleteTemplate(api, id);
    }
  });
});
