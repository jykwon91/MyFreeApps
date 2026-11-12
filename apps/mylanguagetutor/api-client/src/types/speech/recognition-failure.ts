/**
 * Why a listening attempt ended without a usable transcript.
 * - ``denied``: the microphone (or speech recognition) permission was refused, or blocked by policy
 * - ``no_speech``: nothing was heard
 * - ``unavailable``: the browser's or phone's speech service failed (network / device)
 */
export type RecognitionFailure = "denied" | "no_speech" | "unavailable";
