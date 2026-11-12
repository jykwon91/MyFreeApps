// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { createElement, type ReactNode } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TurnRequestError } from "../errors/TurnRequestError";
import { usePracticeSession } from "../hooks/usePracticeSession";
import type { StreamTurnFn } from "../types/stream/stream-turn-fn";
import type { StreamTurnOptions } from "../types/stream/stream-turn-options";
import type { TurnStreamEvent } from "../types/tutor/turn-stream-event";

const createSession = vi.fn();
const streamTurn = vi.fn<StreamTurnFn>();

vi.mock("../store/sessionsApi", () => ({
  useCreateSessionMutation: () => [createSession],
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

const COMPLETE_TURN: TurnStreamEvent[] = [
  { type: "turn.started", turnId: "t1", seq: 1 },
  { type: "reply.delta", text: "¡Hola! ¿Qué " },
  { type: "reply.delta", text: "quieres?" },
  { type: "reply.done" },
  {
    type: "corrections",
    payload: {
      items: [],
      retry_prompt: "Try: Quiero un café.",
      translation: "Hi! What do you want?",
      scenario_state: { goals_met: [0], complete: false },
    },
  },
  { type: "done", status: "complete", remainingFraction: 0.9 },
];

function setup() {
  const speak = vi.fn();
  const stopSpeaking = vi.fn();
  const hook = renderHook(
    () =>
      usePracticeSession({
        languageCode: "es",
        ttsLocale: "es-MX",
        scenarioSlug: "cafe",
        level: "beginner",
        streamTurn,
        speak,
        stopSpeaking,
      }),
    { wrapper },
  );
  return { ...hook, speak, stopSpeaking };
}

describe("usePracticeSession", () => {
  beforeEach(() => {
    createSession.mockReset();
    streamTurn.mockReset();
    createSession.mockReturnValue({ unwrap: () => Promise.resolve({ id: "s1" }) });
  });

  it("streams a turn: reply text, spoken sentences, corrections, goals", async () => {
    streamTurn.mockImplementation(emitting(COMPLETE_TURN));
    const { result, speak, stopSpeaking } = setup();

    act(() => result.current.send("  hola  "));

    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    expect(createSession).toHaveBeenCalledWith({ language_code: "es", scenario_slug: "cafe", level: "beginner" });
    expect(streamTurn.mock.calls[0][0]).toMatchObject({ sessionId: "s1", text: "hola" });
    expect(stopSpeaking).toHaveBeenCalled();
    const [entry] = result.current.entries;
    expect(entry).toMatchObject({
      learnerText: "hola",
      replyText: "¡Hola! ¿Qué quieres?",
      translation: "Hi! What do you want?",
      retryPrompt: "Try: Quiero un café.",
      status: "complete",
    });
    expect(speak.mock.calls).toEqual([["¡Hola!"], ["¿Qué quieres?"]]);
    expect(result.current.scenarioState.goals_met).toEqual([0]);
    expect(result.current.failure).toBeNull();
    expect(result.current.sessionId).toBe("s1");
  });

  it("reuses the session for the next turn", async () => {
    streamTurn.mockImplementation(emitting(COMPLETE_TURN));
    const { result } = setup();

    act(() => result.current.send("hola"));
    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    act(() => result.current.send("un café"));
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));

    expect(createSession).toHaveBeenCalledTimes(1);
  });

  it("blocks on the daily limit and drops the unsent entry", async () => {
    streamTurn.mockRejectedValue(new TurnRequestError(429, "daily_limit_reached"));
    const { result } = setup();

    act(() => result.current.send("hola"));

    await waitFor(() => expect(result.current.block).toBe("daily_limit"));
    expect(result.current.entries).toHaveLength(0);
    expect(result.current.failure).toBeNull();
  });

  it("a stream cut off before done is a retryable failure; retry resends the same text", async () => {
    streamTurn.mockImplementationOnce(emitting([{ type: "reply.delta", text: "Hol" }]));
    const { result } = setup();

    act(() => result.current.send("hola"));
    await waitFor(() => expect(result.current.failure).not.toBeNull());
    expect(result.current.failure).toMatchObject({ code: "connection_lost", text: "hola", retryable: true });
    expect(result.current.entries[0].status).toBe("failed");

    streamTurn.mockImplementation(emitting(COMPLETE_TURN));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    await waitFor(() => expect(result.current.entries[0]?.status).toBe("complete"));

    expect(result.current.entries).toHaveLength(1);
    expect(streamTurn.mock.calls[1][0].text).toBe("hola");
  });

  it("a mid-stream tutor error keeps the partial reply and offers retry", async () => {
    streamTurn.mockImplementation(
      emitting([
        { type: "reply.delta", text: "Hola" },
        { type: "error", code: "tutor_busy", retryable: true },
        { type: "done", status: "partial", remainingFraction: 0.8 },
      ]),
    );
    const { result } = setup();

    act(() => result.current.send("hola"));

    await waitFor(() => expect(result.current.failure?.code).toBe("tutor_busy"));
    expect(result.current.entries[0]).toMatchObject({ replyText: "Hola", status: "partial" });
  });

  /** Streams the first words, then holds the turn open until it is aborted. */
  function holdingOpen({ onEvent, signal }: StreamTurnOptions) {
    onEvent({ type: "reply.delta", text: "¡Hola! Bienvenido" });
    return new Promise<void>((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("aborted")));
    });
  }

  it("an interrupted turn keeps the words so far, unspoken, and retry sends the same text", async () => {
    streamTurn.mockImplementationOnce(holdingOpen);
    const { result, speak } = setup();

    act(() => result.current.send("hola"));
    await waitFor(() => expect(result.current.requestPhase).toBe("replying"));
    act(() => result.current.interrupt());

    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    expect(streamTurn.mock.calls[0][0].signal?.aborted).toBe(true);
    expect(result.current.failure).toMatchObject({ code: "connection_lost", text: "hola", retryable: true });
    expect(result.current.entries[0]).toMatchObject({ replyText: "¡Hola! Bienvenido", status: "failed" });
    // "¡Hola!" was a finished sentence; the rest was cut off, so it isn't read out.
    expect(speak.mock.calls).toEqual([["¡Hola!"]]);

    streamTurn.mockImplementation(emitting(COMPLETE_TURN));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.entries[0]?.status).toBe("complete"));
    expect(result.current.entries).toHaveLength(1);
    expect(streamTurn.mock.calls[1][0].text).toBe("hola");
  });

  /** Streams the whole reply, then holds the turn open for its corrections until `finish` or `drop`. */
  function replyThenHold() {
    let finish: () => void = () => {};
    let drop: (err?: Error) => void = () => {};
    const stream = ({ onEvent, signal }: StreamTurnOptions) => {
      COMPLETE_TURN.slice(0, 4).forEach(onEvent);
      return new Promise<void>((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("aborted")));
        finish = () => {
          COMPLETE_TURN.slice(4).forEach(onEvent);
          resolve();
        };
        drop = (err) => (err ? reject(err) : resolve());
      });
    };
    return { stream, finish: () => finish(), drop: (err?: Error) => drop(err) };
  }

  it("lets a turn whose whole reply has arrived finish when interrupted", async () => {
    const turn = replyThenHold();
    streamTurn.mockImplementationOnce(turn.stream);
    const { result } = setup();

    act(() => result.current.send("hola"));
    await waitFor(() => expect(result.current.entries[0]?.replyText).toBe("¡Hola! ¿Qué quieres?"));
    act(() => result.current.interrupt());
    expect(streamTurn.mock.calls[0][0].signal?.aborted).toBe(false);

    act(() => turn.finish());
    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    expect(result.current.entries[0]).toMatchObject({ status: "complete", correctionsMissing: false, retryPrompt: "Try: Quiero un café." });
    expect(result.current.failure).toBeNull();
    expect(streamTurn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["closes", undefined],
    ["breaks", new TurnRequestError(0, "network_error")],
  ])("keeps a whole reply when the stream %s before its corrections, with nothing to resend", async (_how, err) => {
    const turn = replyThenHold();
    streamTurn.mockImplementationOnce(turn.stream);
    const { result } = setup();

    act(() => result.current.send("hola"));
    await waitFor(() => expect(result.current.entries[0]?.replyText).toBe("¡Hola! ¿Qué quieres?"));
    act(() => turn.drop(err));

    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({ replyText: "¡Hola! ¿Qué quieres?", status: "complete", correctionsMissing: true });
    expect(result.current.failure).toBeNull();
  });

  it("stops waiting on the interrupted turn's corrections when asked: complete, with them marked missing", async () => {
    const turn = replyThenHold();
    streamTurn.mockImplementationOnce(turn.stream);
    const { result } = setup();

    act(() => result.current.send("hola"));
    await waitFor(() => expect(result.current.entries[0]?.replyText).toBe("¡Hola! ¿Qué quieres?"));
    act(() => result.current.interrupt());
    act(() => result.current.stopWaitingForCorrections());

    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    expect(streamTurn.mock.calls[0][0].signal?.aborted).toBe(true);
    expect(result.current.entries[0]).toMatchObject({ status: "complete", correctionsMissing: true });
    expect(result.current.failure).toBeNull();
  });

  it("leaves a turn sent after the interrupt alone", async () => {
    const first = replyThenHold();
    const second = replyThenHold();
    streamTurn.mockImplementationOnce(first.stream).mockImplementationOnce(second.stream);
    const { result } = setup();

    act(() => result.current.send("hola"));
    await waitFor(() => expect(result.current.entries[0]?.replyText).toBe("¡Hola! ¿Qué quieres?"));
    act(() => result.current.interrupt());
    act(() => first.finish());
    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    act(() => result.current.send("un café"));
    await waitFor(() => expect(result.current.entries[1]?.replyText).toBe("¡Hola! ¿Qué quieres?"));
    act(() => result.current.stopWaitingForCorrections());

    expect(streamTurn.mock.calls[1][0].signal?.aborted).toBe(false);
    act(() => second.finish());
    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    expect(result.current.entries[1]).toMatchObject({ status: "complete", correctionsMissing: false });
  });

  it("doesn't stop waiting on a turn whose reply is still arriving", async () => {
    streamTurn.mockImplementationOnce(holdingOpen);
    const { result } = setup();

    act(() => result.current.send("hola"));
    await waitFor(() => expect(streamTurn).toHaveBeenCalledTimes(1));
    act(() => result.current.stopWaitingForCorrections());

    expect(streamTurn.mock.calls[0][0].signal?.aborted).toBe(false);
    expect(result.current.requestPhase).not.toBe("idle");
  });

  it("an interrupted turn still waiting for its first words ends like a dropped connection", async () => {
    streamTurn.mockImplementationOnce(
      ({ signal }) => new Promise<void>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const { result } = setup();

    act(() => result.current.send("hola"));
    await waitFor(() => expect(streamTurn).toHaveBeenCalledTimes(1));
    act(() => result.current.interrupt());

    await waitFor(() => expect(result.current.requestPhase).toBe("idle"));
    expect(streamTurn.mock.calls[0][0].signal?.aborted).toBe(true);
    expect(result.current.failure).toMatchObject({ code: "connection_lost", text: "hola", retryable: true });
    expect(result.current.entries[0]).toMatchObject({ replyText: "", status: "failed" });

    streamTurn.mockImplementation(emitting(COMPLETE_TURN));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.entries[0]?.status).toBe("complete"));
    expect(result.current.entries).toHaveLength(1);
  });

  it("interrupting with no turn in flight does nothing", () => {
    const { result } = setup();
    act(() => result.current.interrupt());
    expect(result.current.failure).toBeNull();
  });

  it("leaving aborts the turn in flight", async () => {
    streamTurn.mockImplementationOnce(holdingOpen);
    const { result, unmount } = setup();

    act(() => result.current.send("hola"));
    await waitFor(() => expect(result.current.requestPhase).toBe("replying"));
    unmount();

    expect(streamTurn.mock.calls[0][0].signal?.aborted).toBe(true);
  });

  it("ignores empty input", () => {
    const { result } = setup();
    act(() => result.current.send("   "));
    expect(result.current.entries).toHaveLength(0);
    expect(streamTurn).not.toHaveBeenCalled();
  });
});
