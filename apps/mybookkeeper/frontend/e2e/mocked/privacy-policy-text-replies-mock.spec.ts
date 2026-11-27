/**
 * No-backend E2E: the Privacy Policy says what happens to a tenant's reply to a
 * rent reminder text. Twilio passes it on, it is emailed to the landlord whose
 * reminder went to that number, and MyBookkeeper doesn't keep it. It also says
 * how long the lookup code made from the number is kept, and what it is for.
 */
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";

/** A provider's entry under "Who we share your data with": its heading and paragraphs. */
function providerEntry(page: Page, name: string): Locator {
  return page.locator("section#who-we-share-with").getByRole("heading", { name, exact: true }).locator("..");
}

/** The paragraph right after a heading. */
function paragraphAfter(page: Page, name: string): Locator {
  return page.getByRole("heading", { name, exact: true }).locator("xpath=following-sibling::p[1]");
}

test.describe("Privacy Policy — tenants' replies to rent reminder texts", () => {
  test.beforeEach(async ({ page }) => {
    await stubUnmatchedApi(page, { answer: "empty" });
    await page.goto("/privacy");
  });

  test("the Twilio entry says where a reply goes and that it isn't kept", async ({ page }) => {
    const twilio = providerEntry(page, "Twilio (rent reminder texts)");

    await expect(twilio).toContainText(
      "If a tenant texts back within 120 days, Twilio passes the reply to us and we email it to the landlord whose reminder text went to that number.",
    );
    await expect(twilio).toContainText(
      "We don't keep the reply, and we never download pictures sent with it; Twilio keeps its own record of the message.",
    );
    await expect(twilio).toContainText("we keep a code made from each phone number a reminder text went to");
  });

  test("the landlord is told a tenant's reply comes to them", async ({ page }) => {
    await expect(paragraphAfter(page, "People you rent to")).toContainText(
      "If a tenant replies to a rent reminder text, we email the reply to you and don't store it.",
    );
  });

  test("how long the lookup codes are kept, and what they are used for", async ({ page }) => {
    const codes = page
      .locator("section#how-long")
      .getByRole("listitem")
      .filter({ hasText: "Reminder text lookup codes" });

    await expect(codes).toContainText("is kept with that reminder until you delete your account");
    await expect(codes).toContainText("only used to match tenants' replies to texts from the last 120 days");
  });
});
