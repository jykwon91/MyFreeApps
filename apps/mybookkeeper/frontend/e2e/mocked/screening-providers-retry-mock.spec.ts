/**
 * No-backend E2E for Retry on the screening provider options.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * When the providers failed to load, the grid used to say "Please refresh the
 * page" with nothing to press. It now offers Retry, keeps the message while the
 * retry is in flight, and shows the provider cards once they load.
 */
import { test, expect, type Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { failUntilRecovered } from "./fixtures/flakyEndpoint";
import { APPLICANT_DETAIL, APPLICANT_ID, SCREENING_ELIGIBLE, SCREENING_PROVIDERS } from "./fixtures/mockApplicant";

async function signIn(page: Page): Promise<void> {
  await plantAuth(page);
  // Registered first so the specific routes win; the page's other reads get an empty answer.
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}$`), (route) => route.fulfill(json(APPLICANT_DETAIL)));
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}/screening/eligibility$`), (route) =>
    route.fulfill(json(SCREENING_ELIGIBLE)),
  );
}

test("a failed provider load offers Retry and shows the providers once it succeeds", async ({ page }) => {
  await signIn(page);
  const load = await failUntilRecovered(
    page,
    new RegExp(`/api/applicants/${APPLICANT_ID}/screening/providers$`),
    SCREENING_PROVIDERS,
  );

  await page.goto(`/applicants/${APPLICANT_ID}`);
  const error = page.getByTestId("screening-providers-error");
  const retry = page.getByTestId("screening-providers-retry");
  await expect(error).toContainText("I couldn't load the provider options.");
  await expect(retry).toBeEnabled();

  load.recover();
  const before = load.loads();
  await retry.click();
  // One click, one request: the busy button can't double-fire.
  await expect.poll(load.loads).toBe(before + 1);

  await expect(retry).toBeDisabled();
  await expect(retry).toHaveText("Retrying...");
  await expect(page.getByTestId("screening-provider-grid-skeleton")).toHaveCount(0);

  load.release();
  await expect(page.getByTestId("screening-provider-grid")).toContainText("KeyCheck");
  await expect(error).toHaveCount(0);
  expect(load.loads()).toBe(before + 1);
});
