/**
 * No-backend E2E for what a screen reader is told on the practice screen. The
 * words the microphone is hearing and the microphone's label are never in a
 * live region (the reader would say them into the open microphone), nor is the
 * transcript (each streamed chunk would be read over the tutor's voice). One
 * live region, there from the start, says the answer went off and then reads
 * the finished reply once -- the same things the phone announces.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { createGate } from "@platform/ui/test-support/gate";
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { LEARNER_GREETING, TUTOR_GREETING } from "./constants/practiceText";
import { TYPING_ONLY_LABEL } from "./constants/practiceLabels";
import { GREETINGS } from "./fixtures/catalogFixtures";
import { openPractice, sendTyped, shownText } from "./fixtures/practiceScreen";
import { signedInTutor } from "./fixtures/signedInTutor";
import { hearSpeech } from "./fixtures/speechFakes";
import { completeTurn } from "./fixtures/turnEvents";

const LIVE_REGIONS = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';

/** The text of every live region on the page, which a screen reader reads as it changes. */
function liveTexts(page: Page): Promise<string[]> {
  return page.locator(LIVE_REGIONS).evaluateAll((regions) => regions.map((region) => region.textContent ?? ""));
}

function announcer(page: Page) {
  return page.getByTestId("practice-announcer");
}

test("while the microphone listens nothing it hears is read out; then the answer going off and the whole reply are, once", async ({ page }) => {
  const gate = createGate();
  const api = await signedInTutor(page, { holdTurns: gate, turns: [completeTurn({ reply: TUTOR_GREETING })] }, { recognition: true });

  try {
    await openPractice(page, GREETINGS.title);
    await expect(announcer(page)).toHaveText("");
    await page.getByRole("button", { name: VOICE_COPY.privacyContinue }).click();

    await expect(page.getByRole("button", { name: VOICE_COPY.micLabels.listening })).toBeVisible();
    await hearSpeech(page, LEARNER_GREETING, false);
    await expect(page.getByText(LEARNER_GREETING, { exact: true })).toBeVisible();
    const whileListening = await liveTexts(page);
    expect(whileListening.some((text) => text.includes(LEARNER_GREETING))).toBe(false);
    expect(whileListening.some((text) => text.includes(VOICE_COPY.micLabels.listening))).toBe(false);
    expect(whileListening.some((text) => text.includes(VOICE_COPY.listening))).toBe(false);

    await hearSpeech(page, LEARNER_GREETING, true);
    await page.getByRole("button", { name: VOICE_COPY.micLabels.listening }).click();
    await expect(announcer(page)).toHaveText(VOICE_COPY.micLabels.waiting);
    gate.release();

    await expect(shownText(page, TUTOR_GREETING)).toBeVisible();
    await expect(announcer(page)).toHaveText(TUTOR_GREETING);
    expect((await liveTexts(page)).filter((text) => text.includes(TUTOR_GREETING))).toEqual([TUTOR_GREETING]);
    expect(api.turnRequests.map((turn) => turn.body)).toEqual([{ text: LEARNER_GREETING }]);
  } finally {
    gate.release();
  }
});

test("typed practice reads the finished reply too, and nothing of the transcript itself is live", async ({ page }) => {
  await signedInTutor(page, { turns: [completeTurn({ reply: TUTOR_GREETING })] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING, TYPING_ONLY_LABEL);

  await expect(shownText(page, TUTOR_GREETING)).toBeVisible();
  await expect(announcer(page)).toHaveText(TUTOR_GREETING);
  expect((await liveTexts(page)).some((text) => text.includes(LEARNER_GREETING))).toBe(false);
  await expect(page.locator('[aria-live]:not([aria-live="off"])')).toHaveCount(1);
});
