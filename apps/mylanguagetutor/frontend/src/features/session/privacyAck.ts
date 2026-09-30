const PRIVACY_ACK_STORAGE_ITEM = "ltutor.voicePrivacyAck.v1";

/** Has the learner already read the voice privacy notice on this device? */
export function hasAckedVoicePrivacy(): boolean {
  try {
    return localStorage.getItem(PRIVACY_ACK_STORAGE_ITEM) === "1";
  } catch {
    return false;
  }
}

export function ackVoicePrivacy(): void {
  try {
    localStorage.setItem(PRIVACY_ACK_STORAGE_ITEM, "1");
  } catch {
    // Storage blocked (private mode): the notice simply shows again next time.
  }
}
