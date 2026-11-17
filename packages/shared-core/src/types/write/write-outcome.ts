/**
 * What a failed write says about the server's state. "notSaved": the server answered and refused it,
 * so nothing changed and trying again is safe. "unknown": no answer came back (offline, dropped,
 * timed out) or the server broke without saying why, so it may have saved before failing.
 */
export type WriteOutcome = "notSaved" | "unknown";
