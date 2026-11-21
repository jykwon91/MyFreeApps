/**
 * No-backend E2E: the workspace switcher menu shows which item the keyboard is on.
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { OrgWithRole } from "@mybookkeeper/api-client/types/organization/OrgWithRole";
import { ORG_ID, plantAuth, stubWorkspaceShell, workspaceOf } from "./fixtures/mockSession";

const OTHER_ORG_ID = "00000000-0000-0000-0000-000000000020";

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await plantAuth(page);
  await stubWorkspaceShell(page, "admin");
  await page.route("**/api/organizations", (route) =>
    route.fulfill(
      json([
        workspaceOf(ORG_ID, "First Workspace", "admin"),
        workspaceOf(OTHER_ORG_ID, "Second Workspace", "admin"),
      ] satisfies OrgWithRole[]),
    ),
  );
});

test.describe("Dropdown keyboard focus (mocked, no backend)", () => {
  test("arrowing through the workspace menu highlights the item, and Enter picks it", async ({ page }) => {
    await page.goto("/members");
    const trigger = page.getByRole("button", { name: /First Workspace/ });
    await expect(trigger).toBeVisible({ timeout: 10000 });

    await trigger.focus();
    await page.keyboard.press("Enter");

    const first = page.getByRole("menuitem", { name: /First Workspace/ });
    const second = page.getByRole("menuitem", { name: /Second Workspace/ });
    await expect(first).toBeVisible();

    await expect(first).toHaveAttribute("data-highlighted", "");
    await expect(first).not.toHaveCSS("box-shadow", "none");

    await page.keyboard.press("ArrowDown");
    await expect(second).toHaveAttribute("data-highlighted", "");
    await expect(second).not.toHaveCSS("box-shadow", "none");
    await expect(first).not.toHaveAttribute("data-highlighted", "");

    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: /Second Workspace/ })).toBeVisible();
  });
});
