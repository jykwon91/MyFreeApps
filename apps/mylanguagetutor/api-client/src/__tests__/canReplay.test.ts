import { describe, expect, it } from "vitest";
import type { VoicePhase } from "../types/session/voice-phase";
import { canReplay } from "../utils/canReplay";

describe("canReplay", () => {
  it.each<VoicePhase>(["idle", "speaking"])("allows a replay while %s, when no turn is in flight", (phase) => {
    expect(canReplay(phase)).toBe(true);
  });

  it("refuses while the microphone is open, where the tutor's voice would be heard as the answer", () => {
    expect(canReplay("listening")).toBe(false);
  });

  it.each<VoicePhase>(["waiting", "replying"])("refuses while %s, so it can't cut off the reply that is arriving", (phase) => {
    expect(canReplay(phase)).toBe(false);
  });
});
