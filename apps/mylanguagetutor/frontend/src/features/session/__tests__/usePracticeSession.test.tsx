import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { store } from "@/lib/store";
import { TurnRequestError } from "@/features/tutor-stream/TurnRequestError";
import { usePracticeSession } from "@/features/session/usePracticeSession";
import type { StreamTurnOptions } from "@/features/tutor-stream/streamTurn";
import type { TurnStreamEvent } from "@/types/tutor/turn-events";

const createSession = vi.fn();
const streamTurn = vi.fn<(options: StreamTurnOptions) => Promise<void>>();

vi.mock("@/store/sessionsApi", () => ({
  useCreateSessionMutation: () => [createSession],
}));
vi.mock("@/features/tutor-stream/streamTurn", () => ({
  streamTurn: (options: StreamTurnOptions) => streamTurn(options),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <Provider store={store}>{children}</Provider>;
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
    expect(speak.mock.calls.map((call) => call[0])).toEqual(["¡Hola!", "¿Qué quieres?"]);
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

  it("ignores empty input", () => {
    const { result } = setup();
    act(() => result.current.send("   "));
    expect(result.current.entries).toHaveLength(0);
    expect(streamTurn).not.toHaveBeenCalled();
  });
});
