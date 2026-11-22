/**
 * No-backend E2E for a lesson list that is already on screen when a reload
 * fails (the tab regains focus while the network or server is down): the
 * learner keeps the list under a notice with Try again, rather than being
 * thrown out to a "couldn't load" message. Try again brings back a clean list.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { LESSONS_LOAD_FAILED } from "./constants/onboardingCopy";
import { LIST_LANGUAGES, LIST_SCENARIOS } from "./constants/stubbedEndpoints";
import { signedInTutor } from "./fixtures/signedInTutor";

const STALE_NOTICE = "You're offline, or I can't reach the server. This is what I last loaded.";

test("a failed reload of the scenarios keeps the list under a notice, and Try again clears it", async ({ page }) => {
  const api = await signedInTutor(page);
  await page.goto("/scenarios");
  await expect(page.getByRole("link", { name: /Greetings/ })).toBeVisible();

  api.startFailing(LIST_SCENARIOS);
  const readsBefore = api.reads.length;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => api.reads.slice(readsBefore).filter((read) => read.startsWith("/scenarios")).length).toBeGreaterThan(0);

  await expect(page.getByText(STALE_NOTICE)).toBeVisible();
  await expect(page.getByText(LESSONS_LOAD_FAILED)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Greetings/ })).toBeVisible();

  api.stopFailing(LIST_SCENARIOS);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(STALE_NOTICE)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Greetings/ })).toBeVisible();
});

test("a failed reload of the languages keeps the list under a notice, and Try again clears it", async ({ page }) => {
  const api = await signedInTutor(page, { profile: null });
  await page.goto("/onboarding/language");
  await expect(page.getByRole("link", { name: /Spanish/ })).toBeVisible();

  api.startFailing(LIST_LANGUAGES);
  const readsBefore = api.reads.length;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => api.reads.slice(readsBefore).filter((read) => read.startsWith("/languages")).length).toBeGreaterThan(0);

  await expect(page.getByText(STALE_NOTICE)).toBeVisible();
  await expect(page.getByText(LESSONS_LOAD_FAILED)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Spanish/ })).toBeVisible();

  api.stopFailing(LIST_LANGUAGES);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(STALE_NOTICE)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Spanish/ })).toBeVisible();
});
