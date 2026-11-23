/**
 * No-backend E2E for the ways a practice turn can fail, as the backend refuses
 * or cuts them off (app/api/turns.py): a session that couldn't start, a tutor
 * that fails mid-reply, a stream cut after the reply, the daily cap, an ended
 * session, the tutor switched off, the burst limiter, a turn already in flight,
 * a session deleted elsewhere, a rejected token, and a turn the server never
 * answers. Transient failures offer
 * Try again, which sends exactly what the learner said; blocks say why and stop
 * further turns (every refusal that blocks keeps the learner's answer on screen, and a daily-cap or
 * tutor-unavailable one lets Try again send it once the block lifts); a
 * rejected token signs the learner out.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { createGate } from "@platform/ui/test-support/gate";
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
import { AFTER_RESET, BEFORE_RESET, DAILY_LIMIT_AFTER_RESET_COPY, DAILY_LIMIT_COPY, LEARNER_TIME_ZONE, SESSION_ENDED_COPY, SESSION_LIMIT_COPY, UNAVAILABLE_COPY } from "./constants/blockCopy";
import { LEARNER_FOLLOW_UP, LEARNER_GREETING, PARTIAL_REPLY, TUTOR_GREETING, TUTOR_NAME_REPLY } from "./constants/practiceText";
import { CORRECTIONS_MISSING, GOAL_MET, RECAST_LINE, REPLY_CUT_OFF, SUGGESTIONS_LABEL, TYPING_ONLY_LABEL } from "./constants/practiceLabels";
import { CREATE_SESSION } from "./constants/stubbedEndpoints";
import { TURN_RESPONSE_TIMEOUT_MS } from "@mylanguagetutor/api-client/constants/turnRequest";
import {
  CONNECTION_LOST_COPY,
  DAILY_LIMIT_KEPT_COPY,
  RATE_LIMITED_COPY,
  SESSION_CREATE_FAILED_COPY,
  SESSION_NOT_FOUND_COPY,
  TURN_IN_PROGRESS_COPY,
  TUTOR_BUSY_COPY,
  TUTOR_INPUT_REJECTED_COPY,
  TUTOR_UNAVAILABLE_KEPT_COPY,
} from "./constants/turnErrorCopy";
import { GREETINGS } from "./fixtures/catalogFixtures";
import { sessionIdAt } from "./fixtures/fixtureIds";
import { goal, openPractice, sendTyped } from "./fixtures/practiceScreen";
import { signedInTutor } from "./fixtures/signedInTutor";
import { completeTurn, cutAfterCorrections, cutAfterReply, failedBeforeReply, failedMidReply, refusedTurn, unansweredTurn } from "./fixtures/turnEvents";
import { PLENTY_LEFT, SESSION_FULL, TUTOR_OFF, correctionOf } from "./fixtures/tutorFixtures";

test.use({ timezoneId: LEARNER_TIME_ZONE });

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

test("a turn the server never answers says the connection dropped, and Try again sends the same words", async ({ page }) => {
  await page.clock.install();
  const api = await signedInTutor(page, { turns: [unansweredTurn(), completeTurn({ reply: TUTOR_GREETING })] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);
  await expect(page.getByRole("button", { name: /Sending/ })).toBeDisabled();

  await page.clock.runFor(TURN_RESPONSE_TIMEOUT_MS);
  await expect(page.getByRole("alert")).toContainText(CONNECTION_LOST_COPY);
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toBeEnabled();

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(LEARNER_GREETING, { exact: true })).toHaveCount(1);
  expect(api.turnRequests.map((turn) => turn.body)).toEqual([{ text: LEARNER_GREETING }, { text: LEARNER_GREETING }]);
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

test("a goal met in a turn whose stream was cut after the reply is ticked once the next reply's suggestions arrive", async ({ page }) => {
  // The server finishes a turn whose whole reply went out even after the connection drops, so the
  // next turn's suggestions carry the goal that turn met along with the new one.
  const api = await signedInTutor(page, {
    turns: [cutAfterReply(TUTOR_GREETING), completeTurn({ reply: TUTOR_NAME_REPLY, goalsMet: [0, 1] })],
  });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);
  await expect(page.getByText(CORRECTIONS_MISSING)).toBeVisible();
  await expect(goal(page, GREETINGS.goals[0])).not.toContainText(GOAL_MET);

  await sendTyped(page, LEARNER_FOLLOW_UP);
  await expect(page.getByText(TUTOR_NAME_REPLY, { exact: true })).toBeVisible();
  await expect(goal(page, GREETINGS.goals[0])).toContainText(GOAL_MET);
  await expect(goal(page, GREETINGS.goals[1])).toContainText(GOAL_MET);
  await expect(goal(page, GREETINGS.goals[2])).not.toContainText(GOAL_MET);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(api.turnRequests).toHaveLength(2);
});

test("a stream cut after the suggestions arrived shows them, with no missing-suggestions note, and isn't resent", async ({ page }) => {
  const api = await signedInTutor(page, {
    turns: [cutAfterCorrections({ reply: TUTOR_GREETING, corrections: [correctionOf()], goalsMet: [0] })],
  });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: SUGGESTIONS_LABEL })).toContainText(RECAST_LINE);
  await expect(goal(page, GREETINGS.goals[0])).toContainText(GOAL_MET);
  await expect(page.getByText(CORRECTIONS_MISSING)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toBeEnabled();
  expect(api.turnRequests).toHaveLength(1);
});

for (const [label, now, copy] of [
  ["before", BEFORE_RESET, DAILY_LIMIT_COPY],
  ["after", AFTER_RESET, DAILY_LIMIT_AFTER_RESET_COPY],
] as const) {
  test(`the daily cap reached mid-conversation (${label} the day's reset hour) blocks further turns, with no way round it, keeping the refused answer`, async ({ page }) => {
    await page.clock.setFixedTime(now);
    await signedInTutor(page, { turns: [refusedTurn(429, DAILY_LIMIT_REACHED)] });

    await openPractice(page, GREETINGS.title);
    await sendTyped(page, LEARNER_GREETING);

    await expect(page.getByText(copy, { exact: true })).toBeVisible();
    // The refused answer stays on screen, and says why it wasn't sent; it can't be sent again yet.
    await expect(page.getByText(LEARNER_GREETING, { exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(DAILY_LIMIT_KEPT_COPY);
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Pick a scenario" })).toHaveCount(0);
    // A block replaces the composer: there is nothing left to answer with.
    await expect(page.getByLabel(TYPING_ONLY_LABEL)).toHaveCount(0);
  });
}

for (const [detail, copy] of [
  [SESSION_ENDED, SESSION_ENDED_COPY],
  [SESSION_TURN_LIMIT, SESSION_LIMIT_COPY],
] as const) {
  test(`a 409 ${detail} says why and points to another scenario`, async ({ page }) => {
    await signedInTutor(page, { turns: [refusedTurn(409, detail)] });

    await openPractice(page, GREETINGS.title);
    await sendTyped(page, LEARNER_GREETING);

    await expect(page.getByText(copy)).toBeVisible();
    // The refused answer stays on screen; nothing can send it in this conversation.
    await expect(page.getByText(LEARNER_GREETING, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
    await page.getByRole("link", { name: "Pick a scenario" }).click();
    await expect(page).toHaveURL(/\/scenarios$/);
  });
}

test("a conversation that used its last turn says so before the learner speaks again", async ({ page }) => {
  const api = await signedInTutor(page, { turns: [completeTurn({ reply: TUTOR_GREETING })] });

  await openPractice(page, GREETINGS.title);
  api.setUsage(SESSION_FULL);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByText(SESSION_LIMIT_COPY)).toBeVisible();
  // The finished turn stays, and nothing is left to answer with.
  await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(api.turnRequests).toHaveLength(1);
});

test("a turn refused for the turn limit in a race keeps the learner's answer on screen", async ({ page }) => {
  await signedInTutor(page, { turns: [refusedTurn(409, SESSION_TURN_LIMIT)] });

  await openPractice(page, GREETINGS.title);
  await sendTyped(page, LEARNER_GREETING);

  await expect(page.getByText(SESSION_LIMIT_COPY)).toBeVisible();
  await expect(page.getByText(LEARNER_GREETING, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toHaveCount(0);
});

test("a tutor switched off is announced on arrival, before the learner answers", async ({ page }) => {
  const api = await signedInTutor(page, { usage: TUTOR_OFF });

  await openPractice(page, GREETINGS.title);

  await expect(page.getByText(UNAVAILABLE_COPY)).toBeVisible();
  await expect(page.getByLabel(TYPING_ONLY_LABEL)).toHaveCount(0);
  expect(api.writes).toEqual([]);
});

test("a 503 tutor_unavailable on a turn blocks the conversation, keeps the answer, and Try again sends it once the tutor is back", async ({ page }) => {
  const gate = createGate();
  const api = await signedInTutor(page, {
    holdTurns: gate,
    turns: [refusedTurn(503, TUTOR_UNAVAILABLE), completeTurn({ reply: TUTOR_GREETING })],
  });

  try {
    await openPractice(page, GREETINGS.title);
    await sendTyped(page, LEARNER_GREETING);
    // The tutor's shared budget runs out while the turn is on its way: usage says so from then on.
    api.setUsage(TUTOR_OFF);
    gate.release();

    await expect(page.getByText(UNAVAILABLE_COPY)).toBeVisible();
    await expect(page.getByText(LEARNER_GREETING, { exact: true })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(TUTOR_UNAVAILABLE_KEPT_COPY);
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
    await expect(page.getByLabel(TYPING_ONLY_LABEL)).toHaveCount(0);

    api.setUsage(PLENTY_LEFT);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.getByRole("button", { name: "Try again" }).click();

    await expect(page.getByText(TUTOR_GREETING, { exact: true })).toBeVisible();
    await expect(page.getByText(UNAVAILABLE_COPY)).toHaveCount(0);
    await expect(page.getByText(LEARNER_GREETING, { exact: true })).toHaveCount(1);
    expect(api.turnRequests.map((turn) => turn.body)).toEqual([{ text: LEARNER_GREETING }, { text: LEARNER_GREETING }]);
  } finally {
    gate.release();
  }
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
