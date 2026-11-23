import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpeechSynthesis } from "@/features/speech/useSpeechSynthesis";

const SPANISH_VOICE = { name: "Paulina", lang: "es-MX", localService: true } as SpeechSynthesisVoice;

/** The browser's speech engine: it starts with no voices and loads them later. */
class FakeSynth extends EventTarget {
  voices: SpeechSynthesisVoice[] = [];
  spoken: SpeechSynthesisUtterance[] = [];
  getVoices = () => this.voices;
  speak = (utterance: SpeechSynthesisUtterance) => {
    this.spoken.push(utterance);
  };
  cancel = vi.fn();
  loadVoices(voices: SpeechSynthesisVoice[]) {
    this.voices = voices;
    this.dispatchEvent(new Event("voiceschanged"));
  }
}

describe("useSpeechSynthesis", () => {
  let synth: FakeSynth;

  beforeEach(() => {
    synth = new FakeSynth();
    vi.stubGlobal("speechSynthesis", synth);
    vi.stubGlobal(
      "SpeechSynthesisUtterance",
      class {
        voice: SpeechSynthesisVoice | null = null;
        lang = "";
        rate = 1;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(public text: string) {}
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("speaks a later sentence in a voice that loaded after the turn began", () => {
    const { result, unmount } = renderHook(() => useSpeechSynthesis("es-MX"));
    // The turn begins: the caller holds on to this enqueue for the whole reply.
    const { enqueue } = result.current;

    act(() => enqueue("Hola."));
    act(() => synth.loadVoices([SPANISH_VOICE]));
    act(() => enqueue("¿Cómo estás?"));

    expect(synth.spoken[0].voice).toBeNull();
    expect(synth.spoken[1].voice).toBe(SPANISH_VOICE);
    unmount();
  });
});
