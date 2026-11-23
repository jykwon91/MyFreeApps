import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PracticeSession from "@/features/session/PracticeSession";
import { fakePracticeSession } from "@/test/fakePracticeSession";
import type { PracticeSession as PracticeSessionState } from "@mylanguagetutor/api-client/types/session/practice-session";
import type { PracticeSessionConfig } from "@mylanguagetutor/api-client/types/session/practice-session-config";
import type { SpeechRecognitionControls } from "@mylanguagetutor/api-client/types/speech/speech-recognition-controls";
import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";
import { VOICE_COPY } from "@mylanguagetutor/api-client/constants/voiceCopy";
import { PRACTICE_COPY } from "@mylanguagetutor/api-client/constants/practiceCopy";
import { turnErrorCopy } from "@mylanguagetutor/api-client/utils/turnErrorCopy";
import { sessionBlockMessage } from "@mylanguagetutor/api-client/utils/sessionBlockMessage";

let recognition: SpeechRecognitionControls;
let sessionState: Omit<PracticeSessionState, "busy" | "replay">;

vi.mock("@mylanguagetutor/api-client/hooks/usePracticeSession", () => ({
  usePracticeSession: (config: PracticeSessionConfig) => fakePracticeSession(sessionState, config),
}));
vi.mock("@/features/speech/useSpeechRecognition", () => ({
  useSpeechRecognition: () => recognition,
}));
vi.mock("@/features/speech/useSpeechSynthesis", () => ({
  useSpeechSynthesis: () => ({ supported: true, speaking: false, enqueue: vi.fn(), speakAll: vi.fn(), cancel: vi.fn() }),
}));

const LANGUAGE: Language = {
  code: "es",
  display_name: "Spanish",
  dialect_label: "Latin American",
  stt_locale: "es-MX",
  tts_locale: "es-MX",
};
const SCENARIO: Scenario = { slug: "cafe", title: "At the café", goal: "Order a drink", goals: ["Greet", "Order"], order: 4 };
const LIVE = '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]';

function renderScreen() {
  return render(
    <MemoryRouter>
      <PracticeSession language={LANGUAGE} scenario={SCENARIO} level="beginner" />
    </MemoryRouter>,
  );
}

function announcerText(): string {
  return screen.getByTestId("practice-announcer").textContent ?? "";
}

describe("PracticeSession notices are read by the one live region", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("ltutor.voicePrivacyAck.v1", "1");
    recognition = {
      supported: true,
      listening: false,
      interim: "",
      failure: null,
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      clearFailure: vi.fn(),
    };
    sessionState = {
      sessionId: null,
      entries: [],
      requestPhase: "idle",
      failure: null,
      block: null,
      scenarioState: { goals_met: [], complete: false },
      send: vi.fn(),
      retry: vi.fn(),
      interrupt: vi.fn(),
      resume: vi.fn(),
      dismissFailure: vi.fn(),
      dismissRetryPrompt: vi.fn(),
    };
  });

  it("is in the page, empty, before any notice appears, then holds the scenario-complete message", () => {
    const { container, rerender } = renderScreen();
    expect(announcerText()).toBe("");

    sessionState = { ...sessionState, scenarioState: { goals_met: [0, 1], complete: true } };
    rerender(
      <MemoryRouter>
        <PracticeSession language={LANGUAGE} scenario={SCENARIO} level="beginner" />
      </MemoryRouter>,
    );

    expect(announcerText()).toContain(PRACTICE_COPY.scenarioComplete);
    expect(announcerText()).toContain(PRACTICE_COPY.scenarioCompleteBody);
    expect(container.querySelectorAll(LIVE)).toHaveLength(1);
  });

  it("holds the session-block message and keeps the notice itself out of any live region", () => {
    sessionState = { ...sessionState, block: "daily_limit" };
    const { container } = renderScreen();

    expect(announcerText()).toContain(sessionBlockMessage("daily_limit"));
    expect(container.querySelectorAll(LIVE)).toHaveLength(1);
  });

  it("holds the turn-error message, and the error's buttons are in no live region", () => {
    sessionState = { ...sessionState, failure: { code: "tutor_busy", text: "hola", retryable: true, entryKey: null } };
    const { container } = renderScreen();

    expect(announcerText()).toContain(turnErrorCopy("tutor_busy"));
    expect(container.querySelectorAll(LIVE)).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("holds the recognition hint, and the hint itself is in no live region", () => {
    recognition = { ...recognition, failure: "no_speech" };
    const { container } = renderScreen();

    expect(announcerText()).toContain(VOICE_COPY.noSpeech);
    expect(container.querySelectorAll(LIVE)).toHaveLength(1);
  });
});
