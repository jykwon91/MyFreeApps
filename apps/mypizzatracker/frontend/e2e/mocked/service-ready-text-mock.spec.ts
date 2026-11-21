/**
 * No-backend E2E for the order-ready text on /service: when Twilio never
 * confirmed the text, the operator is warned it may already have reached the
 * customer and told to check Twilio's log, instead of being asked to text
 * them again by hand. A definite failure still asks them to text manually.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { toast } from "@platform/ui/test-support/toast";
import { stubDropsApi } from "./fixtures/stubDropsApi";
import { sampleDashboard } from "./fixtures/serviceFixtures";
import { stubServiceApi } from "./fixtures/stubServiceApi";
import type { ReadyTextAnswer } from "./types/ReadyTextAnswer";

const ANA_PHONE = "5125550101";

test.beforeEach(async ({ page }) => {
  await stubSignedInShell(page);
  await stubDropsApi(page);
});

async function markAnaReady(page: Page, readyText: ReadyTextAnswer): Promise<void> {
  await stubServiceApi(page, sampleDashboard(), readyText);
  await page.goto("/service");
  const order = page.getByRole("main").getByRole("region").nth(0).getByRole("listitem").filter({ hasText: "Ana Lopez" });
  await order.getByRole("button", { name: "-> Cooking" }).click();
  await expect(toast(page, "Moved to Cooking")).toBeVisible();
  await order.getByRole("button", { name: "-> Ready - text sent" }).click();
  await expect(toast(page, "Moved to Ready - text sent")).toBeVisible();
}

test("a ready text Twilio never confirmed warns it may already have been sent", async ({ page }) => {
  await markAnaReady(page, { sms_dispatched: false, sms_error: "timed out", sms_outcome_unknown: true });

  await expect(
    toast(
      page,
      `Twilio didn't confirm the ready text, so it may already have been sent. Check the Twilio message log before texting ${ANA_PHONE} yourself.`,
    ),
  ).toBeVisible();
  await expect(page.getByText(/SMS not sent/)).toHaveCount(0);
});

test("a ready text Twilio refused asks the operator to text the customer", async ({ page }) => {
  await markAnaReady(page, { sms_dispatched: false, sms_error: "recipient opted out", sms_outcome_unknown: false });

  await expect(toast(page, `SMS not sent (recipient opted out). Please text ${ANA_PHONE} manually.`)).toBeVisible();
});
