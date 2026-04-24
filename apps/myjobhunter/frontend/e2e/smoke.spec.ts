import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

test.describe("MyJobHunter smoke tests", () => {
  test("full user journey — login, navigate all pages, empty states, 404, sign out", async ({
    page,
    request,
  }) => {
    // 1. Create a test user
    const user = await createTestUser(request);

    try {
      // 2. Log in via the UI
      await loginViaUI(page, user);
      await expect(page).toHaveURL(/\/dashboard/);

      // 3. Dashboard — check heading and empty state
      await expect(
        page.getByRole("heading", { name: "Your hunt starts here" })
      ).toBeVisible();
      await expect(
        page.getByText(/I don't have anything to track yet/)
      ).toBeVisible();

      // 4. Applications page
      await page.getByRole("link", { name: /applications/i }).first().click();
      await page.waitForURL("**/applications");
      await expect(
        page.getByRole("heading", { name: "No applications yet" })
      ).toBeVisible();
      await expect(
        page.getByText(/Drop your first one in/)
      ).toBeVisible();

      // 5. Click "Add application" CTA — assert Phase 2 toast feedback
      await page.getByRole("button", { name: /add application/i }).first().click();
      await expect(
        page.getByText(/coming in Phase 2/i)
      ).toBeVisible({ timeout: 5_000 });

      // 6. Companies page
      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");
      await expect(
        page.getByRole("heading", { name: "No companies here yet" })
      ).toBeVisible();
      await expect(
        page.getByText(/I'll add companies here as you log applications/)
      ).toBeVisible();

      // 7. Profile page
      await page.getByRole("link", { name: /profile/i }).first().click();
      await page.waitForURL("**/profile");
      await expect(
        page.getByRole("heading", { name: "Tell me about yourself" })
      ).toBeVisible();
      await expect(
        page.getByText(/Upload your resume/)
      ).toBeVisible();

      // 8. Settings page
      await page.getByRole("link", { name: /settings/i }).first().click();
      await page.waitForURL("**/settings");
      await expect(
        page.getByRole("heading", { name: "Settings" })
      ).toBeVisible();
      await expect(page.getByText("Gmail")).toBeVisible();
      await expect(page.getByText("Disconnected")).toBeVisible();

      // 9. Application detail 404
      await page.goto("/applications/non-existent-uuid");
      await expect(
        page.getByRole("heading", {
          name: /I couldn't find that application/i,
        })
      ).toBeVisible();
      await expect(
        page.getByText(/it may have been deleted/i)
      ).toBeVisible();

      // 10. Sign out
      // Desktop: user menu in sidebar; mobile: bottom nav doesn't have sign out,
      // so we look for the dropdown trigger in the sidebar
      const signOutButton = page.getByRole("menuitem", { name: /sign out/i });
      // Trigger dropdown first
      await page.getByRole("button", { name: user.email }).click();
      await expect(signOutButton).toBeVisible();
      await signOutButton.click();

      await page.waitForURL("**/login", { timeout: 5_000 });
      await expect(page).toHaveURL(/\/login/);
    } finally {
      // 11. Cleanup
      await deleteTestUser(request, user);
    }
  });
});
