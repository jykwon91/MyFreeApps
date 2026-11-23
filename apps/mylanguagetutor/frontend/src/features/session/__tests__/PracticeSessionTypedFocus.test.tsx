import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PracticeSession from "@/features/session/PracticeSession";
import type { PracticeSession as PracticeSessionState } from "@mylanguagetutor/api-client/types/session/practice-session";
import type { SpeechRecognitionControls } from "@mylanguagetutor/api-client/types/speech/speech-recognition-controls";
import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";

const send = vi.fn();
let sessionState: PracticeSessionState;

const RECOGNITION: SpeechRecognitionControls = {
  supported: false,
  listening: false,
  interim: "",
  failure: null,
  start: vi.fn(),
  stop: vi.fn(),
  abort: vi.fn(),
  clearFailure: vi.fn(),
};

vi.mock("@mylanguagetutor/api-client/hooks/usePracticeSession", () => ({
  usePracticeSession: () => sessionState,
}));
vi.mock("@/features/speech/useSpeechRecognition", () => ({
  useSpeechRecognition: () => RECOGNITION,
}));
vi.mock("@/features/speech/useSpeechSynthesis", () => ({
  useSpeechSynthesis: () => ({ supported: true, speaking: false, enqueue: vi.fn(), speakAll: vi.fn(), cancel: vi.fn() }),
}));

const LANGUAGE: Language = { code: "es", display_name: "Spanish", dialect_label: "Latin American", stt_locale: "es-MX", tts_locale: "es-MX" };
const SCENARIO: Scenario = { slug: "cafe", title: "At the café", goal: "Order a drink", goals: ["Greet"], order: 4 };

function screenFor() {
  return (
    <MemoryRouter>
      <PracticeSession language={LANGUAGE} scenario={SCENARIO} level="beginner" />
    </MemoryRouter>
  );
}

describe("typed practice during a turn", () => {
  beforeEach(() => {
    send.mockReset();
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
      resume: vi.fn(),
      dismissFailure: vi.fn(),
      dismissRetryPrompt: vi.fn(),
    };
  });

  it("keeps the field focused and editable while a reply is on its way, and Enter does not send", () => {
    const { rerender } = render(screenFor());
    const field = screen.getByRole("textbox");
    field.focus();
    fireEvent.change(field, { target: { value: "Hola" } });
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(send).toHaveBeenCalledTimes(1);

    sessionState = { ...sessionState, requestPhase: "waiting" };
    rerender(screenFor());

    expect(field).toBeEnabled();
    expect(field).toHaveFocus();
    fireEvent.change(field, { target: { value: "¿Cómo estás?" } });
    expect(field).toHaveValue("¿Cómo estás?");
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Sending/ })).toBeDisabled();

    sessionState = { ...sessionState, requestPhase: "idle" };
    rerender(screenFor());

    expect(field).toHaveFocus();
    expect(field).toHaveValue("¿Cómo estás?");
    fireEvent.submit(field.closest("form") as HTMLFormElement);
    expect(send).toHaveBeenLastCalledWith("¿Cómo estás?");
  });
});
