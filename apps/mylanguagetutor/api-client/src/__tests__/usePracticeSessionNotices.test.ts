// @vitest-environment jsdom
import { createElement, type ReactNode } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TURN_CHARS } from "../constants/turnLimits";
import { TurnRequestError } from "../errors/TurnRequestError";
import { usePracticeSession } from "../hooks/usePracticeSession";
import type { StreamTurnFn } from "../types/stream/stream-turn-fn";
import type { StreamTurnOptions } from "../types/stream/stream-turn-options";
import type { TurnStreamEvent } from "../types/tutor/turn-stream-event";
import type { UsageToday } from "../types/tutor/usage-today";

const createSession = vi.fn();
const streamTurn = vi.fn<StreamTurnFn>();

vi.mock("../store/sessionsApi", () => ({
  useCreateSessionMutation: () => [createSession],
}));

const BUDGET_LEFT: UsageToday = { remaining_fraction: 0.6, cap_reached: false, tutor_available: true, session_limit_reached: false };

vi.mock("../store/usageApi", () => ({
  useGetUsageTodayQuery: () => ({ isSuccess: true, isFetching: false, startedTimeStamp: 0, data: BUDGET_LEFT }),
  usageApiUtil: { invalidateTags: () => ({ type: "usage/invalidated" }) },
}));

const store = configureStore({ reducer: () => ({}) });

function wrapper({ children }: { children: ReactNode }) {
  return createElement(Provider, { store, children });
}

function emitting(events: TurnStreamEvent[]) {
  return async ({ onEvent }: StreamTurnOptions) => {
    for (const event of events) onEvent(event);
  };
}

function turnMeeting(goalsMet: number[]): TurnStreamEvent[] {
  return [
    { type: "reply.delta", text: "Bien." },
    { type: "reply.done" },
    {
      type: "corrections",
      payload: { items: [], retry_prompt: null, translation: "Fine.", scenario_state: { goals_met: goalsMet, complete: false } },
    },
    { type: "done", status: "complete", remainingFraction: 0.9 },
  ];
}

function setup() {
  return renderHook(
    () =>
      usePracticeSession({
        languageCode: "es",
        ttsLocale: "es-MX",
        scenarioSlug: "cafe",
        level: "beginner",
        streamTurn,
        speak: vi.fn(),
        stopSpeaking: vi.fn(),
        speakAll: vi.fn(),
      }),
    { wrapper },
  );
}

describe("usePracticeSession notices", () => {
  beforeEach(() => {
    createSession.mockReset();
    streamTurn.mockReset();
    let created = 0;
    createSession.mockImplementation(() => {
      created += 1;
      return { unwrap: () => Promise.resolve({ id: `s${created}` }) };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shortens a long answer at a sentence end and says so", async () => {
    streamTurn.mockImplementation(emitting(turnMeeting([])));
    const { result } = setup();
    const sentence = "Quiero un café con leche. ";
    const long = sentence.repeat(Math.ceil(MAX_TURN_CHARS / sentence.length) + 2);

    act(() => result.current.send(long));

    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    const sent = streamTurn.mock.calls[0][0].text;
    expect(sent.length).toBeLessThanOrEqual(MAX_TURN_CHARS);
    expect(sent.endsWith("leche.")).toBe(true);
    expect(result.current.entries[0].learnerText).toBe(sent);
    expect(result.current.notice).toBe("truncated");
  });

  it("says nothing about an answer that fits, and clears an earlier notice", async () => {
    streamTurn.mockImplementation(emitting(turnMeeting([])));
    const { result } = setup();

    act(() => result.current.send("palabra ".repeat(100)));
    await waitFor(() => expect(result.current.notice).toBe("truncated"));
    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    act(() => result.current.send("hola"));

    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    expect(result.current.notice).toBeNull();
  });

  it("dismisses a notice", async () => {
    streamTurn.mockImplementation(emitting(turnMeeting([])));
    const { result } = setup();

    act(() => result.current.send("palabra ".repeat(100)));
    await waitFor(() => expect(result.current.notice).toBe("truncated"));
    act(() => result.current.dismissNotice());

    expect(result.current.notice).toBeNull();
  });

  it("restarts a lost conversation with fresh goals, a notice, and the old turns still shown", async () => {
    streamTurn.mockImplementationOnce(emitting(turnMeeting([0])));
    const { result } = setup();
    act(() => result.current.send("hola"));
    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    expect(result.current.scenarioState.goals_met).toEqual([0]);

    streamTurn.mockRejectedValueOnce(new TurnRequestError(404, "session_not_found"));
    act(() => result.current.send("un café"));
    await waitFor(() => expect(result.current.failure?.code).toBe("session_not_found"));
    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    // Nothing has replaced the conversation yet, so its goals are not touched.
    expect(result.current.scenarioState.goals_met).toEqual([0]);
    expect(result.current.notice).toBeNull();

    streamTurn.mockImplementationOnce(emitting([{ type: "reply.delta", text: "Claro." }, { type: "reply.done" }, { type: "done", status: "complete", remainingFraction: 0.8 }]));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));

    expect(createSession).toHaveBeenCalledTimes(2);
    expect(result.current.sessionId).toBe("s2");
    expect(result.current.scenarioState).toEqual({ goals_met: [], complete: false });
    expect(result.current.notice).toBe("restarted");
    expect(result.current.entries.map((entry) => entry.learnerText)).toEqual(["hola", "un café"]);
  });

  it("shows no restart notice when the first conversation is simply created", async () => {
    streamTurn.mockImplementation(emitting(turnMeeting([])));
    const { result } = setup();

    act(() => result.current.send("hola"));

    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    expect(result.current.notice).toBeNull();
  });
});
