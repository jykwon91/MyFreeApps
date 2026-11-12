/**
 * Where the phone turns the learner's speech into text.
 * - `on_device`: on the phone, for certain
 * - `may_send`: the audio may go to the speech service's provider (Apple, Google...)
 */
export type RecognizerPrivacy = "on_device" | "may_send";
