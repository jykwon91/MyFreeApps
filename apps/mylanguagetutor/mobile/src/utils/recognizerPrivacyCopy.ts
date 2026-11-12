import { Platform } from "react-native";
import { PHONE_VOICE_COPY } from "../constants/voice";
import type { RecognizerPrivacy } from "../types/RecognizerPrivacy";

/** The privacy notice's line on where the learner's speech becomes text. */
export function recognizerPrivacyCopy(privacy: RecognizerPrivacy): string {
  if (privacy === "on_device") return PHONE_VOICE_COPY.recognizerOnDevice;
  return Platform.OS === "ios" ? PHONE_VOICE_COPY.recognizerMaySendIos : PHONE_VOICE_COPY.recognizerMaySendAndroid;
}
