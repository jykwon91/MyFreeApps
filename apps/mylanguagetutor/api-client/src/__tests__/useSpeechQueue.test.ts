// @vitest-environment jsdom
// renderHook needs a DOM; the package's own code still runs DOM-free in every other test.
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NORMAL_RATE, SLOW_RATE } from "../constants/speechRates";
import { useSpeechQueue } from "../hooks/useSpeechQueue";
import type { QueuedSentence } from "../types/speech/queued-sentence";
import type { SpeechEngine } from "../types/speech/speech-engine";

interface Spoken {
  text: string;
  rate: number;
  sentence: QueuedSentence;
}

/** A platform engine that only records what it was asked to say; the test decides when each ends. */
function fakeEngine(canSpeak: SpeechEngine["canSpeak"] = () => true) {
  const spoken: Spoken[] = [];
  const engine: SpeechEngine = {
    speak: (text, rate, sentence) => {
      spoken.push({ text, rate, sentence });
    },
    stop: vi.fn(),
    canSpeak,
  };
  return { engine, spoken };
}

function setup(canSpeak?: SpeechEngine["canSpeak"]) {
  const { engine, spoken } = fakeEngine(canSpeak);
  const hook = renderHook(() => useSpeechQueue("es-MX", engine));
  return { ...hook, engine, spoken };
}

describe("useSpeechQueue", () => {
  it("is speaking while any queued sentence is pending, and not once the last one ends", () => {
    const { result, spoken } = setup();
    expect(result.current.speaking).toBe(false);

    act(() => result.current.enqueue("Hola."));
    act(() => result.current.enqueue("¿Qué tal?"));
    expect(spoken.map((s) => s.text)).toEqual(["Hola.", "¿Qué tal?"]);
    expect(result.current.speaking).toBe(true);

    act(() => spoken[0].sentence.done());
    expect(result.current.speaking).toBe(true);
    act(() => spoken[1].sentence.done());
    expect(result.current.speaking).toBe(false);
  });

  it("ends speaking when the engine fails on the last sentence", () => {
    // Each engine reports a failure as the sentence being done, as both platforms do.
    const { engine } = fakeEngine();
    const failing: SpeechEngine = { ...engine, speak: (_text, _rate, sentence) => sentence.done() };
    const { result } = renderHook(() => useSpeechQueue("es-MX", failing));

    act(() => result.current.enqueue("Hola."));

    expect(result.current.speaking).toBe(false);
  });

  it("speaks what is speakable, at the normal rate unless told otherwise", () => {
    const { result, spoken } = setup();

    act(() => result.current.enqueue("**Hola** (hello)."));
    act(() => result.current.enqueue("Despacio.", SLOW_RATE));

    expect(spoken.map(({ text, rate }) => [text, rate])).toEqual([
      ["Hola .", NORMAL_RATE],
      ["Despacio.", SLOW_RATE],
    ]);
  });

  it("queues nothing for a sentence with nothing to say, or one the engine can't take", () => {
    const canSpeak = vi.fn((text: string) => text !== "Demasiado.");
    const { result, spoken } = setup(canSpeak);

    act(() => result.current.enqueue("(hello) 😀"));
    act(() => result.current.enqueue("Demasiado."));

    expect(canSpeak).toHaveBeenCalledTimes(1);
    expect(spoken).toHaveLength(0);
    expect(result.current.speaking).toBe(false);
  });

  it("speakAll stops what is queued, then reads the text from the start in its place", () => {
    const { result, spoken, engine } = setup();
    act(() => result.current.enqueue("Uno."));
    const before = spoken[0].sentence;

    act(() => result.current.speakAll("Dos. Tres.", SLOW_RATE));

    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(spoken.slice(1).map(({ text, rate }) => [text, rate])).toEqual([
      ["Dos.", SLOW_RATE],
      ["Tres.", SLOW_RATE],
    ]);
    expect(before.isCurrent()).toBe(false);
    expect(result.current.speaking).toBe(true);

    // The stopped sentence ending late doesn't count against the new ones.
    act(() => before.done());
    act(() => spoken[1].sentence.done());
    expect(result.current.speaking).toBe(true);
    act(() => spoken[2].sentence.done());
    expect(result.current.speaking).toBe(false);
  });

  it("ignores a sentence from before a stop, however late it ends", () => {
    const { result, spoken, engine } = setup();
    act(() => result.current.enqueue("Antes."));
    const stale = spoken[0].sentence;
    expect(stale.isCurrent()).toBe(true);

    act(() => result.current.cancel());
    expect(engine.stop).toHaveBeenCalledTimes(1);
    expect(result.current.speaking).toBe(false);
    expect(stale.isCurrent()).toBe(false);

    act(() => result.current.enqueue("Después."));
    act(() => stale.done());
    act(() => stale.done());
    expect(result.current.speaking).toBe(true);
    expect(spoken[1].sentence.isCurrent()).toBe(true);

    act(() => spoken[1].sentence.done());
    expect(result.current.speaking).toBe(false);
  });

  it("stops speaking when the screen goes away", () => {
    const { result, engine, unmount } = setup();
    act(() => result.current.enqueue("Hola."));

    unmount();

    expect(engine.stop).toHaveBeenCalledTimes(1);
  });
});
