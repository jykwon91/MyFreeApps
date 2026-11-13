/**
 * Replaces the browser's Web Speech API before the app loads, so specs run the
 * same on every machine. Text-to-speech records each sentence (text, locale,
 * rate) and finishes at once instead of playing audio. Recognition is either
 * absent (Firefox: typed practice only) or a recogniser that is never fed
 * audio -- these specs have no microphone -- which counts how often the app
 * starts it.
 */
import type { Page } from "@playwright/test";
import type { SpeechFakeOptions } from "../types/SpeechFakeOptions";
import type { SpeechFakeWindow } from "../types/SpeechFakeWindow";
import type { SpokenUtterance } from "../types/SpokenUtterance";

export async function installSpeechFakes(page: Page, { recognition }: SpeechFakeOptions): Promise<void> {
  await page.addInitScript((canRecognise: boolean) => {
    const fakeWindow = window as unknown as SpeechFakeWindow & Record<string, unknown>;
    fakeWindow.__spoken = [];
    fakeWindow.__recognitionStarts = 0;

    class FakeUtterance {
      text: string;
      lang = "";
      rate = 1;
      voice: SpeechSynthesisVoice | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }

    const synthesis = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: (): SpeechSynthesisVoice[] => [],
      speak(utterance: FakeUtterance) {
        fakeWindow.__spoken.push({ text: utterance.text, lang: utterance.lang, rate: utterance.rate });
        setTimeout(() => utterance.onend?.(), 0);
      },
      cancel: () => undefined,
      pause: () => undefined,
      resume: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    Object.defineProperty(window, "speechSynthesis", { value: synthesis, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });

    class SilentRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      onresult = null;
      onerror = null;
      onend: (() => void) | null = null;
      onstart = null;
      start() {
        fakeWindow.__recognitionStarts += 1;
      }
      stop() {
        this.onend?.();
      }
      abort() {
        this.onend?.();
      }
    }
    const recogniser = canRecognise ? SilentRecognition : undefined;
    Object.defineProperty(window, "SpeechRecognition", { value: recogniser, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: recogniser, configurable: true });
  }, recognition);
}

/** Every sentence handed to text-to-speech so far. */
export function spokenUtterances(page: Page): Promise<SpokenUtterance[]> {
  return page.evaluate(() => (window as unknown as SpeechFakeWindow).__spoken);
}

/** How often the app started speech recognition. */
export function recognitionStarts(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as SpeechFakeWindow).__recognitionStarts);
}
