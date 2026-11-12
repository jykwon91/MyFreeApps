// Stands in for expo-speech-recognition, the phone's speech recognizer (jest.config.js maps the module
// here: there's no native module under Jest). Like the real one, it answers on later ticks: events
// arrive asynchronously, the recognizer ends on its own once the learner goes quiet, and stop / abort
// end it with the events the phone sends.
import type {
  ExpoSpeechRecognitionErrorCode,
  ExpoSpeechRecognitionNativeEventMap,
  ExpoSpeechRecognitionOptions,
} from "expo-speech-recognition";
import type { ExpoSpeechRecognitionNativeEvents } from "expo-speech-recognition/build/ExpoSpeechRecognitionModule.types";
import { useEffect, useRef } from "react";
import type { FakeRecognitionEventName } from "./types/FakeRecognitionEventName";
import type { FakeRecognizer } from "./types/FakeRecognizer";

export {
  AVAudioSessionCategory,
  AVAudioSessionCategoryOptions,
  AVAudioSessionMode,
} from "expo-speech-recognition/build/constants";

type Listener = (event: unknown) => void;

const NO_RECOGNIZER: FakeRecognizer = {
  available: false,
  onDevice: false,
  installedLocales: [],
  permission: "granted",
  startsLate: false,
  abortsLate: false,
  stopFailsWith: null,
};

let recognizer: FakeRecognizer = NO_RECOGNIZER;
let running = false;
/** Starts asked for and not yet recording (`startsLate`), oldest first; each runs on its own, as on iOS. */
let pendingStarts = 0;
/** A running attempt was reset by a new start: its end follows the new start, as on iOS. */
let resetEndOwed = false;
/** An abort the phone hasn't carried out yet (`abortsLate`). */
let abortOwed = false;
let heard = "";
const listeners = new Map<FakeRecognitionEventName, Set<Listener>>();

/** Every `start` the screen asked for, oldest first. */
export const started: ExpoSpeechRecognitionOptions[] = [];
/** Every time the screen let go of iOS's audio session. */
export const audioSessionReleases: boolean[] = [];
export const permissionRequests: number[] = [];

/** The phone the test runs on. Without this, it has no speech recognizer, so practice is typed. */
export function installRecognizer(next: Partial<FakeRecognizer> = {}): void {
  recognizer = { ...NO_RECOGNIZER, available: true, ...next };
}

export function resetRecognizer(): void {
  recognizer = NO_RECOGNIZER;
  running = false;
  pendingStarts = 0;
  resetEndOwed = false;
  abortOwed = false;
  heard = "";
  started.length = 0;
  audioSessionReleases.length = 0;
  permissionRequests.length = 0;
}

/** The learner allowed the microphone in Settings since. */
export function allowInSettings(): void {
  recognizer = { ...recognizer, permission: "granted" };
}

/** The microphone is recording. */
export function isListening(): boolean {
  return running;
}

function resetRunning(): void {
  if (!running) return;
  running = false;
  heard = "";
  resetEndOwed = true;
}

function recording(): void {
  running = true;
  const owesEnd = resetEndOwed;
  resetEndOwed = false;
  void later(() => {
    emit("start", null);
    emit("audiostart", { uri: null, timestamp: Date.now() });
    // iOS sends the new start straight away and the reset attempt's end later, on the main actor.
    if (owesEnd) emit("end", null);
  });
}

/**
 * The oldest late start (`startsLate`) gets going: recording begins, whatever was sent meanwhile. If
 * another attempt is recording, this start resets it, as iOS does.
 */
export function beginRecording(): Promise<void> {
  if (pendingStarts === 0) throw new Error("The phone isn't starting.");
  pendingStarts -= 1;
  resetRunning();
  recording();
  return later(() => {});
}

/** A late abort (`abortsLate`) is carried out: the `aborted` error, then the end. */
export function finishAborting(): Promise<void> {
  if (!abortOwed) throw new Error("No abort is waiting.");
  abortOwed = false;
  running = false;
  heard = "";
  return later(() => {
    emit("error", { error: "aborted", message: "aborted" });
    emit("end", null);
  });
}

function emit<K extends FakeRecognitionEventName>(name: K, event: ExpoSpeechRecognitionNativeEventMap[K]): void {
  listeners.get(name)?.forEach((listener) => listener(event));
}

/** Runs on a later tick, as the native module's events do. Not a timer: the router's tests fake those. */
function later(send: () => void): Promise<void> {
  return Promise.resolve().then(send);
}

function result(transcript: string, isFinal: boolean): void {
  emit("result", { isFinal, results: [{ transcript, confidence: isFinal ? 0.9 : 0, segments: [] }] });
}

