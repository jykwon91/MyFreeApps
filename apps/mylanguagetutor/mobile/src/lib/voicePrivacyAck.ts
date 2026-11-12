import * as SecureStore from "expo-secure-store";
import { VOICE_PRIVACY_ACK_STORAGE_ITEM } from "@mylanguagetutor/api-client/constants/voicePrivacyAck";
import type { RecognizerPrivacy } from "../types/RecognizerPrivacy";

/** Which privacy notice the learner has read on this phone, if any. If the phone won't say, it shows again. */
export async function readVoicePrivacyAck(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(VOICE_PRIVACY_ACK_STORAGE_ITEM);
  } catch (error) {
    console.warn("Couldn't read whether the voice privacy notice was read; showing it", error);
    return null;
  }
}

/** Keeps that the learner read the notice for `privacy`. Failing only means it shows again next time. */
export async function writeVoicePrivacyAck(privacy: RecognizerPrivacy): Promise<void> {
  try {
    await SecureStore.setItemAsync(VOICE_PRIVACY_ACK_STORAGE_ITEM, privacy);
  } catch (error) {
    console.warn("Couldn't keep that the voice privacy notice was read", error);
  }
}
