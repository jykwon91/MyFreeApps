import { MemoryRouter } from "react-router-dom";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PracticeSession from "@/features/session/PracticeSession";
import { MIC_DENIED_COPY } from "@/constants/micDeniedCopy";
import type { PracticeSession as PracticeSessionState } from "@mylanguagetutor/api-client/types/session/practice-session";
import type { Language } from "@mylanguagetutor/api-client/types/catalog/language";
import type { Scenario } from "@mylanguagetutor/api-client/types/catalog/scenario";

const sessionState: PracticeSessionState = {
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

vi.mock("@mylanguagetutor/api-client/hooks/usePracticeSession", () => ({
  usePracticeSession: () => sessionState,
}));
// A recognizer the browser has already refused, that really forgets the refusal when told to.
vi.mock("@/features/speech/useSpeechRecognition", async () => {
  const { useCallback, useState } = await import("react");
  return {
    useSpeechRecognition: () => {
      const [failure, setFailure] = useState<"denied" | null>("denied");
      const clearFailure = useCallback(() => setFailure(null), []);
      return { supported: true, listening: false, interim: "", failure, start: vi.fn(), stop: vi.fn(), abort: vi.fn(), clearFailure };
    },
  };
});
vi.mock("@/features/speech/useSpeechSynthesis", () => ({
  useSpeechSynthesis: () => ({ supported: true, speaking: false, enqueue: vi.fn(), speakAll: vi.fn(), cancel: vi.fn() }),
}));

const LANGUAGE: Language = { code: "es", display_name: "Spanish", dialect_label: "Latin American", stt_locale: "es-MX", tts_locale: "es-MX" };
const SCENARIO: Scenario = { slug: "cafe", title: "At the café", goal: "Order a drink", goals: ["Greet"], order: 4 };

/** The browser's microphone permission, which the test can change as the learner would in site settings. */
class FakePermissionStatus extends EventTarget {
  state: PermissionState = "denied";

  grant(): void {
    this.state = "granted";
    this.dispatchEvent(new Event("change"));
  }
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <PracticeSession language={LANGUAGE} scenario={SCENARIO} level="beginner" />
    </MemoryRouter>,
  );
}

describe("PracticeSession when the browser has blocked the microphone", () => {
  beforeEach(() => {
    localStorage.setItem("ltutor.voicePrivacyAck.v1", "1");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("brings the microphone back when access is allowed in the browser, without a reload", async () => {
    const status = new FakePermissionStatus();
    const query = vi.fn(async () => status);
    vi.stubGlobal("navigator", { ...navigator, permissions: { query } });

    renderScreen();

    expect(await screen.findByText(MIC_DENIED_COPY.allow)).toBeInTheDocument();
    expect(query).toHaveBeenCalledWith({ name: "microphone" });

    act(() => status.grant());

    expect(screen.queryByText("Microphone is blocked")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tap to speak" })).toBeInTheDocument();
  });

  it("stops listening for the change once the learner moves on", async () => {
    const status = new FakePermissionStatus();
    const removeListener = vi.spyOn(status, "removeEventListener");
    vi.stubGlobal("navigator", { ...navigator, permissions: { query: async () => status } });

    renderScreen();
    await screen.findByText(MIC_DENIED_COPY.allow);
    cleanup();

    expect(removeListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("keeps the reload hint, and doesn't crash, when the browser has no permissions API", () => {
    vi.stubGlobal("navigator", { ...navigator, permissions: undefined });

    renderScreen();

    expect(screen.getByText(MIC_DENIED_COPY.allowThenReload)).toBeInTheDocument();
  });

  it("keeps the reload hint when the browser refuses to query the microphone", async () => {
    const query = vi.fn(async () => {
      throw new TypeError("'microphone' is not a valid value for enumeration PermissionName");
    });
    vi.stubGlobal("navigator", { ...navigator, permissions: { query } });

    renderScreen();
    await act(async () => {
      await query.mock.results[0]?.value.catch(() => undefined);
    });

    expect(screen.getByText(MIC_DENIED_COPY.allowThenReload)).toBeInTheDocument();
  });

  it("keeps the reload hint when the browser throws on the query itself", () => {
    const query = vi.fn(() => {
      throw new TypeError("not supported");
    });
    vi.stubGlobal("navigator", { ...navigator, permissions: { query } });

    expect(() => renderScreen()).not.toThrow();
    expect(screen.getByText(MIC_DENIED_COPY.allowThenReload)).toBeInTheDocument();
  });
});
