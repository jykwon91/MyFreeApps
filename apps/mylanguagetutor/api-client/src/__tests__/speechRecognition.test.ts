import { describe, expect, it } from "vitest";
import { NOTHING_HEARD } from "../constants/heardSpeech";
import { PRACTICE_COPY } from "../constants/practiceCopy";
import { VOICE_COPY } from "../constants/voiceCopy";
import { composerView } from "../utils/composerView";
import { finalTranscript } from "../utils/finalTranscript";
import { liveTranscript } from "../utils/liveTranscript";
import { recognitionFailure } from "../utils/recognitionFailure";
import { recognitionFailureHint } from "../utils/recognitionFailureHint";
import { typedAnswerLabel } from "../utils/typedAnswerLabel";

describe("recognitionFailure", () => {
  it.each(["not-allowed", "service-not-allowed"])("counts %s as the microphone refused", (error) => {
    expect(recognitionFailure(error)).toBe("denied");
  });

  it.each(["no-speech", "speech-timeout"])("counts %s as nothing heard", (error) => {
    expect(recognitionFailure(error)).toBe("no_speech");
  });

  it.each(["aborted", "interrupted"])("ignores %s: listening was stopped on purpose, or by a call", (error) => {
    expect(recognitionFailure(error)).toBeNull();
  });

  it.each(["network", "audio-capture", "language-not-supported", "something-new"])("counts %s as recognition not working", (error) => {
    expect(recognitionFailure(error)).toBe("unavailable");
  });
});

describe("recognitionFailureHint", () => {
  it("says what to do after nothing was heard, or the service failed", () => {
    expect(recognitionFailureHint("no_speech")).toBe(VOICE_COPY.noSpeech);
    expect(recognitionFailureHint("unavailable")).toBe(VOICE_COPY.unavailable);
  });

  it("has no hint for a refused microphone, which has its own notice, or no failure", () => {
    expect(recognitionFailureHint("denied")).toBeNull();
    expect(recognitionFailureHint(null)).toBeNull();
  });
});

describe("transcripts", () => {
  it("shows the settled words, then the guess still changing", () => {
    expect(liveTranscript({ finalText: "Quiero ", interimText: "un ca" })).toBe("Quiero un ca");
    expect(liveTranscript(NOTHING_HEARD)).toBe("");
  });

  it("sends the settled words, or the last guess when nothing settled", () => {
    expect(finalTranscript({ finalText: " Quiero un café ", interimText: "" })).toBe("Quiero un café");
    expect(finalTranscript({ finalText: "", interimText: "Quiero un ca " })).toBe("Quiero un ca");
    expect(finalTranscript(NOTHING_HEARD)).toBe("");
  });
});

describe("composerView", () => {
  const speaking = { blocked: false, mode: "voice", failure: null, privacyAcked: true } as const;

  it("shows the microphone once the notice is read", () => {
    expect(composerView(speaking)).toBe("voice");
  });

  it("shows the privacy notice before the first use", () => {
    expect(composerView({ ...speaking, privacyAcked: false })).toBe("privacy");
  });

  it("shows the blocked microphone over the notice", () => {
    expect(composerView({ ...speaking, privacyAcked: false, failure: "denied" })).toBe("denied");
  });

  it("types without any notice", () => {
    expect(composerView({ ...speaking, mode: "text", privacyAcked: false, failure: "denied" })).toBe("text");
  });

  it("shows nothing to answer with while the session is blocked", () => {
    expect(composerView({ ...speaking, mode: "text", blocked: true })).toBe("blocked");
  });

  it("keeps the microphone after nothing was heard", () => {
    expect(composerView({ ...speaking, failure: "no_speech" })).toBe("voice");
  });
});

describe("typedAnswerLabel", () => {
  it("is plain where the learner could speak, and marks typing practice where they can't", () => {
    expect(typedAnswerLabel(true)).toBe(PRACTICE_COPY.typeYourAnswer);
    expect(typedAnswerLabel(false)).toBe(PRACTICE_COPY.typingOnlyLabel);
  });
});
