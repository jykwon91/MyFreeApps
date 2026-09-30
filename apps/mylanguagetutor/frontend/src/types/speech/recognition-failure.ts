/**
 * Why a listening attempt ended without a usable transcript.
 * - ``denied``: the microphone permission was refused (or blocked by policy)
 * - ``no_speech``: nothing was heard
 * - ``unavailable``: the browser's speech service failed (network / device)
 */
export type RecognitionFailure = "denied" | "no_speech" | "unavailable";
