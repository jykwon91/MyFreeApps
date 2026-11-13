import { DISCOVER_CONFLICT_CODES } from "../constants/discoverConflictCodes";
import type { DiscoverConflictError } from "../types/discover-conflict-error";

const CODES: readonly string[] = Object.values(DISCOVER_CONFLICT_CODES);

/** True for the coded 409 Discover's Dismiss, Save or Restore answer with. */
export function isDiscoverConflictError(err: unknown): err is DiscoverConflictError {
  if (err === null || typeof err !== "object") return false;
  const { status, data } = err as { status?: unknown; data?: unknown };
  if (status !== 409 || data === null || typeof data !== "object") return false;
  const detail = (data as { detail?: unknown }).detail;
  if (detail === null || typeof detail !== "object") return false;
  const { code, message } = detail as Record<string, unknown>;
  return typeof code === "string" && CODES.includes(code) && typeof message === "string";
}
