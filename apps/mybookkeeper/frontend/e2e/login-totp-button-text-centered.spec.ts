/**
 * Layout regression for the 2026-04-30 user report:
 * "the verify and login button text is left aligned. it needs to be centered"
 *
 * PR #132 added `justify-center` to the *shared* Button component
 * (`packages/shared-frontend/src/components/ui/Button.tsx`). MyBookkeeper's
 * `LoadingButton` imports the LOCAL Button at
 * `apps/mybookkeeper/frontend/src/shared/components/ui/Button.tsx`, which is
 * a duplicate that did NOT receive the fix. So the user kept seeing
 * left-aligned text on the live "Verify" button despite the merged PR.
 *
 * The earlier `two-factor-button-alignment.spec.ts` test asserted the BUTTON
 * was centered within its container — true (because of `w-full`) — but did
 * not assert that the TEXT was centered within the button. That's the gap
 * this test closes by measuring the rendered text node's center against the
 * button's center.
 */
import { test, expect } from "@playwright/test";

test.describe("Login TOTP challenge — Verify button text centered within button", () => {
  test("the 'Verify' text is horizontally centered inside the Verify button", async ({ page }) => {
    await page.route("**/api/auth/totp/login", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ detail: "totp_required" }),
      });
    });

    await page.goto("/login");
    await page.locator("input[type='email']").fill("user@example.com");
    await page.locator("input[type='password']").fill("examplepassword1234");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Authentication code")).toBeVisible({ timeout: 5000 });
    const verifyBtn = page.getByRole("button", { name: "Verify", exact: true });
    await expect(verifyBtn).toBeVisible();

    // Measure the rendered text inside the button against the button's box.
    // We use document.createRange() over the button's text node to capture the
    // exact horizontal extent of the rendered "Verify" glyphs — so this test
    // catches the case where the button is full-width but the text inside
    // sits at the left edge.
    const measurements = await verifyBtn.evaluate((btn) => {
      const buttonBox = btn.getBoundingClientRect();
      const range = document.createRange();
      // Find the text node containing "Verify".
      const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
      let textNode: Text | null = null;
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if ((node.textContent ?? "").trim().length > 0) {
          textNode = node as Text;
          break;
        }
      }
      if (!textNode) return null;
      range.selectNodeContents(textNode);
      const textBox = range.getBoundingClientRect();
      return {
        buttonLeft: buttonBox.left,
        buttonRight: buttonBox.right,
        buttonCenter: buttonBox.left + buttonBox.width / 2,
        textLeft: textBox.left,
        textRight: textBox.right,
        textCenter: textBox.left + textBox.width / 2,
        buttonWidth: buttonBox.width,
        textWidth: textBox.width,
      };
    });

    expect(measurements, "could not measure button text").not.toBeNull();
    const m = measurements!;
    const delta = Math.abs(m.textCenter - m.buttonCenter);
    expect(
      delta,
      `Verify text center=${m.textCenter} button center=${m.buttonCenter} delta=${delta}px (button width=${m.buttonWidth}, text width=${m.textWidth})`
    ).toBeLessThanOrEqual(2);
  });
});
