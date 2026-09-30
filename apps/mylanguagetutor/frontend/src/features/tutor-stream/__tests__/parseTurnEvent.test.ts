import { describe, expect, it } from "vitest";
import { parseTurnEvent } from "@/features/tutor-stream/parseTurnEvent";

describe("parseTurnEvent", () => {
  it("parses turn.started", () => {
    expect(parseTurnEvent("turn.started", '{"turn_id":"t1","seq":3}')).toEqual({
      type: "turn.started",
      turnId: "t1",
      seq: 3,
    });
  });

  it("parses reply.delta and reply.done", () => {
    expect(parseTurnEvent("reply.delta", '{"text":"Hola"}')).toEqual({ type: "reply.delta", text: "Hola" });
    expect(parseTurnEvent("reply.done", "{}")).toEqual({ type: "reply.done" });
  });

  it("parses corrections with defaults for optional fields", () => {
    const data = JSON.stringify({ items: [], scenario_state: { goals_met: [0, "x"], complete: true } });
    expect(parseTurnEvent("corrections", data)).toEqual({
      type: "corrections",
      payload: {
        items: [],
        retry_prompt: null,
        translation: null,
        scenario_state: { goals_met: [0], complete: true },
      },
    });
  });

  it("parses done with the remaining budget", () => {
    const data = '{"status":"partial","usage":{"remaining_fraction":0.4}}';
    expect(parseTurnEvent("done", data)).toEqual({ type: "done", status: "partial", remainingFraction: 0.4 });
  });

  it("parses error, defaulting retryable to true", () => {
    expect(parseTurnEvent("error", '{"code":"tutor_busy"}')).toEqual({
      type: "error",
      code: "tutor_busy",
      retryable: true,
    });
  });

  it("ignores unknown events and malformed data", () => {
    expect(parseTurnEvent("something.new", "{}")).toBeNull();
    expect(parseTurnEvent("reply.delta", "not json")).toBeNull();
    expect(parseTurnEvent("done", '{"status":"weird"}')).toBeNull();
  });
});
