import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { test, expect, type APIRequestContext, type Page } from "./fixtures/auth";
import { deleteWelcomeManual } from "./fixtures/welcome-manual";

/**
 * PR 4b — Welcome Manuals full-flow behavioural E2E.
 *
 * Drives the real user journey through the UI:
 *   create (seeded) → appears in list → open detail → edit a section
 *   (title + markdown body) and save → add a section → reorder sections →
 *   upload a photo to a section → open the email dialog and send → delete.
 *
 * Verifies UI state AND backend state via the public API, and cleans up all
 * seeded rows in `finally` per the project's "never leave test data" rule.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PHOTO = path.join(__dirname, "fixtures", "listings", "test-photo-with-gps.jpg");

interface ManualDetail {
  id: string;
  title: string;
  sections: Array<{ id: string; title: string; display_order: number; images: unknown[] }>;
}

async function fetchManual(api: APIRequestContext, id: string): Promise<ManualDetail> {
  const res = await api.get(`/welcome-manuals/${id}`);
  if (!res.ok()) throw new Error(`fetchManual failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

async function waitForListPage(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Welcome Manuals" })).toBeVisible({
    timeout: 10000,
  });
  await page.waitForLoadState("networkidle");
}

test.describe("Welcome Manuals CRUD (PR 4b)", () => {
  test("create, edit a section, add + reorder sections, upload a photo, and delete", async ({
    authedPage: page,
    api,
  }) => {
    const runId = Date.now();
    const title = `E2E Welcome Manual ${runId}`;
    let manualId: string | null = null;

    try {
      // 1) CREATE via the UI — seed checkbox is checked by default.
      await page.goto("/welcome-manuals");
      await waitForListPage(page);

      await page.getByTestId("new-welcome-manual-button").click();
      await expect(page.getByTestId("welcome-manual-create-form")).toBeVisible();
      await expect(page.getByTestId("welcome-manual-create-seed")).toBeChecked();
      await page.getByTestId("welcome-manual-create-title").fill(title);
      await page.getByTestId("welcome-manual-create-submit").click();

      // Navigates to the new detail page (header heading appears). Scope to the
      // header card — the guest-preview panel repeats the title as its own h1.
      await expect(
        page.getByTestId("welcome-manual-header-card").getByRole("heading", { name: title }),
      ).toBeVisible({ timeout: 10000 });
      const detailUrl = page.url();
      const match = detailUrl.match(/\/welcome-manuals\/([0-9a-f-]+)/);
      manualId = match?.[1] ?? null;
      expect(manualId).toBeTruthy();
      if (!manualId) throw new Error("Could not parse manual id from URL");

      // Seeded with the default stub sections.
      await page.waitForLoadState("networkidle");
      const seeded = await fetchManual(api, manualId);
      expect(seeded.sections.length).toBeGreaterThanOrEqual(5);

      // 2) Appears in the list.
      await page.goto("/welcome-manuals");
      await waitForListPage(page);
      await expect(page.getByText(title).first()).toBeVisible();

      // Open it again.
      await page.getByText(title).first().click();
      await expect(
        page.getByTestId("welcome-manual-header-card").getByRole("heading", { name: title }),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");

      // 3) EDIT the first section's title + markdown body, then Save.
      const firstCard = page.getByTestId("welcome-manual-section-card").first();
      await expect(firstCard).toBeVisible();
      const firstTitle = firstCard.getByTestId("welcome-manual-section-title");
      await firstTitle.fill(`Wi-Fi Details ${runId}`);
      const firstBody = firstCard.getByTestId("welcome-manual-section-body");
      await firstBody.fill("**Network:** Lakeview\n\n- Password: hunter2");
      // Live markdown preview renders.
      await expect(firstCard.getByTestId("welcome-manual-section-body-preview")).toBeVisible();
      await firstCard.getByTestId("welcome-manual-section-save").click();

      await expect(async () => {
        const updated = await fetchManual(api, manualId!);
        const edited = updated.sections.find((s) => s.title === `Wi-Fi Details ${runId}`);
        expect(edited).toBeTruthy();
      }).toPass({ timeout: 10000 });

      // 4) ADD a section — it appears as a new card.
      const beforeCount = await page.getByTestId("welcome-manual-section-card").count();
      await page.getByTestId("add-welcome-manual-section-button").click();
      await expect(async () => {
        const afterCount = await page.getByTestId("welcome-manual-section-card").count();
        expect(afterCount).toBe(beforeCount + 1);
      }).toPass({ timeout: 10000 });

      const afterAdd = await fetchManual(api, manualId);
      expect(afterAdd.sections.length).toBe(seeded.sections.length + 1);

      // 5) REORDER — move the first section after the second via the order API
      // through the UI's contract. We assert the order endpoint accepts a full
      // permutation and the manual reflects the new order. (Drag simulation is
      // flaky cross-browser; the optimistic UI + invalidation path is unit-tested,
      // so here we exercise the persisted contract the UI fires.)
      const current = await fetchManual(api, manualId);
      const ids = [...current.sections]
        .sort((a, b) => a.display_order - b.display_order)
        .map((s) => s.id);
      const reordered = [ids[1], ids[0], ...ids.slice(2)];
      const orderRes = await api.put(`/welcome-manuals/${manualId}/sections/order`, {
        data: { section_ids: reordered },
      });
      expect(orderRes.ok()).toBeTruthy();
      const afterReorder = await fetchManual(api, manualId);
      const sortedAfter = [...afterReorder.sections]
        .sort((a, b) => a.display_order - b.display_order)
        .map((s) => s.id);
      expect(sortedAfter[0]).toBe(reordered[0]);
      expect(sortedAfter[1]).toBe(reordered[1]);

      // 6) UPLOAD a photo to the first section (if the fixture exists).
      if (fs.existsSync(FIXTURE_PHOTO)) {
        await page.reload();
        await page.waitForLoadState("networkidle");
        const card = page.getByTestId("welcome-manual-section-card").first();
        await expect(card.getByTestId("welcome-manual-image-empty-state")).toBeVisible();
        await card.getByTestId("welcome-manual-image-file-input").setInputFiles(FIXTURE_PHOTO);
        await expect(card.getByTestId("welcome-manual-image-card").first()).toBeVisible({
          timeout: 10000,
        });

        // Confirm persisted via API.
        await expect(async () => {
          const withImage = await fetchManual(api, manualId!);
          const total = withImage.sections.reduce((n, s) => n + s.images.length, 0);
          expect(total).toBeGreaterThanOrEqual(1);
        }).toPass({ timeout: 10000 });
      }

      // 7) EMAIL dialog — open, send. In CI SMTP is unconfigured, so the send
      // returns status=skipped; the dialog shows the skipped result (no retry).
      await page.getByTestId("email-welcome-manual-button").click();
      await expect(page.getByTestId("welcome-manual-email-dialog")).toBeVisible();
      await page.getByTestId("welcome-manual-email-input").fill("guest@example.com");
      await page.getByTestId("welcome-manual-email-send").click();
      // One of the three result states must render.
      await expect(
        page
          .getByTestId("welcome-manual-email-sent")
          .or(page.getByTestId("welcome-manual-email-failed"))
          .or(page.getByTestId("welcome-manual-email-skipped")),
      ).toBeVisible({ timeout: 15000 });
      // Close whichever result is showing.
      const closeBtn = page
        .getByTestId("welcome-manual-email-done")
        .or(page.getByTestId("welcome-manual-email-close"));
      if (await closeBtn.first().isVisible()) {
        await closeBtn.first().click();
      }

      // 8) DELETE the manual via the UI and verify navigation + removal.
      await page.getByTestId("delete-welcome-manual-button").click();
      await expect(page.getByText(/Delete this welcome manual\?/i)).toBeVisible();
      await page.getByRole("button", { name: /^delete$/i }).click();

      await expect(page).toHaveURL(/\/welcome-manuals$/, { timeout: 10000 });
      await page.waitForLoadState("networkidle");
      await expect(page.getByText(title)).toHaveCount(0);

      // Confirm soft-deleted (404 on read).
      const afterDelete = await api.get(`/welcome-manuals/${manualId}`);
      expect(afterDelete.status()).toBe(404);
      manualId = null; // already deleted — skip cleanup
    } finally {
      if (manualId) await deleteWelcomeManual(api, manualId);
    }
  });
});
