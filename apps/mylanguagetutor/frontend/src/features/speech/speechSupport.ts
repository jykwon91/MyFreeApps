import type { RecognitionConstructor } from "@/types/speech/speech-recognition";

/**
 * The browser's speech-recognition constructor, or null where speaking isn't
 * supported (Firefox) -- the practice screen then switches to typed practice.
 */
export function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function hasSpeechSynthesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}
