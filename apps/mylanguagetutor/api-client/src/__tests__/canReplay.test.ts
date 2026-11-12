import { describe, expect, it } from "vitest";
import type { VoicePhase } from "../types/session/voice-phase";
import { canReplay } from "../utils/canReplay";

describe("canReplay", () => {
  it("refuses only while the microphone is open, where the tutor's voice would be heard as the answer", () => {
    expect(canReplay("listening")).toBe(false);
  });

  it.each<VoicePhase>(["idle", "waiting", "replying", "speaking"])("allows a replay while %s", (phase) => {
    expect(canReplay(phase)).toBe(true);
  });
});
