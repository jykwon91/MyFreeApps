import type { SessionRenewal } from "../lib/types/SessionRenewal";
import type { SessionRefreshResult } from "../platform/types/SessionRefreshResult";

/** What a refresh of the sign-in means for a request that got a 401. */
export const RENEWAL_FOR_REFRESH: Record<SessionRefreshResult, SessionRenewal> = {
  refreshed: "renewed",
  signed_out: "ended",
  unavailable: "unreachable",
};
