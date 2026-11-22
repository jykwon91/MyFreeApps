/**
 * No-backend E2E for a conversation that is already under way when the browser
 * tab comes back to the foreground and the lesson lists are reloaded: if that
 * reload fails, the learner keeps the conversation and what they have said,
 * rather than being thrown out to a "couldn't load" message. The same goes for
 * a failed reload of the learner's profile.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { LESSONS_LOAD_FAILED } from "./constants/onboardingCopy";
import { LEARNER_GREETING, TUTOR_GREETING } from "./constants/practiceText";
import { GET_PROFILE, LIST_LANGUAGES, LIST_SCENARIOS } from "./constants/stubbedEndpoints";
import { GREETINGS } from "./fixtures/catalogFixtures";
import { openPractice, sendTyped, shownText } from "./fixtures/practiceScreen";
import { signedInTutor } from "./fixtures/signedInTutor";
import { completeTurn } from "./fixtures/turnEvents";

test("a failed reload of the lessons, on coming back to the tab, leaves the conversation as it was", async ({ page }) => {
  const api = await signedInTutor(page, { turns: [completeTurn({ reply: TUTOR_GREETING })] });
  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);
  await expect(shownText(page, TUTOR_GREETING)).toBeVisible();

  api.startFailing(LIST_LANGUAGES);
  api.startFailing(LIST_SCENARIOS);
  const readsBefore = api.reads.length;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => api.reads.slice(readsBefore).filter((read) => read.startsWith("/scenarios")).length).toBeGreaterThan(0);

  await expect(page.getByText(LESSONS_LOAD_FAILED)).toHaveCount(0);
  await expect(page.getByText(LEARNER_GREETING, { exact: true })).toBeVisible();
  await expect(shownText(page, TUTOR_GREETING)).toBeVisible();
});

test("a failed reload of the profile, on coming back to the tab, leaves the conversation as it was", async ({ page }) => {
  const api = await signedInTutor(page, { turns: [completeTurn({ reply: TUTOR_GREETING })] });
  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);
  await expect(shownText(page, TUTOR_GREETING)).toBeVisible();

  api.startFailing(GET_PROFILE);
  const readsBefore = api.reads.length;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => api.reads.slice(readsBefore).filter((read) => read.startsWith("/profile")).length).toBeGreaterThan(0);

  await expect(page.getByText(LESSONS_LOAD_FAILED)).toHaveCount(0);
  await expect(page.getByText(LEARNER_GREETING, { exact: true })).toBeVisible();
  await expect(shownText(page, TUTOR_GREETING)).toBeVisible();
});
