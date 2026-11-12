import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PracticeSession from "@/features/session/PracticeSession";
import CorrectionCard from "@/features/session/CorrectionCard";
import type { PracticeSession as PracticeSessionState } from "@mylanguagetutor/api-client/types/session/practice-session";
import type { SpeechRecognitionControls } from "@mylanguagetutor/api-client/types/speech/speech-recognition-controls";
import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";
import type { UsageToday } from "@mylanguagetutor/api-client/types/tutor/usage-today";
import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";

const send = vi.fn();
const startRecognition = vi.fn();
const cancelSpeech = vi.fn();
const speakAll = vi.fn();
let recognition: SpeechRecognitionControls;
let sessionState: PracticeSessionState;
let usage: UsageToday | undefined;

vi.mock("@mylanguagetutor/api-client/hooks/usePracticeSession", () => ({
  usePracticeSession: () => sessionState,
}));
vi.mock("@/features/speech/useSpeechRecognition", () => ({
  useSpeechRecognition: () => recognition,
}));
vi.mock("@/features/speech/useSpeechSynthesis", () => ({
  useSpeechSynthesis: () => ({
    supported: true,
    speaking: false,
    enqueue: vi.fn(),
    speakAll,
    cancel: cancelSpeech,
  }),
}));
vi.mock("@mylanguagetutor/api-client/store/usageApi", () => ({
  useGetUsageTodayQuery: () => ({ data: usage }),
}));

const LANGUAGE: Language = {
  code: "es",
  display_name: "Spanish",
  dialect_label: "Latin American",
  stt_locale: "es-MX",
  tts_locale: "es-MX",
};
const SCENARIO: Scenario = {
  slug: "cafe",
  title: "At the café",
  goal: "Order a drink",
  goals: ["Greet", "Order"],
  order: 4,
};

const TUTOR_TURN: TranscriptEntry = {
  key: "turn-1",
  learnerText: "Hola",
  replyText: "¡Hola! ¿Qué quieres?",
  translation: null,
  corrections: [],
  retryPrompt: null,
  status: "complete",
  correctionsMissing: false,
};

function renderScreen() {
  return render(
    <MemoryRouter>
      <PracticeSession language={LANGUAGE} scenario={SCENARIO} level="beginner" />
    </MemoryRouter>,
  );
}

