/**
 * The "Resend verification email" outcome on the sign-in page is read out by screen readers:
 * "sent" in a status region, "failed" in an alert, both mounted before the outcome arrives.
 * The button stays on the page and keeps focus, so a keyboard user isn't dropped to the top.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { apiPath } from "@platform/ui/test-support/apiPath";
import { json, plainText } from "@platform/ui/test-support/mockResponse";
import { stubLogin } from "@platform/ui/test-support/stubLogin";
import { INTERNAL_SERVER_ERROR } from "@platform/ui/test-support/constants/internalServerError";

const RESEND_ENDPOINT = apiPath(/^\/auth\/request-verify-token$/);
const SENT = "Verification email sent. Check your inbox.";
const FAILED = "Couldn't resend right now. Try again shortly.";

async function signInUnverified(page: Page) {
  await stubLogin(page, { detail: "LOGIN_USER_NOT_VERIFIED" }, 400);
  await page.goto("/login");
  await page.locator("input[type='email']").fill("user@example.com");
  await page.locator("input[type='password']").fill("examplepassword1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  return page.getByRole("button", { name: "Resend verification email" });
}

test.describe("Login — resend verification outcome is announced", () => {
  test("a sent email is said in the status region and focus stays on the button", async ({ page }) => {
    await page.route(RESEND_ENDPOINT, (route) => route.fulfill(json(null, 202)));
    const resend = await signInUnverified(page);
    await expect(page.getByRole("alert")).toBeEmpty();

    await resend.click();

    await expect(page.getByRole("status")).toHaveText(SENT);
    await expect(page.getByRole("alert")).toBeEmpty();
    await expect(resend).toBeEnabled();
    await expect(resend).toBeFocused();
  });

  test("a failed resend is said in the alert and the button is there to try again", async ({ page }) => {
    let calls = 0;
    await page.route(RESEND_ENDPOINT, (route) => {
      calls += 1;
      return route.fulfill(calls === 1 ? plainText(INTERNAL_SERVER_ERROR, 500) : json(null, 202));
    });
    const resend = await signInUnverified(page);

    await resend.click();
    await expect(page.getByRole("alert")).toHaveText(FAILED);
    await expect(resend).toBeFocused();

    await resend.click();
    await expect(page.getByRole("status")).toHaveText(SENT);
    await expect(page.getByRole("alert")).toBeEmpty();
    expect(calls).toBe(2);
  });
});
