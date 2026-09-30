import { describe, expect, it } from "vitest";
import { blockForCode, isRetryableRefusal, normaliseRefusalCode } from "@/features/session/turnRefusal";
import { voicePhase } from "@/features/session/voicePhase";
import { turnErrorCopy } from "@/features/session/errorCopy";

describe("blockForCode", () => {
  it("maps blocking refusals", () => {
    expect(blockForCode("daily_limit_reached")).toBe("daily_limit");
    expect(blockForCode("tutor_unavailable")).toBe("unavailable");
    expect(blockForCode("session_turn_limit")).toBe("session_limit");
    expect(blockForCode("session_ended")).toBe("session_ended");
  });

  it("returns null for transient refusals", () => {
    expect(blockForCode("turn_in_progress")).toBeNull();
  });
});

describe("isRetryableRefusal", () => {
  it("retries transient failures only", () => {
    expect(isRetryableRefusal(0, "network_error")).toBe(true);
    expect(isRetryableRefusal(429, "rate_limited")).toBe(true);
    expect(isRetryableRefusal(503, "anything")).toBe(true);
    expect(isRetryableRefusal(422, "validation")).toBe(false);
  });
});

describe("normaliseRefusalCode", () => {
  it("turns the limiter's prose 429 into rate_limited", () => {
    expect(normaliseRefusalCode(429, "Too many attempts")).toBe("rate_limited");
  });

  it("keeps our own 429 codes", () => {
    expect(normaliseRefusalCode(429, "daily_limit_reached")).toBe("daily_limit_reached");
    expect(normaliseRefusalCode(429, "turn_in_progress")).toBe("turn_in_progress");
  });

  it("passes other statuses through", () => {
    expect(normaliseRefusalCode(404, "session_not_found")).toBe("session_not_found");
  });
});

describe("voicePhase", () => {
  it("prioritises listening, then the request, then speech", () => {
    expect(voicePhase({ listening: true, requestPhase: "waiting", speaking: true })).toBe("listening");
    expect(voicePhase({ listening: false, requestPhase: "replying", speaking: true })).toBe("replying");
    expect(voicePhase({ listening: false, requestPhase: "idle", speaking: true })).toBe("speaking");
    expect(voicePhase({ listening: false, requestPhase: "idle", speaking: false })).toBe("idle");
  });
});

describe("turnErrorCopy", () => {
  it("has specific copy for known codes and a generic fallback", () => {
    expect(turnErrorCopy("tutor_busy")).toMatch(/busy/);
    expect(turnErrorCopy("something_else")).toBe("Something went wrong. Try again.");
  });
});
