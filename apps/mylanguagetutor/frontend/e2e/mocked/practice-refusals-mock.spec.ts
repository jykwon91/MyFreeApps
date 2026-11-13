/**
 * No-backend E2E for the ways a practice turn can fail, as the backend refuses
 * or cuts them off (app/api/turns.py): a session that couldn't start, a tutor
 * that fails mid-reply, a stream cut after the reply, the daily cap, an ended
 * session, the tutor switched off, the burst limiter, a turn already in flight,
 * a session deleted elsewhere, and a rejected token. Transient failures offer
 * Try again, which sends exactly what the learner said; blocks say why and stop
 * further turns; a rejected token signs the learner out.
 */
import { test, expect } from "@playwright/test";
import {
  DAILY_LIMIT_REACHED,
  RATE_LIMIT_GENERIC_DETAIL,
  SESSION_ENDED,
  SESSION_NOT_FOUND,
  SESSION_TURN_LIMIT,
  TURN_IN_PROGRESS,
  TUTOR_UNAVAILABLE,
  UNAUTHORIZED,
} from "./constants/refusalDetails";
import { DAILY_LIMIT_COPY, SESSION_ENDED_COPY, SESSION_LIMIT_COPY, UNAVAILABLE_COPY } from "./constants/blockCopy";
import { LEARNER_GREETING, PARTIAL_REPLY, TUTOR_GREETING } from "./constants/practiceText";
import { CORRECTIONS_MISSING, REPLY_CUT_OFF, TYPING_ONLY_LABEL } from "./constants/practiceLabels";
import { CREATE_SESSION } from "./constants/stubbedEndpoints";
import {
  RATE_LIMITED_COPY,
  SESSION_CREATE_FAILED_COPY,
  SESSION_NOT_FOUND_COPY,
  TURN_IN_PROGRESS_COPY,
  TUTOR_BUSY_COPY,
  TUTOR_INPUT_REJECTED_COPY,
} from "./constants/turnErrorCopy";
import { GREETINGS } from "./fixtures/catalogFixtures";
import { sessionIdAt } from "./fixtures/fixtureIds";
import { openPractice, sendTyped } from "./fixtures/practiceScreen";
import { signedInTutor } from "./fixtures/signedInTutor";
import { completeTurn, cutAfterReply, failedBeforeReply, failedMidReply, refusedTurn } from "./fixtures/turnEvents";
import { TUTOR_OFF } from "./fixtures/tutorFixtures";

test("a session that couldn't start says so, and Try again starts it and sends the same words", async ({ page }) => {
  const api = await signedInTutor(page, { failWith: [CREATE_SESSION], turns: [completeTurn({ reply: TUTOR_GREETING })] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByRole("alert")).toContainText(SESSION_CREATE_FAILED_COPY);
  // The words aren't left in the transcript as if they were sent.
  await expect(page.getByText(LEARNER_GREETING, { exact: true })).toHaveCount(0);
  expect(api.turnRequests).toEqual([]);

  api.stopFailing(CREATE_SESSION);
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(api.writes.filter((write) => write.path === "/sessions")).toHaveLength(2);
  expect(api.turnRequests.map((turn) => [turn.sessionId, turn.body])).toEqual([[sessionIdAt(1), { text: LEARNER_GREETING }]]);
});

test("a tutor that fails mid-reply keeps what arrived, marks it cut off, and Try again replaces it", async ({ page }) => {
  const api = await signedInTutor(page, {
    turns: [failedMidReply(PARTIAL_REPLY, "tutor_busy", true), completeTurn({ reply: TUTOR_GREETING })],
  });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByText(PARTIAL_REPLY, { exact: false })).toBeVisible();
  await expect(page.getByText(REPLY_CUT_OFF)).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(TUTOR_BUSY_COPY);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
  await expect(page.getByText(REPLY_CUT_OFF)).toHaveCount(0);
  await expect(page.getByText(LEARNER_GREETING, { exact: true })).toHaveCount(1);
  expect(api.turnRequests.map((turn) => turn.body)).toEqual([{ text: LEARNER_GREETING }, { text: LEARNER_GREETING }]);
});

