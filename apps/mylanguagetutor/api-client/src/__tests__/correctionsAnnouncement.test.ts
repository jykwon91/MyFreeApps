import { describe, expect, it } from "vitest";
import { PRACTICE_COPY } from "../constants/practiceCopy";
import type { TranscriptEntry } from "../types/session/transcript-entry";
import type { CorrectionItem } from "../types/tutor/correction-item";
import { correctionsAnnouncement } from "../utils/correctionsAnnouncement";

const CORRECTION: CorrectionItem = {
  error_span: "un cafe",
  corrected_span: "un café",
  full_corrected_sentence: "Quiero un café.",
  error_type: "lexical",
  severity: "minor",
  feedback_move: "recast",
  explanation: "Accent.",
};

function entry(overrides: Partial<TranscriptEntry> = {}): TranscriptEntry {
  return {
    key: "k",
    learnerText: "Hola",
    replyText: "¡Hola!",
    translation: null,
    corrections: [],
    retryPrompt: null,
    status: "complete",
    correctionsMissing: false,
    ...overrides,
  };
}

describe("correctionsAnnouncement", () => {
  it("says nothing without an entry, while the turn is arriving, or when there is nothing to say", () => {
    expect(correctionsAnnouncement(undefined)).toBeUndefined();
    expect(correctionsAnnouncement(entry({ status: "pending", corrections: [CORRECTION] }))).toBeUndefined();
    expect(correctionsAnnouncement(entry())).toBeUndefined();
  });

  it("counts the suggestions", () => {
    expect(correctionsAnnouncement(entry({ corrections: [CORRECTION] }))).toBe("1 suggestion");
    expect(correctionsAnnouncement(entry({ corrections: [CORRECTION, CORRECTION] }))).toBe("2 suggestions");
  });

  it("says suggestions didn't arrive", () => {
    expect(correctionsAnnouncement(entry({ correctionsMissing: true }))).toBe(PRACTICE_COPY.correctionsMissing);
  });

  it("adds the retry prompt after the suggestions", () => {
    expect(correctionsAnnouncement(entry({ corrections: [CORRECTION], retryPrompt: "Try again: Quiero un café." }))).toBe(
      "1 suggestion. Try again: Quiero un café.",
    );
  });
});
