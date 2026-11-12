import type { RecognizerPrivacy } from "../types/RecognizerPrivacy";

/**
 * Whether the notice the learner read covers how the phone recognizes speech now. Having read that the
 * audio may leave the phone covers on-device recognition too; the reverse doesn't, so a phone that can no
 * longer recognize the language on the device (its language pack removed) shows the notice again.
 */
export function privacyAckCovers(read: string | null, current: RecognizerPrivacy): boolean {
  return read === "may_send" || read === current;
}
