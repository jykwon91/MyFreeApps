import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI } from "./fixtures/auth";

test.describe("Discover page", () => {
  test("shows Inbox and Saved tabs; Saved tab empty state is visible", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Navigate to Discover
      await page.goto("/discover");
      await page.waitForURL("**/discover");

      // Both tabs are visible
      await expect(page.getByRole("tab", { name: "Inbox" })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Saved" })).toBeVisible();

      // Inbox tab is active by default
      await expect(page.getByRole("tab", { name: "Inbox" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      // No saved searches yet — inbox shows the no-saved-searches empty state
      await expect(
        page.getByRole("heading", { name: "No saved searches yet" }),
      ).toBeVisible();

      // Switch to Saved tab
      await page.getByRole("tab", { name: "Saved" }).click();

      // URL now has ?view=saved
      await expect(page).toHaveURL(/\?view=saved/);

      // Saved tab is now active
      await expect(page.getByRole("tab", { name: "Saved" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      // Saved empty state is shown
      await expect(
        page.getByRole("heading", { name: "No saved jobs" }),
      ).toBeVisible();
      await expect(
        page.getByText(/When you save a posting from the inbox/),
      ).toBeVisible();

      // Switch back to Inbox — URL param is removed
      await page.getByRole("tab", { name: "Inbox" }).click();
      await expect(page).not.toHaveURL(/\?view=saved/);
      await expect(page.getByRole("tab", { name: "Inbox" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("deep-linking to ?view=saved opens the Saved tab directly", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Navigate directly to the saved view
      await page.goto("/discover?view=saved");
      await page.waitForURL("**/discover**");

      // Saved tab is immediately active
      await expect(page.getByRole("tab", { name: "Saved" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await expect(
        page.getByRole("heading", { name: "No saved jobs" }),
      ).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
