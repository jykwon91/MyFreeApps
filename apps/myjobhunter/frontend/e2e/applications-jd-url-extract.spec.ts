/**
 * E2E: Paste-link path on Add Application dialog.
 *
 * Covers the new flow: user opens "Add application", picks the URL tab
 * (default), pastes a job-posting URL, clicks Fetch, the form pre-fills
 * with extracted fields. Also covers the 422 auth_required path
 * (LinkedIn / Glassdoor) which surfaces a "switch to paste-text" CTA.
 *
 * Why mock the API instead of hitting the real endpoint?
 * ------------------------------------------------------
 * The extract-from-url endpoint fetches external URLs server-side.
 * Driving real fetches from a CI smoke test is fragile (the target site
 * could change, rate-limit, or be unreachable). We mock at the browser
 * level via `page.route` so the test exercises the full UI state machine
 * (loading → success / authRequired) without external dependencies.
 *
 * For coverage of the actual extraction logic, see the backend pytest
 * suite at `tests/test_jd_url_extractor.py`.
 */
import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

test.describe("Applications — paste-link JD URL extract", () => {
  test("paste a URL, fetch, fields pre-fill in the form", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user);

      // Mock the extract endpoint to return a realistic schema.org-style payload.
      await page.route("**/api/applications/extract-from-url", async (route) => {
        const request = route.request();
        const body = request.postDataJSON() as { url: string };
        expect(body.url).toBe("https://jobs.example.com/posting/abc");
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            title: "Senior Backend Engineer",
            company: "Acme Corp",
            location: "San Francisco, CA, US",
            description_html: "<p>Build APIs at scale.</p>",
            requirements_text: null,
            summary: null,
            source_url: "https://jobs.example.com/posting/abc",
          }),
        });
      });

      // Navigate to Applications and open the dialog.
      await page.getByRole("link", { name: /applications/i }).first().click();
      await page.waitForURL("**/applications");
      await page.getByRole("button", { name: /add application/i }).first().click();
      await expect(
        page.getByRole("dialog", { name: /add application/i }),
      ).toBeVisible();

      // The URL input is the default (no expand step needed in the new dialog).
      const urlInput = page.getByLabel(/job posting url/i);
      await expect(urlInput).toBeVisible();

      // Type a URL and click "Auto-fill".
      await urlInput.fill("https://jobs.example.com/posting/abc");
      await page.getByRole("button", { name: /auto-fill/i }).click();

      // The dialog advances to the review step — "Review and adjust before saving"
      // banner with the source URL.
      await expect(page.getByText(/review and adjust before saving/i)).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText(/jobs\.example\.com/i)).toBeVisible();

      // The role title field is pre-filled.
      await expect(
        page.getByPlaceholder(/senior backend engineer/i)
      ).toHaveValue("Senior Backend Engineer");

      // The location field is pre-filled.
      await expect(
        page.getByPlaceholder(/sf, nyc/i)
      ).toHaveValue("San Francisco, CA, US");
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("auth-walled URL surfaces 'paste the description text instead' affordance", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user);

      // Mock 422 auth_required — this is the response the backend returns
      // for LinkedIn / Glassdoor / tiny pages.
      await page.route("**/api/applications/extract-from-url", async (route) => {
        await route.fulfill({
          status: 422,
          contentType: "application/json",
          body: JSON.stringify({ detail: "auth_required" }),
        });
      });

      await page.getByRole("link", { name: /applications/i }).first().click();
      await page.waitForURL("**/applications");
      await page.getByRole("button", { name: /add application/i }).first().click();

      // The URL input is the default (no expand step in the new dialog).
      const urlInput = page.getByLabel(/job posting url/i);
      await urlInput.fill("https://www.linkedin.com/jobs/view/12345");
      await page.getByRole("button", { name: /auto-fill/i }).click();

      // Backend returns 422 auth_required → the dialog switches to the text panel
      // and shows a toast explaining that the page required sign-in.
      // The dialog now shows the text-paste panel with its textarea.
      await expect(page.getByLabel(/job description text/i)).toBeVisible({
        timeout: 5_000,
      });
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
