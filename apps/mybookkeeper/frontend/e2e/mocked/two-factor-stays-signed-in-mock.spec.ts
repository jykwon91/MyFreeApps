/**
 * Turning 2FA on signs out every other session, and ends the token the request was sent
 * with too. The response carries a new one: the page must switch to it, so the person
 * stays signed in to save the recovery codes and keeps using the app afterwards.
 *
 * The stubbed server accepts only the newest token, as the real one does after the change.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { TOTP_STATUS_ENDPOINT } from "@platform/ui/test-support/constants/totpStatusEndpoint";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { unsignedJwt } from "@platform/ui/test-support/unsignedJwt";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const RECOVERY_CODES = ["AAAA-1111", "BBBB-2222", "CCCC-3333", "DDDD-4444", "EEEE-5555", "FFFF-6666", "GGGG-7777", "HHHH-8888"];

test.beforeEach(async ({ page }) => {
  await stubUnmatchedApi(page, { answer: "empty" });
});

test("turning 2FA on keeps this browser signed in, on the token the server sends back", async ({ page }) => {
  await plantAuth(page);
  await stubWorkspaceShell(page, "owner");
  // The same person: a token for anyone else would read as another account signing in.
  const reissued = unsignedJwt("test-user", 7200);
  const server = { enabled: false, statusTokens: [] as (string | null)[] };

  await page.route(TOTP_STATUS_ENDPOINT, (route) => {
    const sent = route.request().headers()["authorization"]?.replace("Bearer ", "") ?? null;
    server.statusTokens.push(sent);
    if (server.enabled && sent !== reissued) return route.fulfill(json({ detail: "Unauthorized" }, 401));
    return route.fulfill(json({ enabled: server.enabled }));
  });
  await page.route("**/api/auth/totp/setup", (route) =>
    route.fulfill(
      json({
        provisioning_uri: "otpauth://totp/MBK:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MBK",
        secret: "JBSWY3DPEHPK3PXP",
        algorithm: "sha256",
        digits: 6,
        period: 30,
      }),
    ),
  );
  await page.route("**/api/auth/totp/verify", (route) => {
    server.enabled = true;
    return route.fulfill(json({ verified: true, recovery_codes: RECOVERY_CODES, access_token: reissued }));
  });

  await page.goto("/security");
  await page.getByRole("button", { name: /enable 2fa/i }).click();
  await page.getByLabel("Enter your password to continue").fill("any-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Enter the 6-digit code from your app").fill("123456");
  await page.getByRole("button", { name: "Verify & Enable" }).click();

  await expect(page.getByText("Save your recovery codes")).toBeVisible();
  await expect(page.getByText(RECOVERY_CODES[0])).toBeVisible();
  await page.getByRole("button", { name: "I've saved my codes" }).click();

  await expect(page.getByRole("button", { name: "Disable 2FA" })).toBeVisible();
  await expect(page).toHaveURL(/\/security$/);
  expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBe(reissued);
  expect(server.statusTokens.at(-1)).toBe(reissued);
  expect(server.statusTokens).not.toContain(null);
});
