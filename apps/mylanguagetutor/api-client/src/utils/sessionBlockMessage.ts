import { SESSION_BLOCK_COPY, dailyLimitCopy } from "../constants/sessionBlockCopy";
import type { SessionBlock } from "../types/session/session-block";
import { dailyResetWhen } from "./dailyResetMessage";

/** What the learner is told for a block; the daily limit names the real reset time. */
export function sessionBlockMessage(block: SessionBlock, now: Date = new Date(), timeZone?: string): string {
  if (block === "daily_limit") return dailyLimitCopy(dailyResetWhen(now, timeZone));
  return SESSION_BLOCK_COPY[block];
}
