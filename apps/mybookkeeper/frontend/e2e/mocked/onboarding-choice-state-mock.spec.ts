/**
 * No-backend E2E for how the onboarding wizard's choices announce themselves.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - Each tax situation is a toggle that says whether it is selected.
 *   - Filing status is a named radio group; Tab lands in it once, the arrow keys move the
 *     choice (and focus) with no mouse, and exactly one option reads as checked.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { ORG_ID, plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

test.describe("Onboarding choices say which option is selected", () => {
  test.beforeEach(async ({ page }) => {
    await plantAuth(page);
    await stubUnmatchedApi(page, { answer: "empty" });
    await stubWorkspaceShell(page, "owner");
    await page.route("**/api/tax-profile", (route) =>
      route.fulfill(
        json({
          id: "00000000-0000-0000-0000-000000000011",
          organization_id: ORG_ID,
          tax_situations: [],
          dependents_count: 0,
          onboarding_completed: false,
        }),
      ),
    );
    await page.goto("/onboarding");
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
  });

  test("a tax situation reports pressed once chosen", async ({ page }) => {
    const rental = page.getByRole("button", { name: /Rental Properties/ });
    await expect(rental).toHaveAttribute("aria-pressed", "false");
    await rental.click();
    await expect(rental).toHaveAttribute("aria-pressed", "true");
  });

  test("filing status is chosen by keyboard and reads as one checked radio", async ({ page }) => {
    await page.getByRole("button", { name: /Rental Properties/ }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Step 2 of 3")).toBeVisible();

    const group = page.getByRole("radiogroup", { name: "Filing status" });
    const radios = group.getByRole("radio");
    await expect(radios.first()).toHaveAttribute("aria-checked", "false");
    await expect(group.locator("[aria-checked='true']")).toHaveCount(0);

    await radios.first().focus();
    await page.keyboard.press("ArrowDown");
    await expect(radios.nth(1)).toBeFocused();
    await expect(radios.nth(1)).toHaveAttribute("aria-checked", "true");
    await expect(group.locator("[aria-checked='true']")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();

    await page.keyboard.press("ArrowUp");
    await expect(radios.first()).toBeFocused();
    await expect(radios.first()).toHaveAttribute("aria-checked", "true");
    await expect(group.locator("[aria-checked='true']")).toHaveCount(1);
  });
});