describe("PracticeSession", () => {
  beforeEach(() => {
    localStorage.clear();
    send.mockReset();
    startRecognition.mockReset();
    cancelSpeech.mockReset();
    speakAll.mockReset();
    usage = { remaining_fraction: 1, cap_reached: false, tutor_available: true };
    recognition = {
      supported: true,
      listening: false,
      interim: "",
      failure: null,
      start: startRecognition,
      stop: vi.fn(),
      clearFailure: vi.fn(),
    };
    sessionState = {
      sessionId: null,
      entries: [],
      requestPhase: "idle",
      failure: null,
      block: null,
      scenarioState: { goals_met: [], complete: false },
      send,
      retry: vi.fn(),
      interrupt: vi.fn(),
      stopWaitingForCorrections: vi.fn(),
      dismissFailure: vi.fn(),
      dismissRetryPrompt: vi.fn(),
    };
  });

  it("shows the privacy notice before the first microphone use", () => {
    renderScreen();
    expect(screen.getByText("Before you use the microphone")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tap to speak" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue to microphone" }));

    expect(startRecognition).toHaveBeenCalled();
    expect(localStorage.getItem("ltutor.voicePrivacyAck.v1")).toBe("1");
  });

  it("pressing the mic while the tutor speaks cancels speech (barge-in)", () => {
    localStorage.setItem("ltutor.voicePrivacyAck.v1", "1");
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Tap to speak" }));

    expect(cancelSpeech).toHaveBeenCalled();
    expect(startRecognition).toHaveBeenCalled();
  });

  it("disables Replay and Slow while the microphone is listening, and enables them again after", () => {
    localStorage.setItem("ltutor.voicePrivacyAck.v1", "1");
    sessionState = { ...sessionState, entries: [TUTOR_TURN] };
    recognition = { ...recognition, listening: true };
    const { rerender } = renderScreen();

    expect(screen.getByRole("button", { name: "Replay" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Slow" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(speakAll).not.toHaveBeenCalled();

    recognition = { ...recognition, listening: false };
    rerender(
      <MemoryRouter>
        <PracticeSession language={LANGUAGE} scenario={SCENARIO} level="beginner" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Replay" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(speakAll).toHaveBeenCalledWith("¡Hola! ¿Qué quieres?", expect.any(Number));
  });

  it("pressing the mic while a replay is playing stops it first", () => {
    localStorage.setItem("ltutor.voicePrivacyAck.v1", "1");
    sessionState = { ...sessionState, entries: [TUTOR_TURN] };
    renderScreen();

    fireEvent.click(screen.getByRole("button", { name: "Replay" }));
    expect(speakAll).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Tap to speak" }));

    expect(cancelSpeech).toHaveBeenCalled();
    expect(startRecognition).toHaveBeenCalled();
  });

  it("keeps the mic visible but disabled while a turn is in flight", () => {
    localStorage.setItem("ltutor.voicePrivacyAck.v1", "1");
    sessionState = { ...sessionState, requestPhase: "waiting" };
    renderScreen();

    expect(screen.getByRole("button", { name: "Waiting for the tutor" })).toBeDisabled();
  });

  it("falls back to labelled typing practice without speech recognition", () => {
    recognition = { ...recognition, supported: false };
    renderScreen();

    const input = screen.getByLabelText("Typing practice (not speaking)");
    fireEvent.change(input, { target: { value: "hola" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(send).toHaveBeenCalledWith("hola");
    expect(screen.queryByText("Before you use the microphone")).not.toBeInTheDocument();
  });

  it("offers typing when the microphone is blocked", () => {
    localStorage.setItem("ltutor.voicePrivacyAck.v1", "1");
    recognition = { ...recognition, failure: "denied" };
    renderScreen();

    expect(screen.getByText("Microphone is blocked")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Type instead" }));

    expect(screen.getByLabelText("Type your answer")).toBeInTheDocument();
  });

  it("checks the daily cap before recording", () => {
    localStorage.setItem("ltutor.voicePrivacyAck.v1", "1");
    usage = { remaining_fraction: 0, cap_reached: true, tutor_available: true };
    renderScreen();

    expect(screen.getByText(/used today's practice time/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tap to speak" })).not.toBeInTheDocument();
  });

  it("shows the scenario-complete state", () => {
    sessionState = { ...sessionState, scenarioState: { goals_met: [0, 1], complete: true } };
    renderScreen();

    expect(screen.getByText("Scenario complete")).toBeInTheDocument();
  });
});

describe("CorrectionCard", () => {
  it("hedges: it looked like you said X -- natural Spanish: Y", () => {
    render(
      <ul>
        <CorrectionCard
          languageName="Spanish"
          correction={{
            error_span: "yo quiero un cafe caliente",
            corrected_span: "quiero un café caliente",
            full_corrected_sentence: "Quiero un café caliente.",
            error_type: "lexical",
            severity: "minor",
            feedback_move: "recast",
            explanation: "",
          }}
        />
      </ul>,
    );

    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent(
      'It looked like you said "yo quiero un cafe caliente" — natural Spanish: "quiero un café caliente"',
    );
  });

  it("keeps a whole reply whose corrections didn't load, with a quiet note and nothing to resend", () => {
    sessionState = {
      ...sessionState,
      entries: [
        {
          key: "turn-1",
          learnerText: "hola",
          replyText: "¡Hola! ¿Qué quieres?",
          translation: null,
          corrections: [],
          retryPrompt: null,
          status: "complete",
          correctionsMissing: true,
        },
      ],
    };
    renderScreen();

    expect(screen.getByText("¡Hola! ¿Qué quieres?")).toBeInTheDocument();
    expect(screen.getByText("Suggestions for this reply didn't load.")).toBeInTheDocument();
    expect(screen.queryByText("The reply was cut off.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });
});
