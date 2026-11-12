import type { SpeechOptions } from "expo-speech";

/** One `Speech.speak` call: what the phone was asked to say, and how. */
export interface SpokenUtterance {
  text: string;
  options: SpeechOptions;
}
