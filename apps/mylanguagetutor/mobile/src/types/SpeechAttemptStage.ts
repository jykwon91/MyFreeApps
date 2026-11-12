/**
 * Where one listening attempt is: asking for permission, waiting for the phone's `start` event,
 * recognizing. A start that fails (an error, and perhaps no end) ends the attempt at once.
 */
export type SpeechAttemptStage = "asking" | "starting" | "live";