function end(): void {
  running = false;
  heard = "";
  emit("end", null);
}

/** The learner's words so far, as the recognizer's changing guess. */
export function hear(words: string): Promise<void> {
  if (!running) throw new Error("The phone isn't listening.");
  heard = words;
  return later(() => result(words, false));
}

/** The learner went quiet: the recognizer settles on `words` (or what it heard) and ends on its own. */
export function goQuiet(words: string = heard): Promise<void> {
  return later(() => {
    result(words, true);
    end();
  });
}

/** The recognizer settles on `words` (or what it heard) as final, without ending yet. */
export function settle(words: string = heard): Promise<void> {
  return later(() => result(words, true));
}

/** As Android's ERROR_NO_MATCH: a nomatch, the `no-speech` error, then the end. */
function noMatch(): void {
  emit("nomatch", null);
  emit("error", { error: "no-speech", message: "no-speech" });
  end();
}

/** The recognizer heard nothing it could make words of, and ends. */
export function hearNothing(): Promise<void> {
  return later(() => {
    emit("nomatch", null);
    end();
  });
}

/** The recognizer fails with `error` (a call took the microphone: `interrupted`), and ends. */
export function failWith(error: ExpoSpeechRecognitionErrorCode): Promise<void> {
  return later(() => {
    emit("error", { error, message: error });
    end();
  });
}

/** The phone fails to start with `error` and, as iOS can, never sends an end; the start is dropped. */
export function failToStart(error: ExpoSpeechRecognitionErrorCode): Promise<void> {
  if (pendingStarts === 0) throw new Error("The phone isn't starting.");
  pendingStarts -= 1;
  return later(() => emit("error", { error, message: error }));
}

/** An end the phone sends late, for an attempt already over. */
export function strayEnd(): Promise<void> {
  return later(() => emit("end", null));
}

function permissionResponse() {
  const granted = recognizer.permission === "granted";
  return { granted, status: granted ? "granted" : "denied", canAskAgain: granted, expires: "never" } as const;
}

export const ExpoSpeechRecognitionModule = {
  isRecognitionAvailable: () => recognizer.available,
  supportsOnDeviceRecognition: () => recognizer.onDevice,
  getSupportedLocales: async () => ({
    locales: recognizer.installedLocales,
    installedLocales: recognizer.onDevice ? recognizer.installedLocales : [],
  }),
  requestPermissionsAsync: async () => {
    permissionRequests.push(permissionRequests.length + 1);
    return permissionResponse();
  },
  getPermissionsAsync: async () => permissionResponse(),
  /** As iOS does, starting again while an attempt runs resets it: that attempt's end follows the new start. */
  start: (options: ExpoSpeechRecognitionOptions) => {
    started.push(options);
    if (recognizer.startsLate) {
      pendingStarts += 1;
      return;
    }
    resetRunning();
    recording();
  },
  /**
   * As the phone does: what was heard becomes final, then it ends (or, with `stopFailsWith`, an error
   * and the end). Before recording, it just ends.
   */
  stop: () => {
    if (running && recognizer.stopFailsWith === "no-speech") void later(noMatch);
    else if (running && recognizer.stopFailsWith) void failWith(recognizer.stopFailsWith);
    else if (running) void goQuiet();
    else if (pendingStarts > 0) void later(() => emit("end", null));
  },
  /** As the phone does: an `aborted` error, then the end, with nothing final. */
  abort: () => {
    if (running && recognizer.abortsLate) abortOwed = true;
    else if (running) void failWith("aborted");
    else if (pendingStarts > 0) void later(() => {
      emit("error", { error: "aborted", message: "aborted" });
      emit("end", null);
    });
  },
  setAudioSessionActiveIOS: (value: boolean) => {
    audioSessionReleases.push(value);
  },
  addListener: <K extends FakeRecognitionEventName>(name: K, listener: ExpoSpeechRecognitionNativeEvents[K]) => {
    const set = listeners.get(name) ?? new Set<Listener>();
    set.add(listener as Listener);
    listeners.set(name, set);
    return { remove: () => set.delete(listener as Listener) };
  },
};

/** As the real hook (expo's useEventListener): subscribed while mounted, always calling the latest listener. */
export function useSpeechRecognitionEvent<K extends FakeRecognitionEventName>(
  name: K,
  listener: ExpoSpeechRecognitionNativeEvents[K],
): void {
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  }, [listener]);
  useEffect(() => {
    const subscription = ExpoSpeechRecognitionModule.addListener(name, ((event: ExpoSpeechRecognitionNativeEventMap[K]) =>
      latest.current(event as never)) as ExpoSpeechRecognitionNativeEvents[K]);
    return () => {
      subscription.remove();
    };
  }, [name]);
}
