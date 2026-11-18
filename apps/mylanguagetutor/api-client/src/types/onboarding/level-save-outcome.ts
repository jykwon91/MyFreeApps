import type { LevelSaveFailure } from "./level-save-failure";

/**
 * How saving the level step ended: "saved", a LevelSaveFailure, or "cancelled" when a cache reset (sign-out, account
 * change) called the request off and there's nobody left to tell.
 */
export type LevelSaveOutcome = "saved" | "cancelled" | LevelSaveFailure;
