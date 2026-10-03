/**
 * What the group planner does when the API refuses it (`app/api/raid_web.py`).
 *
 * 403 is the link — missing, expired, or replaced by a newer one — and shows the link panel; it is never 401, which
 * the shared client takes for "signed out". 404 means the raid is gone. A save refused for someone else's save in
 * between (409 `groups_changed`), or for a roster that moved under it (422 `invalid_plan`), shows the groups as they
 * are now; 409 `raid_over` turns the planner read-only. Anything else keeps the leader's changes, to try again.
 */
import { PLAN_REFUSAL, PLANNER_MESSAGE } from "@/games/wow-forever/data/raidPlanner";
import { NO_RESPONSE_MESSAGE, RATE_LIMITED_MESSAGE, statusOf } from "@/games/wow-forever/lib/raidPageError";

const LINK_STATUS = 403;
const GONE_STATUS = 404;
const RATE_LIMITED_STATUS = 429;

export const REFUSAL = { LINK: "link", GONE: "gone", OVER: "over", RELOAD: "reload", FAILED: "failed" } as const;

/** Where the planner stops: the link panel, or "Raid not found". */
export type PlannerStop = typeof REFUSAL.LINK | typeof REFUSAL.GONE;

export type PlanRefusal =
  | { kind: PlannerStop }
  | { kind: typeof REFUSAL.OVER | typeof REFUSAL.RELOAD | typeof REFUSAL.FAILED; message: string };

/** Whether a planner request was refused for its link. */
export function isLinkProblem(error: unknown): boolean {
  return statusOf(error) === LINK_STATUS;
}

/**
 * Why a planner request was refused (RTK Query's `{ status, data }`), and so what the planner does next. `otherwise`
 * is the words for a failure with no better ones.
 */
export function planRefusal(error: unknown, otherwise: string = PLANNER_MESSAGE.SAVE_FAILED): PlanRefusal {
  const status = statusOf(error);
  const detail = detailOf(error);
  if (status === LINK_STATUS) return { kind: REFUSAL.LINK };
  if (status === GONE_STATUS) return { kind: REFUSAL.GONE };
  if (detail === PLAN_REFUSAL.RAID_OVER) return { kind: REFUSAL.OVER, message: PLANNER_MESSAGE.OVER };
  if (detail === PLAN_REFUSAL.GROUPS_CHANGED) return { kind: REFUSAL.RELOAD, message: PLANNER_MESSAGE.CHANGED };
  if (detail === PLAN_REFUSAL.INVALID_PLAN) {
    return { kind: REFUSAL.RELOAD, message: PLANNER_MESSAGE.ROSTER_CHANGED };
  }
  return { kind: REFUSAL.FAILED, message: failedMessage(status, otherwise) };
}

function failedMessage(status: number | undefined, otherwise: string): string {
  if (status === undefined) return NO_RESPONSE_MESSAGE;
  if (status === RATE_LIMITED_STATUS) return RATE_LIMITED_MESSAGE;
  return otherwise;
}

function detailOf(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const data: unknown = (error as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return undefined;
  return (data as { detail?: unknown }).detail;
}
