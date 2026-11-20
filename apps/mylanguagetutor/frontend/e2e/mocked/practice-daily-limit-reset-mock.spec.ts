/**
 * No-backend E2E for a learner who hits the daily cap and keeps the practice
 * page open past the reset (00:00 UTC): the block stays while usage from the
 * same day still answers, and lifts once the page comes back to the
 * foreground after the reset and usage shows budget again, so the learner can
 * answer without leaving the page.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { DAILY_LIMIT_REACHED } from "./constants/refusalDetails";
import { BEFORE_RESET, DAILY_LIMIT_AFTER_RESET_COPY, DAILY_LIMIT_COPY, LEARNER_TIME_ZONE } from "./constants/blockCopy";
import { LEARNER_GREETING, TUTOR_GREETING } from "./constants/practiceText";
import { TYPING_ONLY_LABEL } from "./constants/practiceLabels";
import { GREETINGS } from "./fixtures/catalogFixtures";
import { openPractice, sendTyped } from "./fixtures/practiceScreen";
import { signedInTutor } from "./fixtures/signedInTutor";
import { completeTurn, refusedTurn } from "./fixtures/turnEvents";
import { CAP_REACHED } from "./fixtures/tutorFixtures";

const USAGE_PATH = "/usage/today";
/** From BEFORE_RESET (15:00 UTC) to just past the next 00:00 UTC. */
const PAST_RESET = "09:01:00";

test.use({ timezoneId: LEARNER_TIME_ZONE });

test("the daily-cap block lifts when the learner comes back after the reset and usage shows budget again", async ({ page }) => {
  await page.clock.install({ time: BEFORE_RESET });
  const api = await signedInTutor(page, {
    turns: [refusedTurn(429, DAILY_LIMIT_REACHED), completeTurn({ reply: TUTOR_GREETING })],
  });
  const usageReads = () => api.reads.filter((read) => read === USAGE_PATH).length;

  await openPractice(page, GREETINGS.title);
  const readsBeforeTurn = usageReads();
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByText(DAILY_LIMIT_COPY, { exact: true })).toBeVisible();
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toHaveCount(0);
  // The refusal refreshes usage. Its estimate is for the cheapest turn, so it may still say a turn
  // fits: the block stays until the day's budget resets.
  await expect.poll(usageReads).toBeGreaterThan(readsBeforeTurn);
  await expect(page.getByText(DAILY_LIMIT_COPY, { exact: true })).toBeVisible();

  await page.clock.fastForward(PAST_RESET);
  const readsBeforeReturn = usageReads();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(usageReads).toBeGreaterThan(readsBeforeReturn);

  await expect(page.getByText(DAILY_LIMIT_COPY, { exact: true })).toHaveCount(0);
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toBeEnabled();
  await sendTyped(page, LEARNER_GREETING);
  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
  expect(api.turnRequests).toHaveLength(2);
});

test("after the reset, usage that still says the budget is spent keeps the block", async ({ page }) => {
  await page.clock.install({ time: BEFORE_RESET });
  const api = await signedInTutor(page, { turns: [refusedTurn(429, DAILY_LIMIT_REACHED)] });
  const usageReads = () => api.reads.filter((read) => read === USAGE_PATH).length;

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);
  await expect(page.getByText(DAILY_LIMIT_COPY, { exact: true })).toBeVisible();

  api.setUsage(CAP_REACHED);
  await page.clock.fastForward(PAST_RESET);
  const readsBeforeReturn = usageReads();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(usageReads).toBeGreaterThan(readsBeforeReturn);

  await expect(page.getByText(DAILY_LIMIT_AFTER_RESET_COPY, { exact: true })).toBeVisible();
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toHaveCount(0);
  expect(api.turnRequests).toHaveLength(1);
});
