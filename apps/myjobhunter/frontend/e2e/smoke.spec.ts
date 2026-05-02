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
      await loginViaUI(page, user, request);
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

      // 5. Click "Add application" CTA — dialog opens (Phase 2)
      await page.getByRole("button", { name: /add application/i }).first().click();
      await expect(
        page.getByRole("dialog", { name: /add application/i })
      ).toBeVisible({ timeout: 5_000 });
      // Dismiss the dialog before continuing
      await page.getByRole("button", { name: /cancel/i }).click();

      // 6. Companies page
      await page.getByRole("link", { name: /companies/i }).first().click();
      await page.waitForURL("**/companies");
      await expect(
        page.getByRole("heading", { name: "No companies here yet" })
      ).toBeVisible();
      await expect(
        page.getByText(/I'll add companies here as you log applications/)
      ).toBeVisible();
      // "Add a company" CTA is present in the empty state
      await expect(
        page.getByRole("button", { name: /add a company/i })
      ).toBeVisible();

      // 7. Profile page — Phase 3: profile is lazily created, shows sections
      await page.getByRole("link", { name: /profile/i }).first().click();
      await page.waitForURL("**/profile");
      // The profile page now shows salary + location + work history sections
      // (Phase 1 empty-state heading "Tell me about yourself" is no longer shown)
      await expect(
        page.getByRole("heading", { name: "Salary preferences" })
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Work history" })
      ).toBeVisible();

      // 8. Settings page
      await page.getByRole("link", { name: /settings/i }).first().click();
      await page.waitForURL("**/settings");
      await expect(
        page.getByRole("heading", { name: "Settings" })
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: /gmail/i })).toBeVisible();
      await expect(page.getByText("Disconnected", { exact: true }).first()).toBeVisible();

      // 9. Application detail error page — invalid/non-existent UUID
      await page.goto("/applications/non-existent-uuid");
      // The app shows a 422/error state when the UUID is not found
      await expect(
        page.getByRole("heading", {
          name: /couldn't load that application/i,
        })
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.getByText(/non-existent-uuid.*isn't available/i)
      ).toBeVisible();

      // 10. Sign out
      // Desktop: user menu in sidebar — the button shows the truncated name,
      // not the full email. Click the last button in the sidebar to open the menu.
      const signOutButton = page.getByRole("menuitem", { name: /sign out/i });
      await page.locator("aside").getByRole("button").last().click();
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
