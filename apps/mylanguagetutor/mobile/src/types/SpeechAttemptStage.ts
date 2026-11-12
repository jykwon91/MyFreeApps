/**
 * Where one listening attempt is: asking for permission, waiting for the phone's `start` event,
 * recognizing, or failed to start (the phone sends an error and its end, with no `start`).
 */
export type SpeechAttemptStage = "asking" | "starting" | "live" | "failed";
