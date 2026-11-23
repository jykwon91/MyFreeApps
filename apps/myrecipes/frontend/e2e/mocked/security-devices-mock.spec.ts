/**
 * No-backend E2E for the Security page's "Devices signed in" card: a phone signed in to the
 * account shows up here and can be signed out from the website. The card itself is shared
 * (@platform/ui SignedInDevices); MyJobHunter's spec covers its loading, empty and error states.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubDeviceSessions, testDevice } from "@platform/ui/test-support/deviceSessionsApi";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";

const PIXEL = testDevice("11111111-1111-1111-1111-111111111111", "Pixel 9", 3);

test("a phone signed in to the account can be signed out from Security", async ({ page }) => {
  await stubSignedInShell(page);
  const signedOut = await stubDeviceSessions(page, { devices: [PIXEL] });
  await page.goto("/security");

  const card = page.getByRole("region", { name: "Devices signed in" });
  await expect(card).toContainText("signed in to your MyRecipes account");
  await expect(card.getByRole("listitem")).toHaveCount(1);

  await card.getByRole("button", { name: "Sign out Pixel 9" }).click();
  await page.getByRole("dialog", { name: "Sign out Pixel 9?" }).getByRole("button", { name: "Sign out", exact: true }).click();

  await expect(toast(page, "Signed out Pixel 9. It may stay signed in for up to 30 minutes.")).toBeVisible();
  expect(signedOut).toEqual([PIXEL.id]);
  await expect(card.getByText("No phones signed in")).toBeVisible();
});
