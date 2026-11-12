// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useVoiceInput } from "../hooks/useVoiceInput";
import type { VoiceInputConfig } from "../types/session/voice-input-config";
import type { SpeechRecognitionControls } from "../types/speech/speech-recognition-controls";

function recognition(overrides: Partial<SpeechRecognitionControls> = {}): SpeechRecognitionControls {
  return { supported: true, listening: false, interim: "", failure: null, start: vi.fn(), stop: vi.fn(), clearFailure: vi.fn(), ...overrides };
}

function config(overrides: Partial<VoiceInputConfig> = {}): VoiceInputConfig {
  return {
    recognition: recognition(),
    speaking: false,
    stopSpeaking: vi.fn(),
    requestPhase: "idle",
    block: null,
    privacyAcked: true,
    ackPrivacy: vi.fn(),
    ...overrides,
  };
}

describe("useVoiceInput", () => {
  it("speaks where recognition is supported, and types where it isn't", () => {
    expect(renderHook(() => useVoiceInput(config())).result.current).toMatchObject({ mode: "voice", view: "voice", phase: "idle" });
    const typed = renderHook(() => useVoiceInput(config({ recognition: recognition({ supported: false }) })));
    expect(typed.result.current).toMatchObject({ mode: "text", view: "text" });
  });

  it("stops the tutor's voice before listening, so tapping while it speaks interrupts it", () => {
    const order: string[] = [];
    const settings = config({
      speaking: true,
      stopSpeaking: () => order.push("stop speaking"),
      recognition: recognition({ start: () => order.push("listen") }),
    });
    const { result } = renderHook(() => useVoiceInput(settings));
    expect(result.current.phase).toBe("speaking");
    act(() => result.current.startListening());
    expect(order).toEqual(["stop speaking", "listen"]);
  });

  it("doesn't listen while a turn is in flight or the session is blocked", () => {
    const busy = config({ requestPhase: "waiting" });
    const blocked = config({ block: "daily_limit" });
    for (const settings of [busy, blocked]) {
      const { result } = renderHook(() => useVoiceInput(settings));
      act(() => result.current.startListening());
    }
    expect(busy.recognition.start).not.toHaveBeenCalled();
    expect(busy.stopSpeaking).not.toHaveBeenCalled();
    expect(blocked.recognition.start).not.toHaveBeenCalled();
  });

  it("keeps that the notice was read, then listens", () => {
    const settings = config({ privacyAcked: false });
    const { result } = renderHook(() => useVoiceInput(settings));
    expect(result.current.view).toBe("privacy");
    act(() => result.current.acceptPrivacy());
    expect(settings.ackPrivacy).toHaveBeenCalledTimes(1);
    expect(settings.recognition.start).toHaveBeenCalledTimes(1);
  });

  it("stops listening and clears the last failure on switching to typing, and switches back", () => {
    const settings = config({ recognition: recognition({ failure: "denied" }) });
    const { result } = renderHook(() => useVoiceInput(settings));
    expect(result.current.view).toBe("denied");
    act(() => result.current.switchToText());
    expect(settings.recognition.stop).toHaveBeenCalledTimes(1);
    expect(settings.recognition.clearFailure).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ mode: "text", view: "text" });
    act(() => result.current.switchToVoice());
    expect(result.current.mode).toBe("voice");
  });

  it("is listening while the microphone is open, over the tutor's voice", () => {
    const settings = config({ speaking: true, recognition: recognition({ listening: true }) });
    expect(renderHook(() => useVoiceInput(settings)).result.current.phase).toBe("listening");
  });
});
