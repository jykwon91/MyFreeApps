import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSpeechRecognition } from "@/features/speech/useSpeechRecognition";
import type { Recognition, RecognitionErrorEvent, RecognitionResultEvent } from "@/types/speech/speech-recognition";

/** The browser's recognizer, driven by the test: it calls the handlers the hook sets. */
class FakeRecognition implements Recognition {
  static instances: FakeRecognition[] = [];
  /** The browser throws on start, as it does when it can't listen. */
  static refuses = false;
  /** The browser answers stop with this error, then the end, instead of settling on the words. */
  static stopFailsWith: string | null = null;
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
  stop = vi.fn(() => {
    if (FakeRecognition.stopFailsWith) this.fail(FakeRecognition.stopFailsWith);
    else this.onend?.();
  });
  /** As the browser does: an ``aborted`` error, then the end, with nothing final. */
  abort = vi.fn(() => this.fail("aborted"));

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
  FakeRecognition.stopFailsWith = null;
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

  it("aborts when the screen closes, sending nothing of what was heard", () => {
    const { unmount, onFinal } = listen();
    act(() => latest().hear(["Quiero un ca", false]));
    unmount();
    expect(latest().abort).toHaveBeenCalledTimes(1);
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("sends what was heard when the browser says it heard nothing after hearing words", () => {
    const { result, onFinal } = listen();
    act(() => latest().hear(["Quiero un café", false]));
    act(() => latest().fail("no-speech"));
    expect(onFinal).toHaveBeenCalledWith("Quiero un café");
    expect(result.current.listening).toBe(false);
  });

  it("drops what was heard, calmly, when the microphone is lost mid-answer", () => {
    const { result, onFinal } = listen();
    act(() => latest().hear(["Quiero", false]));
    act(() => latest().fail("audio-capture"));
    expect(onFinal).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ failure: "interrupted", listening: false });
  });

  it("sends what was heard when the browser answers the learner's stop with a client error", () => {
    FakeRecognition.stopFailsWith = "client";
    const { result, onFinal } = listen();
    act(() => latest().hear(["Quiero un café", false]));
    act(() => result.current.stop());
    expect(onFinal).toHaveBeenCalledWith("Quiero un café");
    expect(result.current).toMatchObject({ failure: null, listening: false });
  });

  it("drops what was heard, calmly, on a client error mid-answer with no stop asked for", () => {
    const { result, onFinal } = listen();
    act(() => latest().hear(["Quiero", false]));
    act(() => latest().fail("client"));
    expect(onFinal).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ failure: "interrupted", listening: false });
  });

  it("drops what was heard when the screen closes after the learner asked to send", () => {
    FakeRecognition.stopFailsWith = "client";
    const { result, unmount, onFinal } = listen();
    act(() => latest().hear(["Quiero", false]));
    const recognition = latest();
    recognition.stop = vi.fn();
    act(() => result.current.stop());
    unmount();
    expect(recognition.abort).toHaveBeenCalledTimes(1);
    expect(onFinal).not.toHaveBeenCalled();
  });

  it("drops what was heard when the speech service fails mid-answer", () => {
    const { result, onFinal } = listen();
    act(() => latest().hear(["Quiero", false]));
    act(() => latest().fail("network"));
    expect(onFinal).not.toHaveBeenCalled();
    expect(result.current.failure).toBe("unavailable");
  });

  it("says recognition isn't working when there's no microphone: Chrome starts, then can't record", () => {
    const { result } = listen();
    act(() => latest().fail("audio-capture"));
    expect(result.current).toMatchObject({ failure: "unavailable", listening: false });
  });

  it("says recognition isn't working when the microphone can't record before listening begins", () => {
    const { result } = listen();
    act(() => latest().fail("audio-capture"));
    expect(result.current.failure).toBe("unavailable");
  });

  it("sends a finished answer when an error arrives after its final result", () => {
    const { result, onFinal } = listen();
    act(() => latest().hear(["Quiero un café", true]));
    act(() => latest().fail("client"));
    expect(onFinal).toHaveBeenCalledWith("Quiero un café");
    expect(result.current.failure).toBeNull();
  });

  it("drops a finished answer when the screen closes before the browser ends", () => {
    const { unmount, onFinal } = listen();
    act(() => latest().hear(["Quiero un café", true]));
    unmount();
    expect(onFinal).not.toHaveBeenCalled();
  });

  it.each(["client", "no-speech"])("shows nothing when the learner stops with nothing heard and the browser answers with %s", (error) => {
    FakeRecognition.stopFailsWith = error;
    const { result, onFinal } = listen();
    act(() => result.current.stop());
    expect(onFinal).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ failure: null, listening: false });
  });

  it("listens afresh after a dropped answer, and sends the next one", () => {
    const { result, onFinal } = listen();
    act(() => latest().hear(["Quiero", false]));
    act(() => latest().fail("audio-capture"));
    act(() => result.current.start());
    act(() => latest().hear(["Quiero un café", true]));
    act(() => latest().onend?.());
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(onFinal).toHaveBeenCalledWith("Quiero un café");
  });
});
