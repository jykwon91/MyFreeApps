import { test, expect } from "./fixtures/auth";

test.describe("User Activity (PostHog embed)", () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto("/admin/user-activity");
    await expect(page.getByRole("heading", { name: "User Activity" })).toBeVisible({ timeout: 10000 });
  });

  test("page loads with heading and subtitle inside admin layout", async ({ authedPage: page }) => {
    // Subtitle matches the new PostHog-facing copy
    await expect(page.getByText(/Live product analytics via PostHog/i)).toBeVisible();

    // Admin sidebar is still present (route is properly nested under AdminLayout)
    await expect(page.getByRole("link", { name: /user activity/i })).toBeVisible();
  });

  test("either the PostHog iframe or the empty-state setup instructions are rendered", async ({ authedPage: page }) => {
    // Deployments that have VITE_POSTHOG_DASHBOARD_URL set will render an iframe;
    // deployments that don't will render the empty-state with a VITE_POSTHOG_DASHBOARD_URL
    // code hint and a link to posthog.com. Either one proves the page branched correctly.
    const iframe = page.locator('iframe[title="PostHog User Activity Dashboard"]');
    const emptyState = page.getByText(/PostHog dashboard not configured/i);

    await expect(iframe.or(emptyState)).toBeVisible({ timeout: 5000 });

    const iframeCount = await iframe.count();
    const emptyCount = await emptyState.count();
    expect(iframeCount + emptyCount).toBeGreaterThan(0);

    // If we rendered the empty state, verify it has actionable setup guidance
    if (emptyCount > 0) {
      await expect(page.getByText("VITE_POSTHOG_DASHBOARD_URL")).toBeVisible();
      const posthogLink = page.getByRole("link", { name: /posthog\.com/i });
      await expect(posthogLink).toBeVisible();
      await expect(posthogLink).toHaveAttribute("target", "_blank");
      await expect(posthogLink).toHaveAttribute("rel", "noopener noreferrer");
    }

    // If we rendered the iframe, verify it has the expected src scheme
    if (iframeCount > 0) {
      const src = await iframe.getAttribute("src");
      expect(src).toBeTruthy();
      expect(src!.startsWith("http")).toBe(true);
    }
  });

  test("navigating away and back re-mounts the page cleanly", async ({ authedPage: page }) => {
    // Regression guard: the page uses an iframe which can leak listeners if re-mounted
    // carelessly. Navigating away and back should leave exactly one heading in the DOM.
    await page.getByRole("link", { name: /cost monitoring/i }).click();
    await expect(page.getByRole("heading", { name: "Cost Monitoring" }).first()).toBeVisible({ timeout: 10000 });

    await page.getByRole("link", { name: /user activity/i }).click();
    await expect(page.getByRole("heading", { name: "User Activity" })).toBeVisible({ timeout: 10000 });

    const headings = page.getByRole("heading", { name: "User Activity" });
    await expect(headings).toHaveCount(1);
  });
});
