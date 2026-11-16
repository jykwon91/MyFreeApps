/**
 * The forgot-password page used to show "check your inbox" whatever the
 * request did, so a user whose request failed (5xx, rate limit, network)
 * waited for an email that was never sent. Only a 2xx may show the success
 * screen; a failure shows its reason and leaves the form ready to retry.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { apiPath } from "@platform/ui/test-support/apiPath";
import { json, plainText } from "@platform/ui/test-support/mockResponse";
import { INTERNAL_SERVER_ERROR } from "@platform/ui/test-support/constants/internalServerError";

const FORGOT_PASSWORD = apiPath(/^\/auth\/forgot-password$/);
const EMAIL = "user@example.com";

test.describe("Forgot password — failures are shown, never the success screen", () => {
  test("a 500 shows an error, keeps the email, and a retry that succeeds shows the success screen", async ({ page }) => {
    let calls = 0;
    await page.route(FORGOT_PASSWORD, (route) => {
      calls += 1;
      return route.fulfill(calls === 1 ? plainText(INTERNAL_SERVER_ERROR, 500) : json(null, 202));
    });

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(EMAIL);
    const submit = page.getByRole("button", { name: "Send reset link" });
    await submit.click();

    await expect(page.getByRole("alert")).toHaveText("Something went wrong. Please try again.");
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toHaveCount(0);
    await expect(page.getByLabel("Email")).toHaveValue(EMAIL);
    await expect(submit).toBeEnabled();

    await submit.click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    expect(calls).toBe(2);
  });

  test("a 429 says to wait instead of claiming an email was sent", async ({ page }) => {
    await page.route(FORGOT_PASSWORD, (route) => route.fulfill(json({ detail: "Too many attempts" }, 429)));

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByRole("alert")).toHaveText("Too many attempts. Wait a few minutes and try again.");
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toHaveCount(0);
  });

  test("a network failure shows an error", async ({ page }) => {
    await page.route(FORGOT_PASSWORD, (route) => route.abort("failed"));

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByRole("alert")).toHaveText("Something went wrong. Please try again.");
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toHaveCount(0);
  });
});
