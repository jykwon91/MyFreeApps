/**
 * No-backend E2E: double-clicking Confirm on an applicant stage change sends
 * one request, and the picker is locked while it saves.
 *
 * Runs under playwright.layout.config.ts with the API fully mocked.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { stubNoSignedLeases } from "./fixtures/emptyLists";
import { APPLICANT_DETAIL, APPLICANT_ID, SCREENING_ELIGIBLE, SCREENING_PROVIDERS } from "./fixtures/mockApplicant";

const SAVE_RESPONSE_DELAY_MS = 1500;

async function stubStageChange(page: Page, requests: string[]): Promise<void> {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await stubNoSignedLeases(page);
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}$`), (route) => route.fulfill(json(APPLICANT_DETAIL)));
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}/screening/eligibility$`), (route) =>
    route.fulfill(json(SCREENING_ELIGIBLE)),
  );
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}/screening/providers$`), (route) =>
    route.fulfill(json(SCREENING_PROVIDERS)),
  );
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}/stage$`), async (route, request) => {
    requests.push(request.postData() ?? "");
    await new Promise((resolve) => setTimeout(resolve, SAVE_RESPONSE_DELAY_MS));
    await route.fulfill(json({ ...APPLICANT_DETAIL, stage: "lease_sent" }));
  });
}

test("a double-clicked Confirm sends one stage change and locks the form while saving", async ({ page }) => {
  const requests: string[] = [];
  await stubStageChange(page, requests);

  await page.goto(`/applicants/${APPLICANT_ID}`);
  await page.getByTestId("applicant-status-control-trigger").click();
  await page.getByTestId("applicant-status-stage-select").selectOption("lease_sent");

  await page.getByTestId("applicant-status-confirm").dblclick();

  await expect(page.getByTestId("applicant-status-confirm")).toBeDisabled();
  await expect(page.getByTestId("applicant-status-stage-select")).toBeDisabled();
  await expect(page.getByTestId("applicant-status-popover")).toBeHidden({ timeout: 10000 });
  expect(requests).toHaveLength(1);
});
