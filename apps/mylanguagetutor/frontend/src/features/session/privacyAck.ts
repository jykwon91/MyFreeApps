import { VOICE_PRIVACY_ACK_STORAGE_ITEM } from "@mylanguagetutor/api-client/constants/voicePrivacyAck";

/** Has the learner already read the voice privacy notice on this device? */
export function hasAckedVoicePrivacy(): boolean {
  try {
    return localStorage.getItem(VOICE_PRIVACY_ACK_STORAGE_ITEM) === "1";
  } catch {
    return false;
  }
}

export function ackVoicePrivacy(): void {
  try {
    localStorage.setItem(VOICE_PRIVACY_ACK_STORAGE_ITEM, "1");
  } catch {
    // Storage blocked (private mode): the notice simply shows again next time.
  }
}
