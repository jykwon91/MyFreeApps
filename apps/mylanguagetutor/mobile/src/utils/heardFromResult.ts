import type { HeardSpeech } from "@mylanguagetutor/api-client/types/speech/heard-speech";
import type { ExpoSpeechRecognitionResultEvent } from "expo-speech-recognition";

/**
 * What the phone has heard, from one recognizer result. Unlike the browser's, each result holds the
 * whole utterance so far (its `results` are alternatives, best first), so it replaces what came before.
 */
export function heardFromResult({ isFinal, results }: ExpoSpeechRecognitionResultEvent): HeardSpeech {
  const transcript = results[0]?.transcript ?? "";
  return isFinal ? { finalText: transcript, interimText: "" } : { finalText: "", interimText: transcript };
}
