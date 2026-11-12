/**
 * Recognition error codes, as the Web Speech API names them. The phone's recognizer
 * (expo-speech-recognition) uses the same names, plus a few of its own.
 */
/** The microphone or the speech service was refused. */
export const DENIED_RECOGNITION_ERRORS: ReadonlySet<string> = new Set(["not-allowed", "service-not-allowed"]);

/**
 * Nothing was heard. `speech-timeout` is Android's. The learner went quiet, which ends listening
 * normally, so whatever was heard before (iOS can say this after hearing words) is still sent.
 */
export const NO_SPEECH_RECOGNITION_ERRORS: ReadonlySet<string> = new Set(["no-speech", "speech-timeout"]);

/** Not a failure to show: the app stopped listening itself. */
export const IGNORED_RECOGNITION_ERRORS: ReadonlySet<string> = new Set(["aborted"]);

/** The phone took the microphone for something else, such as a call or Siri (iOS says so). */
export const INTERRUPTED_RECOGNITION_ERRORS: ReadonlySet<string> = new Set(["interrupted"]);

/**
 * The microphone stopped recording. After words were heard, that's the microphone being taken, as
 * Android says when a call or another app takes it (it has no interruption signal of its own), or
 * unplugged. With nothing heard, the microphone is missing or blocked, or the recognizer failed: Chrome
 * starts before checking the microphone, and iOS reports its unknown errors as `audio-capture`. Some
 * Android phones also answer the learner's own stop with `client`.
 */
export const MICROPHONE_LOST_RECOGNITION_ERRORS: ReadonlySet<string> = new Set(["audio-capture", "client", "busy"]);
