/**
 * How saving the level step ended: "saved", "failed" (including when there was nothing to save), or
 * "cancelled" when a cache reset (sign-out, account change) called the request off and there's nobody left to tell.
 */
export type LevelSaveOutcome = "saved" | "failed" | "cancelled";
