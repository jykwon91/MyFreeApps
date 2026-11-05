import type { TwoStepDisableResult } from "./TwoStepDisableResult";

/** The answers a turn-off sheet can't deal with itself. */
export type TwoStepTurnOffSettled = Extract<TwoStepDisableResult, "turned_off" | "already_off" | "unknown">;
