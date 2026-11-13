/**
 * No-backend E2E for the practice conversation on its typed path (no
 * microphone): the first answer starts a session (POST /sessions) and streams
 * a turn (POST /sessions/{id}/turns, SSE) with the signed-in token; while the
 * tutor thinks the composer is busy; the reply is shown and spoken sentence by
 * sentence, can be replayed (normal and slow) and translated; corrections and
 * the "say it again" prompt appear; later turns reuse the session; goals tick
 * off and a finished scenario says so. In a browser that can recognise speech,
 * "Type instead" switches to typing without ever starting the microphone.
 */
import { test, expect } from "@playwright/test";
import { createGate } from "@platform/ui/test-support/gate";
import { NORMAL_RATE, SLOW_RATE } from "@mylanguagetutor/api-client/constants/speechRates";
import { practicePath } from "@mylanguagetutor/api-client/utils/practicePath";
import {
  DEFAULT_REPLY,
  LEARNER_FOLLOW_UP,
  LEARNER_GREETING,
  LEARNER_WITH_MISTAKE,
  RETRY_PROMPT,
  TUTOR_GREETING,
  TUTOR_GREETING_SENTENCES,
  TUTOR_GREETING_TRANSLATION,
  TUTOR_NAME_REPLY,
} from "./constants/practiceText";
import {
  GOAL_MET,
  GOAL_PENDING,
  GOALS_LABEL,
  PRIVACY_HEADING,
  RECAST_LINE,
  SCENARIO_COMPLETE,
  SCENARIO_NOT_FOUND,
  START_PROMPT,
  SUGGESTIONS_LABEL,
  TUTOR_THINKING,
  TYPE_YOUR_ANSWER_LABEL,
  TYPING_ONLY_LABEL,
  TYPING_ONLY_NOTICE,
} from "./constants/practiceLabels";
import { FREE_TALK, GREETINGS } from "./fixtures/catalogFixtures";
import { sessionIdAt } from "./fixtures/fixtureIds";
import { goal, openPractice, sendTyped } from "./fixtures/practiceScreen";
import { signedInTutor } from "./fixtures/signedInTutor";
import { recognitionStarts, spokenUtterances } from "./fixtures/speechFakes";
import { completeTurn } from "./fixtures/turnEvents";
import { correctionOf } from "./fixtures/tutorFixtures";

test("the first typed answer starts a session, streams the reply, and speaks it sentence by sentence", async ({ page }) => {
  const gate = createGate();
  const api = await signedInTutor(page, {
    holdTurns: gate,
    turns: [completeTurn({ reply: TUTOR_GREETING, translation: TUTOR_GREETING_TRANSLATION, goalsMet: [0] })],
  });

  try {
    await openPractice(page, GREETINGS.title);
    await expect(page.getByText(START_PROMPT)).toBeVisible();
    await expect(page.getByText(TYPING_ONLY_NOTICE, { exact: false })).toBeVisible();
    const send = page.getByRole("button", { name: "Send", exact: true });
    await expect(send).toBeDisabled();
    await expect(goal(page, GREETINGS.goals[0])).toContainText(GOAL_PENDING);

    await sendTyped(page, `  ${LEARNER_GREETING} `);

    // The turn is held: the learner's words show, the tutor is thinking, and nothing can be sent.
    await expect(page.getByText(LEARNER_GREETING, { exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: TUTOR_THINKING })).toBeVisible();
    await expect(page.getByLabel(TYPING_ONLY_LABEL)).toBeDisabled();
    await expect(page.getByLabel(TYPING_ONLY_LABEL)).toHaveValue("");
    await expect(page.getByRole("button", { name: /Sending/ })).toBeDisabled();
    gate.release();

    await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
    await expect(page.getByRole("status", { name: TUTOR_THINKING })).toHaveCount(0);
    await expect(page.getByLabel(TYPING_ONLY_LABEL)).toBeEnabled();
    await expect(goal(page, GREETINGS.goals[0])).toContainText(GOAL_MET);
    await expect(goal(page, GREETINGS.goals[1])).toContainText(GOAL_PENDING);

    expect(api.writes).toEqual([
      { method: "POST", path: "/sessions", body: { language_code: "es", scenario_slug: GREETINGS.slug, level: "beginner" } },
    ]);
    const token = await page.evaluate(() => window.localStorage.getItem("token"));
    expect(api.turnRequests).toEqual([{ sessionId: sessionIdAt(1), body: { text: LEARNER_GREETING }, authorization: `Bearer ${token}` }]);
    await expect.poll(() => spokenUtterances(page)).toEqual(
      TUTOR_GREETING_SENTENCES.map((text) => ({ text, lang: "es-MX", rate: NORMAL_RATE })),
    );
  } finally {
    gate.release();
  }
});

