/**
 * No-backend E2E for onboarding (/onboarding/language, /onboarding/level) and
 * "Change level": a new learner picks a language and a level, which is saved
 * with PUT /profile and lands them on their scenarios; a refused save says so
 * and keeps the choice so it can be sent again; Change level starts from the
 * saved level; a failed or empty language list says so.
 */
import { test, expect } from "@playwright/test";
import { LIST_LANGUAGES, SAVE_PROFILE } from "./constants/stubbedEndpoints";
import {
  LANGUAGE_STEP,
  LESSONS_LOAD_FAILED,
  LEVEL_LINE_BEGINNER,
  LEVEL_LINE_CONVERSATIONAL,
  LEVEL_LINE_SOME_PHRASES,
  LEVEL_QUESTION,
  LEVEL_STEP,
  NO_LANGUAGES,
  PROFILE_SAVE_FAILED,
} from "./constants/onboardingCopy";
import { signedInTutor } from "./fixtures/signedInTutor";
import { profileOf } from "./fixtures/tutorFixtures";

test("a new learner picks a language and a level, which is saved, and lands on their scenarios", async ({ page }) => {
  const api = await signedInTutor(page, { profile: null });

  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding\/language$/);
  await expect(page.getByText(LANGUAGE_STEP)).toBeVisible();
  await page.getByRole("link", { name: /Spanish\s*Latin American/ }).click();

  await expect(page).toHaveURL(/\/onboarding\/level\?language=es$/);
  await expect(page.getByText(LEVEL_STEP)).toBeVisible();
  const proceed = page.getByRole("button", { name: "Continue" });
  await expect(proceed).toBeDisabled();
  await page.getByRole("radio", { name: /^I know some phrases/ }).check();
  await proceed.click();

  await expect(page).toHaveURL(/\/scenarios$/);
  await expect(page.getByText(LEVEL_LINE_SOME_PHRASES)).toBeVisible();
  expect(api.writes).toEqual([{ method: "PUT", path: "/profile", body: { language_code: "es", level: "some_phrases" } }]);
});

test("a refused save says so, keeps the choice, and sending it again works", async ({ page }) => {
  const api = await signedInTutor(page, { profile: null, failWith: [SAVE_PROFILE] });

  await page.goto("/onboarding/level?language=es");
  await page.getByRole("radio", { name: /^Just starting/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(PROFILE_SAVE_FAILED)).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding\/level\?language=es$/);
  await expect(page.getByRole("radio", { name: /^Just starting/ })).toBeChecked();

  api.stopFailing(SAVE_PROFILE);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/scenarios$/);
  await expect(page.getByText(LEVEL_LINE_BEGINNER)).toBeVisible();
  expect(api.writes.map((write) => write.body)).toEqual([
    { language_code: "es", level: "beginner" },
    { language_code: "es", level: "beginner" },
  ]);
});

test("Change level starts from the saved level, saves the new one and shows it", async ({ page }) => {
  const api = await signedInTutor(page, { profile: profileOf({ level: "beginner" }) });

  await page.goto("/scenarios");
  await expect(page.getByText(LEVEL_LINE_BEGINNER)).toBeVisible();
  await page.getByRole("link", { name: "Change level" }).click();

  await expect(page.getByRole("heading", { name: LEVEL_QUESTION })).toBeVisible();
  await expect(page.getByText(LEVEL_STEP)).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /^Just starting/ })).toBeChecked();
  await page.getByRole("radio", { name: /^I can hold a conversation/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/scenarios$/);
  await expect(page.getByText(LEVEL_LINE_CONVERSATIONAL)).toBeVisible();
  expect(api.writes).toEqual([{ method: "PUT", path: "/profile", body: { language_code: "es", level: "conversational" } }]);
});

test("the level step without a language or a profile goes back to the language step", async ({ page }) => {
  await signedInTutor(page, { profile: null });

  await page.goto("/onboarding/level");
  await expect(page).toHaveURL(/\/onboarding\/language$/);
});

test("a failed language list says so, and Try again loads it", async ({ page }) => {
  const api = await signedInTutor(page, { profile: null, failWith: [LIST_LANGUAGES] });

  await page.goto("/onboarding/language");
  await expect(page.getByText(LESSONS_LOAD_FAILED)).toBeVisible();
  await expect(page.getByRole("link", { name: /Spanish/ })).toHaveCount(0);

  api.stopFailing(LIST_LANGUAGES);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("link", { name: /Spanish\s*Latin American/ })).toBeVisible();
});

test("an empty language list says none are available", async ({ page }) => {
  await signedInTutor(page, { profile: null, languages: [] });

  await page.goto("/onboarding/language");
  await expect(page.getByText(NO_LANGUAGES)).toBeVisible();
});
