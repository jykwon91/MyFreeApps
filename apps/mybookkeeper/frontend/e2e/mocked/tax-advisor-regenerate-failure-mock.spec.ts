/**
 * No-backend E2E for a failed "Regenerate" on a tax return that already has advice.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * A failed or rate-limited run used to show the skeleton and then fall back to the
 * older advice with no message, so the user took it for a fresh review. The panel
 * now says what happened above the older advice, the same as the phone, and the
 * next good run clears it.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { TAX_ADVISOR_CTA_MESSAGES } from "@mybookkeeper/api-client/constants/taxAdvisor";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { TAX_RETURN_ID, stubTaxReturnDetail } from "./fixtures/mockTaxReturn";

const advice = (title: string) => ({
  suggestions: [
    {
      id: "sug-1",
      db_id: "db-sug-1",
      status: "active",
      status_changed_at: null,
      generation_id: "gen-1",
      category: "deductions",
      title,
      description: "Your rental property may qualify for more depreciation.",
      severity: "high",
      confidence: "high",
      action: "Compare your depreciation schedule.",
      estimated_savings: 2500,
      irs_reference: null,
      affected_form: "Schedule E",
      affected_properties: [],
    },
  ],
  disclaimer: "Not tax advice.",
  generated_at: "2026-01-05T00:00:00Z",
  model_version: null,
});

const OLD_TITLE = "Review rental depreciation";
const NEW_TITLE = "Fresh advice after a good run";

async function openReturn(page: Page, generateStatuses: number[]): Promise<void> {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await stubTaxReturnDetail(page);
  await page.route(new RegExp(`/api/tax-returns/${TAX_RETURN_ID}/forms-overview$`), (route) =>
    route.fulfill(json([{ form_name: "schedule_e", instance_count: 1, field_count: 3 }])),
  );
  // Saved advice: a good run replaces it, a failed one leaves it as it was.
  let saved = OLD_TITLE;
  await page.route(new RegExp(`/api/tax-returns/${TAX_RETURN_ID}/advisor$`), (route) =>
    route.fulfill(json(advice(saved))),
  );
  let call = 0;
  await page.route(new RegExp(`/api/tax-returns/${TAX_RETURN_ID}/advisor/generate$`), (route) => {
    const status = generateStatuses[Math.min(call++, generateStatuses.length - 1)];
    if (status !== 200) return route.fulfill(json({ detail: "failed" }, status));
    saved = NEW_TITLE;
    return route.fulfill(json(advice(NEW_TITLE)));
  });
  await page.goto(`/tax-returns/${TAX_RETURN_ID}`);
  await expect(page.getByText(OLD_TITLE)).toBeVisible();
}

test("a failed regenerate says so, keeps the older advice, and a good run clears the message", async ({ page }) => {
  await openReturn(page, [500, 200]);

  await page.getByRole("button", { name: /Regenerate/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: TAX_ADVISOR_CTA_MESSAGES.error })).toBeVisible();
  await expect(page.getByText(OLD_TITLE)).toBeVisible();

  await page.getByRole("button", { name: /Regenerate/ }).click();
  await expect(page.getByText(NEW_TITLE)).toBeVisible();
  await expect(page.getByText(TAX_ADVISOR_CTA_MESSAGES.error)).toHaveCount(0);
});

test("a rate-limited regenerate says to check back tomorrow and keeps the older advice", async ({ page }) => {
  await openReturn(page, [429]);

  await page.getByRole("button", { name: /Regenerate/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: TAX_ADVISOR_CTA_MESSAGES["rate-limited"] })).toBeVisible();
  await expect(page.getByText(OLD_TITLE)).toBeVisible();
  await expect(page.getByRole("button", { name: /Regenerate/ })).toHaveCount(0);
});
