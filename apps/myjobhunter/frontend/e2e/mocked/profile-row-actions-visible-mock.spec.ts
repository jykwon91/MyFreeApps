/**
 * No-backend E2E for the Profile page row buttons (Edit, Delete, Download).
 * They used to be invisible until hovered, so touch-screen and keyboard users
 * never saw them. They must show on a touch device, and appear when a keyboard
 * user tabs into the row on a desktop.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockProfile, mockWorkHistory, mockResumeJob } from "./fixtures/mockData";
import type { Locator, Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";

const EMPTY_LIST = { items: [], total: 0 };

// The fade is on the buttons' wrapper, so the wrapper's opacity is what the user sees.
const actionsOf = (button: Locator) => button.locator("xpath=..");

async function openProfile(page: Page) {
  await stubSignedInShell(page, {
    routes: [
      { path: "/profile", body: mockProfile() },
      { path: "/education", body: EMPTY_LIST },
      { path: "/skills", body: EMPTY_LIST },
      { path: "/screening-answers", body: EMPTY_LIST },
      { path: "/work-history", body: { items: [mockWorkHistory({ company_name: "Acme Corp" })], total: 1 } },
    ],
  });
  await page.route("**/api/resume-upload-jobs", (route) =>
    route.fulfill(json([mockResumeJob({ status: "complete" })])),
  );
  await page.goto("/profile");
  await expect(page.getByText("Acme Corp")).toBeVisible();
}

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("Edit, Delete and Download are visible without hovering", async ({ page }) => {
    await openProfile(page);

    await expect(page.getByRole("button", { name: "Edit Acme Corp" })).toBeVisible();
    await expect(actionsOf(page.getByRole("button", { name: "Edit Acme Corp" }))).toHaveCSS("opacity", "1");
    await expect(actionsOf(page.getByRole("button", { name: "Delete Acme Corp" }))).toHaveCSS("opacity", "1");
    await expect(actionsOf(page.getByRole("button", { name: /^Download/ }))).toHaveCSS("opacity", "1");
  });
});

test.describe("on a desktop with a keyboard", () => {
  test("Edit and Delete are hidden until the row is focused, then visible", async ({ page }) => {
    await openProfile(page);

    const edit = page.getByRole("button", { name: "Edit Acme Corp" });
    await expect(actionsOf(edit)).toHaveCSS("opacity", "0");

    await edit.focus();
    await expect(actionsOf(edit)).toHaveCSS("opacity", "1");
    await expect(actionsOf(page.getByRole("button", { name: "Delete Acme Corp" }))).toHaveCSS("opacity", "1");
  });

  test("tabbing onto the row buttons reveals them", async ({ page }) => {
    await openProfile(page);
    const edit = page.getByRole("button", { name: "Edit Acme Corp" });

    for (let i = 0; i < 40 && !(await edit.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press("Tab");
    }
    await expect(edit).toBeFocused();
    await expect(actionsOf(edit)).toHaveCSS("opacity", "1");
  });
});
