import type { ExpoSpeechRecognitionOptions } from "expo-speech-recognition";
import { Platform } from "react-native";
import { LISTENING_AUDIO_SESSION } from "../constants/voice";

/**
 * One utterance in the target language, as the website listens: it ends when the learner goes quiet,
 * with the words shown as they're heard. On-device recognition is required wherever the phone has it for
 * the language. Android says so up front; iOS doesn't say for a given language, but applies the
 * requirement only where its recognizer for that language supports it, so it's always asked for there.
 */
export function recognitionOptions(locale: string, onDevice: boolean): ExpoSpeechRecognitionOptions {
  return {
    lang: locale,
    interimResults: true,
    continuous: false,
    maxAlternatives: 1,
    requiresOnDeviceRecognition: onDevice || Platform.OS === "ios",
    iosCategory: LISTENING_AUDIO_SESSION,
  };
}
