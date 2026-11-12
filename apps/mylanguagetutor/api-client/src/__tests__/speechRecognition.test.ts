import { describe, expect, it } from "vitest";
import { NOTHING_HEARD } from "../constants/heardSpeech";
import { PRACTICE_COPY } from "../constants/practiceCopy";
import { VOICE_COPY } from "../constants/voiceCopy";
import { composerView } from "../utils/composerView";
import { endedNormally } from "../utils/endedNormally";
import { finalTranscript } from "../utils/finalTranscript";
import { keepsHeardSpeech } from "../utils/keepsHeardSpeech";
import { liveTranscript } from "../utils/liveTranscript";
import { recognitionFailure } from "../utils/recognitionFailure";
import { recognitionFailureHint } from "../utils/recognitionFailureHint";
import { typedAnswerLabel } from "../utils/typedAnswerLabel";

const NOTHING_YET = { anythingHeard: false, settled: false, stopRequested: false } as const;
const MID_ANSWER = { anythingHeard: true, settled: false, stopRequested: false } as const;
const SETTLED = { anythingHeard: true, settled: true, stopRequested: false } as const;
const SENDING = { anythingHeard: true, settled: false, stopRequested: true } as const;
const STOPPED_SILENT = { anythingHeard: false, settled: false, stopRequested: true } as const;

describe("endedNormally", () => {
  it("counts an answer as over once the learner asked to send it, or a final result arrived", () => {
    expect(endedNormally(SENDING)).toBe(true);
    expect(endedNormally(STOPPED_SILENT)).toBe(true);
    expect(endedNormally(SETTLED)).toBe(true);
    expect(endedNormally(MID_ANSWER)).toBe(false);
    expect(endedNormally(NOTHING_YET)).toBe(false);
  });
});

describe("recognitionFailure", () => {
  it.each(["not-allowed", "service-not-allowed"])("counts %s as the microphone refused, even after a stop", (error) => {
    expect(recognitionFailure(error, NOTHING_YET)).toBe("denied");
    expect(recognitionFailure(error, STOPPED_SILENT)).toBe("denied");
  });

  it.each(["no-speech", "speech-timeout"])("counts %s as nothing heard", (error) => {
    expect(recognitionFailure(error, NOTHING_YET)).toBe("no_speech");
  });

  it("ignores aborted: the app stopped listening itself", () => {
    expect(recognitionFailure("aborted", MID_ANSWER)).toBeNull();
    expect(recognitionFailure("aborted", NOTHING_YET)).toBeNull();
  });

  it("counts iOS's interrupted as an interruption, heard or not", () => {
    expect(recognitionFailure("interrupted", MID_ANSWER)).toBe("interrupted");
    expect(recognitionFailure("interrupted", NOTHING_YET)).toBe("interrupted");
  });

  it.each(["audio-capture", "client", "busy"])("counts %s after words were heard as the microphone taken, as Android reports a call", (error) => {
    expect(recognitionFailure(error, MID_ANSWER)).toBe("interrupted");
  });

  it.each(["audio-capture", "client", "busy"])(
    "counts %s with nothing heard as recognition not working: a missing or blocked microphone fails after starting",
    (error) => {
      expect(recognitionFailure(error, NOTHING_YET)).toBe("unavailable");
    },
  );

  it.each(["network", "language-not-supported", "something-new"])("counts %s as recognition not working", (error) => {
    expect(recognitionFailure(error, MID_ANSWER)).toBe("unavailable");
  });

  it.each(["client", "no-speech", "audio-capture", "network", "interrupted"])(
    "shows nothing for %s once the answer ended normally: sent, or stopped with nothing heard",
    (error) => {
      expect(recognitionFailure(error, SENDING)).toBeNull();
      expect(recognitionFailure(error, STOPPED_SILENT)).toBeNull();
      expect(recognitionFailure(error, SETTLED)).toBeNull();
    },
  );
});

describe("keepsHeardSpeech", () => {
  it.each(["no-speech", "speech-timeout"])("keeps what was heard when %s ends listening: the learner went quiet", (error) => {
    expect(keepsHeardSpeech(error, MID_ANSWER)).toBe(true);
  });

  it.each(["interrupted", "audio-capture", "client", "busy", "network", "not-allowed", "something-new"])(
    "drops what was heard when %s cuts the learner off mid-answer",
    (error) => {
      expect(keepsHeardSpeech(error, MID_ANSWER)).toBe(false);
    },
  );

  it.each(["client", "audio-capture", "network", "interrupted", "no-speech"])(
    "keeps what was heard when %s follows the learner asking to send",
    (error) => {
      expect(keepsHeardSpeech(error, SENDING)).toBe(true);
    },
  );

  it.each(["client", "audio-capture", "network", "interrupted"])("keeps a finished answer when %s arrives after its final result", (error) => {
    expect(keepsHeardSpeech(error, SETTLED)).toBe(true);
  });

  it("drops what was heard on an abort, even after the learner asked to send or a final result arrived", () => {
    expect(keepsHeardSpeech("aborted", MID_ANSWER)).toBe(false);
    expect(keepsHeardSpeech("aborted", SENDING)).toBe(false);
    expect(keepsHeardSpeech("aborted", SETTLED)).toBe(false);
  });
});

describe("recognitionFailureHint", () => {
  it("says what to do after nothing was heard, an interruption, or the service failed", () => {
    expect(recognitionFailureHint("no_speech")).toBe(VOICE_COPY.noSpeech);
    expect(recognitionFailureHint("interrupted")).toBe(VOICE_COPY.interrupted);
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

  it("keeps the microphone after a call interrupted the learner", () => {
    expect(composerView({ ...speaking, failure: "interrupted" })).toBe("voice");
  });
});

describe("typedAnswerLabel", () => {
  it("is plain where the learner could speak, and marks typing practice where they can't", () => {
    expect(typedAnswerLabel(true)).toBe(PRACTICE_COPY.typeYourAnswer);
    expect(typedAnswerLabel(false)).toBe(PRACTICE_COPY.typingOnlyLabel);
  });
});
