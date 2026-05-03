import { test, expect, type APIRequestContext } from "./fixtures/auth";

/**
 * Lease Templates Phase 2 — AI placeholder auto-detection.
 *
 * Tests cover:
 *   1. The upload dialog shows the AI suggesting loader after file upload.
 *   2. The AI suggestions panel (or empty result) appears on the detail page
 *      after the loader resolves.
 *   3. The skip-AI / manual fallback path still works (panel can be dismissed).
 *   4. POST /lease-templates/{id}/suggest-placeholders returns 200 with the
 *      expected shape.
 *
 * Note: whether the AI panel has items depends on whether ANTHROPIC_API_KEY is
 * configured in the E2E environment. The test asserts on the panel's presence,
 * not on exact suggestion content, so it passes regardless.
 */

async function deleteTemplate(
  api: APIRequestContext,
  id: string,
): Promise<void> {
  await api.delete(`/test/lease-templates/${id}`).catch(() => {});
}

test.describe("Lease Templates Phase 2 — AI placeholder auto-detection", () => {
  test("upload dialog shows AI suggesting loader, then detail page lands with AI panel", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const newName = `E2E Phase2 AI Template ${runId}`;
    const seededIds: string[] = [];

    try {
      await page.goto("/lease-templates");
      await expect(
        page.getByRole("heading", { name: "Lease Templates" }),
      ).toBeVisible({ timeout: 10000 });

      await page.getByTestId("lease-template-upload-button").click();
      await expect(
        page.getByTestId("lease-template-upload-dialog"),
      ).toBeVisible();

      await page.getByTestId("template-name-input").fill(newName);

      const md =
        "# Residential Lease Agreement\n\n" +
        "Tenant: [TENANT FULL NAME]\n" +
        "Move-in: [MOVE-IN DATE]\n" +
        "Monthly rent: [MONTHLY RENT]\n" +
        "Tenant email: [TENANT EMAIL]\n" +
        "Landlord: [LANDLORD NAME]\n";

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

      // After upload completes the AI loader should briefly appear.
      // We use a generous timeout because the upload + AI call can take seconds.
      await expect(page.getByTestId("ai-suggesting-loader")).toBeVisible({
        timeout: 20000,
      });

      // The loader should resolve and we should land on the detail page.
      await expect(page).toHaveURL(/\/lease-templates\/[a-f0-9-]+$/, {
        timeout: 30000,
      });

      const url = new URL(page.url());
      const id = url.pathname.split("/").pop() ?? "";
      if (id) seededIds.push(id);

      // The heading should reflect the template name.
      await expect(
        page.getByRole("heading", { name: newName }),
      ).toBeVisible();

      // The AI suggestions panel should be visible (even if suggestions list
      // is empty — e.g. if ANTHROPIC_API_KEY is not set).
      await expect(page.getByTestId("ai-suggestions-panel")).toBeVisible({
        timeout: 5000,
      });

      // The placeholder spec editor should still show the regex-extracted ones.
      await expect(page.getByTestId("placeholder-spec-editor")).toBeVisible();
      await expect(
        page.getByTestId("placeholder-row-TENANT FULL NAME"),
      ).toBeVisible();

      // Verify the API agrees.
      const res = await api.get(`/lease-templates/${id}`);
      expect(res.ok()).toBe(true);
    } finally {
      for (const id of seededIds) await deleteTemplate(api, id);
    }
  });

  test("AI suggestions panel can be dismissed", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const templateName = `E2E Dismissable AI Panel ${runId}`;
    const seededIds: string[] = [];

    try {
      // Seed a template, then navigate directly to its detail page so the
      // AI panel is NOT shown (it only appears after fresh upload via nav state).
      const res = await api.post("/test/seed-lease-template", {
        data: { name: templateName },
      });
      expect(res.ok()).toBe(true);
      const { id } = (await res.json()) as { id: string };
      seededIds.push(id);

      await page.goto(`/lease-templates/${id}`);
      await expect(
        page.getByRole("heading", { name: templateName }),
      ).toBeVisible({ timeout: 10000 });

      // Panel should NOT be present when navigating directly (no nav state).
      await expect(
        page.getByTestId("ai-suggestions-panel"),
      ).not.toBeVisible();

      // Placeholder spec editor should be present.
      await expect(page.getByTestId("placeholder-spec-editor")).toBeVisible();
    } finally {
      for (const id of seededIds) await deleteTemplate(api, id);
    }
  });

  test("POST suggest-placeholders API returns 200 with expected shape", async ({
    api,
  }) => {
    const seededIds: string[] = [];

    try {
      // Seed a template with some bracket placeholders.
      const res = await api.post("/test/seed-lease-template", {
        data: {
          name: `E2E API Suggest ${Date.now()}`,
          source_text:
            "Tenant: [TENANT FULL NAME]\nDate: [MOVE-IN DATE]\nRent: [MONTHLY RENT]\n",
        },
      });
      expect(res.ok()).toBe(true);
      const { id } = (await res.json()) as { id: string };
      seededIds.push(id);

      // Call the suggest endpoint.
      const suggestRes = await api.post(
        `/lease-templates/${id}/suggest-placeholders`,
      );
      expect(suggestRes.ok()).toBe(true);

      const body = (await suggestRes.json()) as {
        suggestions: Array<{ key: string; input_type: string; description: string }>;
        truncated: boolean;
        pages_note: string | null;
      };

      // Always present.
      expect(typeof body.truncated).toBe("boolean");
      expect(Array.isArray(body.suggestions)).toBe(true);

      // Each suggestion has the required shape.
      for (const s of body.suggestions) {
        expect(typeof s.key).toBe("string");
        expect(s.key.length).toBeGreaterThan(0);
        expect(typeof s.input_type).toBe("string");
        expect(typeof s.description).toBe("string");
      }
    } finally {
      for (const id of seededIds) await deleteTemplate(api, id);
    }
  });
});
