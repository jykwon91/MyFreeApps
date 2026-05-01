/**
 * Layout regression tests for the "Verify" buttons on 2FA-related pages.
 *
 * Triggered by 2026-04-30 user report: "the verify button for 2fa is still
 * not centered" after PR #132 added `justify-center` to the shared Button
 * base classes. That fix centered text *inside* the button, but did not
 * address container-level alignment of buttons that sit inside a flex row.
 *
 * These tests measure actual on-screen positions with `getBoundingClientRect`
 * — checking class presence is not enough because the bug lives at the
 * parent-flex-container level, not on the button itself.
 */
import { test, expect, type Locator } from "@playwright/test";

async function expectHorizontallyCenteredWithin(
  child: Locator,
  parent: Locator,
  toleranceCssPx = 1
): Promise<void> {
  const childBox = await child.boundingBox();
  const parentBox = await parent.boundingBox();
  expect(childBox, "child element must be measurable").not.toBeNull();
  expect(parentBox, "parent element must be measurable").not.toBeNull();
  const childCenter = childBox!.x + childBox!.width / 2;
  const parentCenter = parentBox!.x + parentBox!.width / 2;
  const delta = Math.abs(childCenter - parentCenter);
  expect(
    delta,
    `child center=${childCenter} parent center=${parentCenter} delta=${delta}px (tolerance=${toleranceCssPx}px)`
  ).toBeLessThanOrEqual(toleranceCssPx);
}

test.describe("2FA — Verify-email success page button alignment", () => {
  test("Sign in link is horizontally centered inside the card after a successful verification", async ({ page }) => {
    await page.route("**/api/auth/verify", (route) => {
      route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/verify-email?token=test-success-token");

    const link = page.getByRole("link", { name: "Sign in" });
    await expect(link).toBeVisible({ timeout: 10000 });

    // Card is the centered max-w-sm container around the link
    const card = page.locator("div.bg-card.max-w-sm");
    await expect(card).toBeVisible();

    await expectHorizontallyCenteredWithin(link, card);
  });
});

test.describe("2FA — Login challenge step Verify button alignment", () => {
  test("Verify button is horizontally centered inside the login card on the TOTP challenge step", async ({ page }) => {
    // Mock the login endpoint to return totp_required so the UI advances to the challenge step.
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

    // Confirm we advanced to the TOTP challenge step. The label is a
    // <label> without htmlFor, so use the surrounding text + the input
    // placeholder to anchor.
    await expect(page.getByText("Authentication code")).toBeVisible({ timeout: 5000 });
    await expect(page.getByPlaceholder("000000")).toBeVisible();
    const verifyBtn = page.getByRole("button", { name: "Verify", exact: true });
    await expect(verifyBtn).toBeVisible();

    const card = page.locator("div.bg-card.max-w-sm");
    await expect(card).toBeVisible();

    await expectHorizontallyCenteredWithin(verifyBtn, card);
  });
});

test.describe("2FA — Security setup Verify & Enable button alignment", () => {
  test("'Verify & Enable' button is horizontally centered within its action row container", async ({ page }) => {
    // We need to land on the /security page with TOTP setup state.
    // Without a real backend the page would redirect to login on token-validation
    // failure, so we (a) plant a structurally-valid (but fake-signed) JWT with
    // a future exp claim so the client-side `useIsAuthenticated` check passes,
    // and (b) mock the bare minimum API surface the page needs to render
    // the verify step.
    await page.addInitScript(() => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
      const payload = btoa(JSON.stringify({ sub: "test-user", exp: futureExp }));
      const fakeJwt = `${header}.${payload}.fake-signature`;
      window.localStorage.setItem("token", fakeJwt);
      window.localStorage.setItem("v1_activeOrgId", "00000000-0000-0000-0000-000000000010");
    });

    await page.route("**/api/users/me", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-0000-0000-000000000001",
          email: "test@example.com",
          name: "Test User",
          is_active: true,
          is_superuser: false,
          is_verified: true,
          role: "owner",
        }),
      });
    });

    await page.route("**/api/organizations", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "00000000-0000-0000-0000-000000000010", name: "Test Workspace", role: "owner" },
        ]),
      });
    });

    await page.route("**/api/auth/totp/status", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ enabled: false }),
      });
    });

    await page.route("**/api/auth/totp/setup", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          provisioning_uri: "otpauth://totp/MBK:test@example.com?secret=JBSWY3DPEHPK3PXP&issuer=MBK",
          secret: "JBSWY3DPEHPK3PXP",
        }),
      });
    });

    // Other routes the auth-gated app probes on first render.
    await page.route("**/api/version", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version: "test" }) });
    });
    await page.route("**/api/tax-profile", (route) => {
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ onboarding_completed: true, tax_situations: [], filing_status: null, dependents_count: 0 }) });
    });

    await page.goto("/security");

    // Click "Enable 2FA" to advance to verify step
    const enableBtn = page.getByRole("button", { name: /enable 2fa/i });
    await expect(enableBtn, "Could not reach Enable 2FA — investigate Security page render").toBeVisible({ timeout: 10000 });
    await enableBtn.click();

    const verifyBtn = page.getByRole("button", { name: "Verify & Enable" });
    await expect(verifyBtn).toBeVisible({ timeout: 5000 });

    // The action row is `<div className="flex gap-2">` containing Verify+Cancel.
    // The complaint is that the buttons sit at the LEFT of this row instead of being centered.
    const actionRow = verifyBtn.locator("xpath=ancestor::div[contains(@class, 'flex') and contains(@class, 'gap-2')][1]");
    await expect(actionRow).toBeVisible();

    // The pair of buttons (treated as a group) should be centered within the action row's parent
    // section — that's the user-visible expectation of "centered". We measure the bounding box
    // of the row itself relative to its parent.
    const sectionParent = actionRow.locator("xpath=parent::*");
    const rowBox = await actionRow.boundingBox();
    const sectionBox = await sectionParent.boundingBox();
    expect(rowBox).not.toBeNull();
    expect(sectionBox).not.toBeNull();

    // The flex row should fill its parent (since `flex` on a block-level div implies width:100%).
    // The actual buttons inside should be centered within the row when justify-center is applied.
    // Without justify-center on the row, the buttons are flex-start (left), which is the bug.
    const cancelBtn = page.getByRole("button", { name: "Cancel" });
    await expect(cancelBtn).toBeVisible();

    // The midpoint of the [Verify, Cancel] pair should be ~= the midpoint of the row.
    const verifyBox = await verifyBtn.boundingBox();
    const cancelBox = await cancelBtn.boundingBox();
    expect(verifyBox).not.toBeNull();
    expect(cancelBox).not.toBeNull();
    const pairLeft = Math.min(verifyBox!.x, cancelBox!.x);
    const pairRight = Math.max(verifyBox!.x + verifyBox!.width, cancelBox!.x + cancelBox!.width);
    const pairCenter = (pairLeft + pairRight) / 2;
    const rowCenter = rowBox!.x + rowBox!.width / 2;
    const delta = Math.abs(pairCenter - rowCenter);
    expect(
      delta,
      `Verify+Cancel pair center=${pairCenter} row center=${rowCenter} delta=${delta}px — buttons should be horizontally centered within the action row`
    ).toBeLessThanOrEqual(2);
  });
});
