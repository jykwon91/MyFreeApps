import type { DISCOVER_CONFLICT_CODES } from "../constants/discoverConflictCodes";

/**
 * RTK Query error returned by Discover's Dismiss, Save or Restore when the posting can't move.
 * Mirrors the coded 409 in apps/myjobhunter/backend/app/api/discover.py.
 */
export interface DiscoverConflictError {
  status: 409;
  data: {
    detail: {
      code: (typeof DISCOVER_CONFLICT_CODES)[keyof typeof DISCOVER_CONFLICT_CODES];
      message: string;
    };
  };
}
