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

      // Expand the auto-fill panel — the prompt is collapsed initially.
      await page.getByRole("button", { name: /paste a link or job description to auto-fill/i }).click();

      // URL tab is the default. Confirm by checking for the URL input.
      const urlInput = page.getByLabel(/job posting url/i);
      await expect(urlInput).toBeVisible();

      // Type a URL and click "Fetch and auto-fill".
      await urlInput.fill("https://jobs.example.com/posting/abc");
      await page.getByRole("button", { name: /fetch and auto-fill/i }).click();

      // Success banner appears.
      await expect(page.getByText(/fields pre-filled from jd/i)).toBeVisible({
        timeout: 5_000,
      });
      await expect(page.getByText(/fetched from/i)).toBeVisible();

      // The role title is pre-filled.
      await expect(page.getByLabel(/role title/i)).toHaveValue("Senior Backend Engineer");

      // The location is pre-filled.
      await expect(page.getByLabel(/^location/i)).toHaveValue("San Francisco, CA, US");

      // The URL field is also pre-filled with the source URL.
      await expect(page.locator("input[type='url']").first()).toHaveValue(
        "https://jobs.example.com/posting/abc",
      );
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

      await page.getByRole("button", { name: /paste a link or job description to auto-fill/i }).click();

      const urlInput = page.getByLabel(/job posting url/i);
      await urlInput.fill("https://www.linkedin.com/jobs/view/12345");
      await page.getByRole("button", { name: /fetch and auto-fill/i }).click();

      // Auth-required banner is shown — distinct from the generic "Couldn't auto-fill" banner.
      await expect(page.getByText(/couldn't reach this page/i)).toBeVisible({
        timeout: 5_000,
      });

      // The "paste the description text instead" button is offered.
      const switchButton = page.getByRole("button", {
        name: /paste the description text instead/i,
      });
      await expect(switchButton).toBeVisible();

      // Clicking it switches the active tab to the text panel.
      await switchButton.click();
      await expect(page.getByLabel(/job description text/i)).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