test("a reply can be replayed at the normal pace and slowly, and its translation shown and hidden", async ({ page }) => {
  await signedInTutor(page, { turns: [completeTurn({ reply: TUTOR_GREETING, translation: TUTOR_GREETING_TRANSLATION })] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);
  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
  await expect.poll(async () => (await spokenUtterances(page)).length).toBe(TUTOR_GREETING_SENTENCES.length);

  const translation = page.getByText(TUTOR_GREETING_TRANSLATION, { exact: true });
  await expect(translation).toBeHidden();
  await page.getByRole("button", { name: "Show translation" }).click();
  await expect(translation).toBeVisible();
  await page.getByRole("button", { name: "Hide translation" }).click();
  await expect(translation).toBeHidden();

  await page.getByRole("button", { name: "Slow", exact: true }).click();
  await page.getByRole("button", { name: "Replay", exact: true }).click();
  await expect.poll(async () => (await spokenUtterances(page)).slice(TUTOR_GREETING_SENTENCES.length)).toEqual([
    ...TUTOR_GREETING_SENTENCES.map((text) => ({ text, lang: "es-MX", rate: SLOW_RATE })),
    ...TUTOR_GREETING_SENTENCES.map((text) => ({ text, lang: "es-MX", rate: NORMAL_RATE })),
  ]);
});

test("corrections and the say-it-again prompt follow the reply; later turns reuse the session", async ({ page }) => {
  const api = await signedInTutor(page, {
    turns: [
      completeTurn({ reply: TUTOR_GREETING, corrections: [correctionOf()], retryPrompt: RETRY_PROMPT, goalsMet: [0] }),
      completeTurn({ reply: TUTOR_NAME_REPLY, goalsMet: [0, 1] }),
    ],
  });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_WITH_MISTAKE);

  const suggestions = page.getByRole("list", { name: SUGGESTIONS_LABEL });
  await expect(suggestions).toContainText(RECAST_LINE);
  await expect(suggestions).toContainText(correctionOf().explanation);
  await expect(page.getByText(RETRY_PROMPT)).toBeVisible();

  // "Try it" puts the learner back in the answer box (typing has no microphone to open).
  await page.getByRole("button", { name: "Try it" }).click();
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toBeFocused();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(page.getByText(RETRY_PROMPT)).toHaveCount(0);

  await sendTyped(page, LEARNER_FOLLOW_UP);
  await expect(page.getByText(TUTOR_NAME_REPLY, { exact: true })).toBeVisible();
  await expect(goal(page, GREETINGS.goals[1])).toContainText(GOAL_MET);
  // The first exchange stays in the transcript above the new one.
  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();

  expect(api.writes.filter((write) => write.path === "/sessions")).toHaveLength(1);
  expect(api.turnRequests.map((turn) => [turn.sessionId, turn.body])).toEqual([
    [sessionIdAt(1), { text: LEARNER_WITH_MISTAKE }],
    [sessionIdAt(1), { text: LEARNER_FOLLOW_UP }],
  ]);
});

test("covering every goal says the scenario is complete; the learner can keep talking or move on", async ({ page }) => {
  await signedInTutor(page, { turns: [completeTurn({ reply: TUTOR_NAME_REPLY, goalsMet: [0, 1, 2], complete: true })] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_FOLLOW_UP);

  await expect(page.getByText(SCENARIO_COMPLETE)).toBeVisible();
  await page.getByRole("button", { name: "Keep talking" }).click();
  await expect(page.getByText(SCENARIO_COMPLETE)).toHaveCount(0);
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toBeEnabled();
});

test("Next scenario on the complete banner returns to the path", async ({ page }) => {
  await signedInTutor(page, { turns: [completeTurn({ reply: TUTOR_NAME_REPLY, goalsMet: [0, 1, 2], complete: true })] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_FOLLOW_UP);
  await page.getByRole("link", { name: "Next scenario" }).click();

  await expect(page).toHaveURL(/\/scenarios$/);
});

test("a scenario with no goals shows none and still converses", async ({ page }) => {
  await signedInTutor(page);

  await openPractice(page, FREE_TALK.title);
  await expect(page.getByRole("list", { name: GOALS_LABEL })).toHaveCount(0);
  await sendTyped(page, LEARNER_GREETING);
  await expect(page.getByText(DEFAULT_REPLY, { exact: true })).toBeVisible();
});

test.describe("in a browser that can recognise speech", () => {
  test("Type instead skips the microphone notice and sends typed answers; the microphone is never started", async ({ page }) => {
    const api = await signedInTutor(page, { turns: [completeTurn({ reply: TUTOR_GREETING })] }, { recognition: true });

    await openPractice(page, GREETINGS.title);
    await expect(page.getByRole("heading", { name: PRIVACY_HEADING })).toBeVisible();
    await expect(page.getByLabel(TYPE_YOUR_ANSWER_LABEL)).toHaveCount(0);
    await page.getByRole("button", { name: "Type instead" }).click();

    await expect(page.getByRole("heading", { name: PRIVACY_HEADING })).toHaveCount(0);
    await expect(page.getByText(TYPING_ONLY_NOTICE, { exact: false })).toHaveCount(0);
    await sendTyped(page, LEARNER_GREETING, TYPE_YOUR_ANSWER_LABEL);
    await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
    expect(api.turnRequests.map((turn) => turn.body)).toEqual([{ text: LEARNER_GREETING }]);

    // Back to voice: the notice shows again (it hasn't been accepted), and nothing has listened.
    await page.getByRole("button", { name: "Use the microphone" }).click();
    await expect(page.getByRole("heading", { name: PRIVACY_HEADING })).toBeVisible();
    expect(await recognitionStarts(page)).toBe(0);
  });
});

test("a link to an unknown scenario says so and offers the list", async ({ page }) => {
  await signedInTutor(page);

  await page.goto(practicePath("not-a-scenario"));
  await expect(page.getByRole("heading", { name: SCENARIO_NOT_FOUND })).toBeVisible();
  await page.getByRole("button", { name: "See scenarios" }).click();
  await expect(page).toHaveURL(/\/scenarios$/);
});

test("practice without a scenario goes to the list", async ({ page }) => {
  await signedInTutor(page);

  await page.goto("/practice");
  await expect(page).toHaveURL(/\/scenarios$/);
});
