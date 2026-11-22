/**
 * No-backend E2E for the Security page's "Devices signed in" card: someone who has lost their
 * phone can see it here and sign it out from the website.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { INTERNAL_SERVER_ERROR } from "@platform/ui/test-support/constants/internalServerError";
import { MID_PHONE_VIEWPORT } from "@platform/ui/test-support/constants/phoneViewport";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";
import { deviceSessionsListUrl, stubDeviceSessions, testDevice } from "@platform/ui/test-support/deviceSessionsApi";
import { plainText } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { holdReads } from "@platform/ui/test-support/routeControls";
import { toast } from "@platform/ui/test-support/toast";

const PIXEL = testDevice("11111111-1111-1111-1111-111111111111", "Pixel 9", 3);
const IPHONE = testDevice("22222222-2222-2222-2222-222222222222", "Jane's iPhone", 0.1);

const card = (page: Page) => page.getByRole("region", { name: "Devices signed in" });

async function confirmSignOut(page: Page, name: string): Promise<void> {
  await card(page).getByRole("button", { name: `Sign out ${name}` }).click();
  await page.getByRole("dialog", { name: `Sign out ${name}?` }).getByRole("button", { name: "Sign out", exact: true }).click();
}

test.describe("Security page: devices signed in", () => {
  test.beforeEach(async ({ page }) => {
    await stubSignedInShell(page);
  });

  test("lists the phones, most recently used first, and signs one out after a confirm", async ({ page }) => {
    const signedOut = await stubDeviceSessions(page, { devices: [PIXEL, IPHONE] });
    await page.goto("/security");

    const rows = card(page).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Jane's iPhone");
    await expect(rows.nth(0)).toContainText("Last used 6 minutes ago");
    await expect(rows.nth(1)).toContainText("Pixel 9");
    await expect(rows.nth(1)).toContainText("Last used 3 hours ago");
    await expect(card(page)).toContainText("signed in to your MyJobHunter account");

    await card(page).getByRole("button", { name: "Sign out Pixel 9" }).click();
    const dialog = page.getByRole("dialog", { name: "Sign out Pixel 9?" });
    await expect(dialog).toContainText("can stay signed in for up to 30 minutes");
    expect(signedOut).toEqual([]);

    await dialog.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(toast(page, "Signed out Pixel 9. It may stay signed in for up to 30 minutes.")).toBeVisible();
    expect(signedOut).toEqual([PIXEL.id]);
    await expect(rows).toHaveCount(1);
    await expect(card(page).getByText("Pixel 9")).toBeHidden();
  });

  test("cancelling the confirm keeps the phone signed in", async ({ page }) => {
    const signedOut = await stubDeviceSessions(page, { devices: [PIXEL] });
    await page.goto("/security");
    await card(page).getByRole("button", { name: "Sign out Pixel 9" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect(signedOut).toEqual([]);
    await expect(card(page).getByRole("listitem")).toHaveCount(1);
  });

  test("a phone that was already signed out is dropped and called done", async ({ page }) => {
    await stubDeviceSessions(page, { devices: [PIXEL], refuseSignOut: { status: 404, detail: "Session not found" } });
    await page.goto("/security");
    await confirmSignOut(page, "Pixel 9");
    await expect(toast(page, "That device was already signed out.")).toBeVisible();
    await expect(card(page).getByText("No phones signed in")).toBeVisible();
  });

  test("a refused sign-out says so and keeps the phone listed", async ({ page }) => {
    await stubDeviceSessions(page, { devices: [PIXEL], refuseSignOut: { status: 403, detail: "Not allowed" } });
    await page.goto("/security");
    await confirmSignOut(page, "Pixel 9");
    await expect(toast(page, "Couldn't sign out Pixel 9. Check your connection and try again.")).toBeVisible();
    await expect(card(page).getByRole("listitem")).toHaveCount(1);
  });

  test("shows a skeleton while loading, then the empty state", async ({ page }) => {
    await stubDeviceSessions(page);
    const gate = await holdReads(page, deviceSessionsListUrl());
    await page.goto("/security");
    await expect(card(page).getByTestId("device-skeleton")).toHaveCount(2);
    await expect(card(page).getByText("No phones signed in")).toBeHidden();
    gate.release();
    await expect(card(page).getByText("No phones signed in")).toBeVisible();
    await expect(card(page).getByTestId("device-skeleton")).toHaveCount(0);
  });

  test("a list that won't load offers Try again, which loads it", async ({ page }) => {
    await stubDeviceSessions(page, { devices: [PIXEL] });
    // Every read fails until Try again: the dev server's StrictMode loads the list twice on the way in.
    let failing = true;
    await page.route(deviceSessionsListUrl(), (route) =>
      failing ? route.fulfill(plainText(INTERNAL_SERVER_ERROR, 500)) : route.fallback(),
    );
    await page.goto("/security");
    await expect(card(page).getByText("Couldn't load your devices. Check your connection and try again.")).toBeVisible();
    await expect(card(page).getByTestId("device-skeleton")).toHaveCount(0);
    failing = false;
    await card(page).getByRole("button", { name: "Try again" }).click();
    await expect(card(page).getByRole("listitem")).toHaveCount(1);
    await expect(card(page).getByText(/Couldn't load your devices/)).toBeHidden();
  });

  test("on a phone-sized screen the Sign out button is a full touch target", async ({ page }) => {
    await page.setViewportSize(MID_PHONE_VIEWPORT);
    await stubDeviceSessions(page, { devices: [PIXEL] });
    await page.goto("/security");
    const box = await card(page).getByRole("button", { name: "Sign out Pixel 9" }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
  });
});
