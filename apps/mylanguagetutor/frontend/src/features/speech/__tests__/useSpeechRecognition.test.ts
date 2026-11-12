import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpeechRecognition } from "@/features/speech/useSpeechRecognition";
import type { Recognition, RecognitionErrorEvent, RecognitionResultEvent } from "@/types/speech/speech-recognition";

/** The browser's recognizer, driven by the test: it calls the handlers the hook sets. */
class FakeRecognition implements Recognition {
  static instances: FakeRecognition[] = [];
  /** The browser throws on start, as it does when it can't listen. */
  static refuses = false;
  lang = "";
  continuous = true;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: RecognitionResultEvent) => void) | null = null;
  onerror: ((event: RecognitionErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  start = vi.fn(() => {
    if (FakeRecognition.refuses) throw new Error("InvalidStateError");
  });
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn();

  constructor() {
    FakeRecognition.instances.push(this);
  }

  /** The browser's results so far: each `[transcript, isFinal]`. */
  hear(...results: [string, boolean][]): void {
    const list = results.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal }));
    this.onresult?.({ resultIndex: 0, results: list });
  }

  fail(error: string): void {
    this.onerror?.({ error });
    this.onend?.();
  }
}

function latest(): FakeRecognition {
  const recognition = FakeRecognition.instances[FakeRecognition.instances.length - 1];
  if (!recognition) throw new Error("Nothing was started.");
  return recognition;
}

function listen() {
  const onFinal = vi.fn();
  const hook = renderHook(() => useSpeechRecognition("es-MX", onFinal));
  act(() => hook.result.current.start());
  return { ...hook, onFinal };
}

beforeEach(() => {
  FakeRecognition.instances = [];
  FakeRecognition.refuses = false;
  vi.stubGlobal("SpeechRecognition", FakeRecognition);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSpeechRecognition", () => {
  it("is unsupported without a browser recognizer", () => {
    vi.stubGlobal("SpeechRecognition", undefined);
    expect(renderHook(() => useSpeechRecognition("es-MX", vi.fn())).result.current.supported).toBe(false);
  });

  it("starts one utterance in the language, with the words as they're heard", () => {
    const { result } = listen();
    expect(result.current).toMatchObject({ supported: true, listening: true, interim: "", failure: null });
    expect(latest()).toMatchObject({ lang: "es-MX", continuous: false, interimResults: true, maxAlternatives: 1 });
    expect(latest().start).toHaveBeenCalledTimes(1);

    act(() => result.current.start());
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("shows the settled words, then the guess still changing", () => {
    const { result } = listen();
    act(() => latest().hear(["Quiero ", true], ["un ca", false]));
    expect(result.current.interim).toBe("Quiero un ca");
  });

  it("sends the final words when the browser ends", () => {
    const { result, onFinal } = listen();
    act(() => latest().hear(["Quiero un café", true]));
    act(() => latest().onend?.());
    expect(onFinal).toHaveBeenCalledWith("Quiero un café");
    expect(result.current).toMatchObject({ listening: false, interim: "" });
  });

  it("sends the last guess when the browser ends with nothing final", () => {
    const { onFinal } = listen();
    act(() => latest().hear(["Quiero un ca", false]));
    act(() => latest().onend?.());
    expect(onFinal).toHaveBeenCalledWith("Quiero un ca");
  });

  it("sends nothing when nothing was heard", () => {
    const { onFinal } = listen();
    act(() => latest().onend?.());
    expect(onFinal).not.toHaveBeenCalled();
  });

  it.each([
    ["not-allowed", "denied"],
    ["service-not-allowed", "denied"],
    ["no-speech", "no_speech"],
    ["network", "unavailable"],
  ])("reports %s as %s", (error, failure) => {
    const { result } = listen();
    act(() => latest().fail(error));
    expect(result.current).toMatchObject({ failure, listening: false });
  });

  it("ignores aborted, which it caused itself", () => {
    const { result } = listen();
    act(() => latest().fail("aborted"));
    expect(result.current.failure).toBeNull();
  });

  it("clears the failure on the next start, or when asked", () => {
    const { result } = listen();
    act(() => latest().fail("no-speech"));
    act(() => result.current.start());
    expect(result.current.failure).toBeNull();
    act(() => latest().fail("no-speech"));
    act(() => result.current.clearFailure());
    expect(result.current.failure).toBeNull();
  });

  it("stops by asking the browser to finish, which sends what it heard", () => {
    const { result, onFinal } = listen();
    act(() => latest().hear(["Hola", false]));
    act(() => result.current.stop());
    expect(latest().stop).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith("Hola");
  });

  it("says recognition isn't working when the browser refuses to start", () => {
    FakeRecognition.refuses = true;
    const { result } = listen();
    expect(result.current).toMatchObject({ failure: "unavailable", listening: false });
  });

  it("aborts when the screen closes", () => {
    const { unmount } = listen();
    unmount();
    expect(latest().abort).toHaveBeenCalledTimes(1);
  });
});