test("a tutor that fails before any reply shows no reply, and Try again sends the same words in the same session", async ({ page }) => {
  const api = await signedInTutor(page, { turns: [failedBeforeReply("tutor_busy", true), completeTurn({ reply: TUTOR_GREETING })] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByRole("alert")).toContainText(TUTOR_BUSY_COPY);
  await expect(page.getByText(REPLY_CUT_OFF)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Replay", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
  await expect(page.getByText(LEARNER_GREETING, { exact: true })).toHaveCount(1);
  expect(api.turnRequests.map((turn) => [turn.sessionId, turn.body])).toEqual([
    [sessionIdAt(1), { text: LEARNER_GREETING }],
    [sessionIdAt(1), { text: LEARNER_GREETING }],
  ]);
});

test("a failure the tutor says not to retry offers only Dismiss", async ({ page }) => {
  await signedInTutor(page, { turns: [failedMidReply(PARTIAL_REPLY, "tutor_input_rejected", false)] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  const alert = page.getByRole("alert");
  await expect(alert).toContainText(TUTOR_INPUT_REJECTED_COPY);
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await alert.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toBeEnabled();
});

test("a stream cut after the whole reply keeps the reply, notes the missing suggestions, and isn't resent", async ({ page }) => {
  const api = await signedInTutor(page, { turns: [cutAfterReply(TUTOR_GREETING)] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
  await expect(page.getByText(CORRECTIONS_MISSING)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toBeEnabled();
  expect(api.turnRequests).toHaveLength(1);
});

test("the daily cap reached mid-conversation blocks further turns, with no way round it", async ({ page }) => {
  await signedInTutor(page, { turns: [refusedTurn(429, DAILY_LIMIT_REACHED)] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByText(DAILY_LIMIT_COPY)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Pick a scenario" })).toHaveCount(0);
  // A block replaces the composer: there is nothing left to answer with.
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toHaveCount(0);
});

for (const [detail, copy] of [
  [SESSION_ENDED, SESSION_ENDED_COPY],
  [SESSION_TURN_LIMIT, SESSION_LIMIT_COPY],
] as const) {
  test(`a 409 ${detail} says why and points to another scenario`, async ({ page }) => {
    await signedInTutor(page, { turns: [refusedTurn(409, detail)] });

    await openPractice(page, GREETINGS.title);
    await sendTyped(page, LEARNER_GREETING);

    await expect(page.getByText(copy)).toBeVisible();
    await page.getByRole("link", { name: "Pick a scenario" }).click();
    await expect(page).toHaveURL(/\/scenarios$/);
  });
}

test("a tutor switched off is announced on arrival, before the learner answers", async ({ page }) => {
  const api = await signedInTutor(page, { usage: TUTOR_OFF });

  await openPractice(page, GREETINGS.title);

  await expect(page.getByText(UNAVAILABLE_COPY)).toBeVisible();
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toHaveCount(0);
  expect(api.writes).toEqual([]);
});

test("a 503 tutor_unavailable on a turn blocks the conversation the same way", async ({ page }) => {
  await signedInTutor(page, { turns: [refusedTurn(503, TUTOR_UNAVAILABLE)] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByText(UNAVAILABLE_COPY)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

for (const [detail, copy] of [
  [RATE_LIMIT_GENERIC_DETAIL, RATE_LIMITED_COPY],
  [TURN_IN_PROGRESS, TURN_IN_PROGRESS_COPY],
] as const) {
  test(`a 429 "${detail}" asks the learner to wait, and Try again sends the same words`, async ({ page }) => {
    const api = await signedInTutor(page, { turns: [refusedTurn(429, detail), completeTurn({ reply: TUTOR_GREETING })] });

    await openPractice(page, GREETINGS.title);
    await sendTyped(page, LEARNER_GREETING);

    await expect(page.getByRole("alert")).toContainText(copy);
    await expect(page.getByText(LEARNER_GREETING, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Try again" }).click();

    await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
    expect(api.turnRequests.map((turn) => [turn.sessionId, turn.body])).toEqual([
      [sessionIdAt(1), { text: LEARNER_GREETING }],
      [sessionIdAt(1), { text: LEARNER_GREETING }],
    ]);
  });
}

test("a session deleted elsewhere (404) says so, and Try again starts a new session", async ({ page }) => {
  const api = await signedInTutor(page, { turns: [refusedTurn(404, SESSION_NOT_FOUND), completeTurn({ reply: TUTOR_GREETING })] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByRole("alert")).toContainText(SESSION_NOT_FOUND_COPY);
  await page.getByRole("button", { name: "Try again" }).click();

  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
  expect(api.writes.filter((write) => write.path === "/sessions")).toHaveLength(2);
  expect(api.turnRequests.map((turn) => turn.sessionId)).toEqual([sessionIdAt(1), sessionIdAt(2)]);
});

test("a rejected token (401) on a turn signs the learner out", async ({ page }) => {
  await signedInTutor(page, { turns: [refusedTurn(401, UNAUTHORIZED)] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => window.localStorage.getItem("token"))).toBeNull();
});
