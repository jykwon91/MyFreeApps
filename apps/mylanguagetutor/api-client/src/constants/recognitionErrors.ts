/**
 * Recognition error codes, as the Web Speech API names them. The phone's recognizer
 * (expo-speech-recognition) uses the same names, plus a few of its own.
 */
/** The microphone or the speech service was refused. */
export const DENIED_RECOGNITION_ERRORS: ReadonlySet<string> = new Set(["not-allowed", "service-not-allowed"]);

/** Nothing was heard. `speech-timeout` is Android's. */
export const NO_SPEECH_RECOGNITION_ERRORS: ReadonlySet<string> = new Set(["no-speech", "speech-timeout"]);

/**
 * Not a failure to show: the app stopped listening itself (`aborted`), or the phone took the
 * microphone for something else, such as a call (`interrupted`, iOS).
 */
export const IGNORED_RECOGNITION_ERRORS: ReadonlySet<string> = new Set(["aborted", "interrupted"]);
