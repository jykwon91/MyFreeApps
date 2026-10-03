/**
 * What the raid page says when it can't show the raid.
 *
 * 404 — and 422, which a mistyped link gets — is "not found". 429 has its own words (the API allows each address
 * 120 reads a minute); a server error gets plain ones; anything else, the API's own message.
 */
import { extractErrorMessage } from "@platform/ui";
import { RAID_PROBLEM } from "@/games/wow-forever/data/raidPage";
import type { RaidProblemKind } from "@/games/wow-forever/types/raid";

export const NOT_FOUND_MESSAGE = "We couldn't find this raid. The link may be mistyped, or the raid was deleted.";
export const RATE_LIMITED_MESSAGE = "Too many requests — try again in a minute.";
export const SERVER_PROBLEM_MESSAGE = "The raid couldn't be loaded right now. Try again in a moment.";

const NOT_FOUND_STATUSES: ReadonlySet<number> = new Set([404, 422]);
const RATE_LIMITED_STATUS = 429;
const FIRST_SERVER_ERROR_STATUS = 500;

export interface RaidPageProblem {
  kind: RaidProblemKind;
  message: string;
}

/** The problem behind a failed read (RTK Query's `{ status, data }`), or null when there's none. */
export function raidPageProblem(error: unknown): RaidPageProblem | null {
  if (error === undefined || error === null) return null;
  const status = statusOf(error);
  if (status !== undefined && NOT_FOUND_STATUSES.has(status)) {
    return { kind: RAID_PROBLEM.NOT_FOUND, message: NOT_FOUND_MESSAGE };
  }
  return { kind: RAID_PROBLEM.LOAD_FAILED, message: loadFailedMessage(status, error) };
}

function loadFailedMessage(status: number | undefined, error: unknown): string {
  if (status === RATE_LIMITED_STATUS) return RATE_LIMITED_MESSAGE;
  if (status !== undefined && status >= FIRST_SERVER_ERROR_STATUS) return SERVER_PROBLEM_MESSAGE;
  return extractErrorMessage(error);
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const status: unknown = (error as { status?: unknown }).status;
  if (typeof status === "number") return status;
  return undefined;
}
