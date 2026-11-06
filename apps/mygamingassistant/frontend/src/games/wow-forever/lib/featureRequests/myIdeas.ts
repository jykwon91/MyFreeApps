import { MY_IDEAS_MAX, MY_IDEAS_STORAGE_KEY } from "@/games/wow-forever/data/featureRequests/suggestStorageKeys";
import { readStored, writeStored } from "@/games/wow-forever/lib/safeLocalStorage";
import { isUuid } from "@/games/wow-forever/lib/featureRequests/voterId";
import type { PendingIdea } from "@/games/wow-forever/types/featureRequests/pendingIdea";

function isPendingIdea(raw: unknown): raw is PendingIdea {
  if (typeof raw !== "object" || raw === null) return false;
  const r = raw as Record<string, unknown>;
  return isUuid(r.id) && typeof r.title === "string" && r.title !== "" && typeof r.approved === "boolean";
}

/** Accept the stored list, dropping any entry that isn't a valid idea. */
export function parseMyIdeas(raw: unknown): PendingIdea[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter(isPendingIdea).slice(0, MY_IDEAS_MAX);
}

export function readMyIdeas(): PendingIdea[] {
  return readStored(MY_IDEAS_STORAGE_KEY, parseMyIdeas, []);
}

export function writeMyIdeas(ideas: readonly PendingIdea[]): void {
  writeStored(MY_IDEAS_STORAGE_KEY, ideas);
}

/** Remember a new story of yours, newest first; the same id is never listed twice. */
export function withIdea(ideas: readonly PendingIdea[], id: string, title: string): PendingIdea[] {
  const rest = ideas.filter((i) => i.id !== id);
  return [{ id, title, approved: false }, ...rest].slice(0, MY_IDEAS_MAX);
}

/**
 * Mark ideas the public board returned as approved (triage made them public). Returns the same array
 * when nothing changed, so callers can skip a write.
 */
export function withApproved(ideas: readonly PendingIdea[], publicIds: ReadonlySet<string>): readonly PendingIdea[] {
  if (!ideas.some((i) => !i.approved && publicIds.has(i.id))) return ideas;
  return ideas.map((i) => (!i.approved && publicIds.has(i.id) ? { ...i, approved: true } : i));
}
