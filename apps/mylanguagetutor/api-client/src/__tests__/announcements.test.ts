import { describe, expect, it } from "vitest";
import { VOICE_COPY } from "../constants/voiceCopy";
import type { TranscriptEntry } from "../types/session/transcript-entry";
import { latestReply } from "../utils/latestReply";
import { phaseAnnouncement } from "../utils/phaseAnnouncement";

function entry(overrides: Partial<TranscriptEntry>): TranscriptEntry {
  return { key: "1", learnerText: "Hola", replyText: "", translation: null, corrections: [], retryPrompt: null, status: "pending", correctionsMissing: false, ...overrides };
}

describe("latestReply", () => {
  it("is nothing before the first reply, and while one is still arriving", () => {
    expect(latestReply([])).toBeUndefined();
    expect(latestReply([entry({ replyText: "¡Ho" })])).toBeUndefined();
  });

  it("is the newest reply once it has stopped arriving, cut off or not", () => {
    expect(latestReply([entry({ replyText: "Uno", status: "complete" }), entry({ key: "2", replyText: "Dos", status: "complete" })])).toBe("Dos");
    expect(latestReply([entry({ replyText: "¡Hola!", status: "failed" })])).toBe("¡Hola!");
  });

  it("is nothing when the newest turn got no reply", () => {
    expect(latestReply([entry({ replyText: "Uno", status: "complete" }), entry({ key: "2", status: "failed" })])).toBeUndefined();
  });

  it("is nothing while a new turn is on its way, not the previous reply again", () => {
    expect(latestReply([entry({ replyText: "Uno", status: "complete" }), entry({ key: "2", replyText: "Do", status: "pending" })])).toBeUndefined();
  });
});

describe("phaseAnnouncement", () => {
  it("tells screen readers the answer went off", () => {
    expect(phaseAnnouncement("waiting", "voice")).toBe(VOICE_COPY.micLabels.waiting);
  });

  it.each(["idle", "listening", "replying", "speaking"] as const)("says nothing on %s", (phase) => {
    expect(phaseAnnouncement(phase, "voice")).toBeUndefined();
  });

  it("says nothing while typing, which has its own Sending state", () => {
    expect(phaseAnnouncement("waiting", "text")).toBeUndefined();
  });
});
