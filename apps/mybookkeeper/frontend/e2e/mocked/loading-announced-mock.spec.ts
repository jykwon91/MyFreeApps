/**
 * No-backend E2E: a page's loading placeholder is announced to screen readers.
 * While the listings load, the list region is busy and is followed by one polite
 * "Loading listings…" status, the skeleton blocks are hidden from assistive
 * tech, and once the list arrives the status and the busy region are gone.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { NO_LISTINGS, stubNoSignedLeases } from "./fixtures/emptyLists";

test("the listings loading placeholder is a busy region with one polite status", async ({ page }) => {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await stubNoSignedLeases(page);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/api\/listings(\?|$)/, async (route) => {
    await held;
    await route.fulfill(json(NO_LISTINGS));
  });

  await page.goto("/listings");

  const skeleton = page.getByTestId("listings-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("status").filter({ hasText: "Loading listings…" })).toHaveCount(1);
  const blocks = skeleton.locator(".animate-pulse");
  expect(await blocks.count()).toBeGreaterThan(0);
  expect(await blocks.evaluateAll((els) => els.every((el) => el.getAttribute("aria-hidden") === "true"))).toBe(true);

  release();
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Loading listings…" })).toHaveCount(0);
});
