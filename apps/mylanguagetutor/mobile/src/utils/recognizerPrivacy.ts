import type { RecognizerPrivacy } from "../types/RecognizerPrivacy";

/** Where speech becomes text, once it's known whether the phone can do it on the device for the language. */
export function recognizerPrivacy(onDevice: boolean | null): RecognizerPrivacy | null {
  if (onDevice === null) return null;
  return onDevice ? "on_device" : "may_send";
}
