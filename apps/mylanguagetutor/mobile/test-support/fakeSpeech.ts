// Stands in for expo-speech, the phone's text-to-speech:
// jest.mock("expo-speech", () => jest.requireActual("../test-support/fakeSpeech")).
import type { SpeechOptions, Voice } from "expo-speech";
import { VoiceQuality } from "expo-speech/build/Speech.types";
import type { SpokenUtterance } from "./types/SpokenUtterance";

export { VoiceQuality };

/** Android's limit, which the real module reports on both platforms. */
export const maxSpeechInputLength = 4000;

/** Everything the phone has said, oldest first, with a `null` wherever speech was stopped. */
export const spoken: (SpokenUtterance | null)[] = [];
let voices: Voice[] | Error | Promise<Voice[]> = [];
const failingVoices = new Set<string>();
let unreported: (() => void)[] = [];
let unfinished: (() => void)[] = [];

/** The voices the phone lists, the error listing them fails with, or a list that arrives later. */
export function installVoices(next: Voice[] | Error | Promise<Voice[]>): void {
  voices = next;
}

/** Makes the phone fail to speak in the voice `identifier`: it says nothing, and reports why later. */
export function failVoice(identifier: string): void {
  failingVoices.add(identifier);
}

/**
 * The engine reports the failures it has met so far, as the real module does: asynchronously, once
 * it reaches each failed sentence. Returns how many it reported.
 */
export function reportFailures(): number {
  const reports = unreported;
  unreported = [];
  reports.forEach((report) => report());
  return reports.length;
}

export function resetSpeech(): void {
  spoken.length = 0;
  voices = [];
  failingVoices.clear();
  unreported = [];
  unfinished = [];
}

/** The phone finishes saying everything queued, telling the screen of each sentence as it ends. */
export function finishSpeaking(): void {
  const finishing = unfinished;
  unfinished = [];
  finishing.forEach((finish) => finish());
}

/** What was said since speech last stopped, as the learner would hear it. */
export function saidSinceStop(): string[] {
  const lastStop = spoken.lastIndexOf(null);
  return spoken.slice(lastStop + 1).flatMap((utterance) => (utterance ? [utterance.text] : []));
}

export function speak(text: string, { onError, onDone, onStopped: _onStopped, onStart: _onStart, ...options }: SpeechOptions = {}): void {
  if (options.voice !== undefined && failingVoices.has(options.voice)) {
    unreported.push(() => onError?.(new Error("Speech synthesis failed")));
    return;
  }
  spoken.push({ text, options });
  unfinished.push(() => onDone?.());
}

export async function stop(): Promise<void> {
  spoken.push(null);
  unfinished = [];
}

export async function getAvailableVoicesAsync(): Promise<Voice[]> {
  if (voices instanceof Error) throw voices;
  return voices;
}

/** A voice the phone lists. */
export function voice(identifier: string, language: string, quality: VoiceQuality = VoiceQuality.Default): Voice {
  return { identifier, name: identifier, language, quality };
}
