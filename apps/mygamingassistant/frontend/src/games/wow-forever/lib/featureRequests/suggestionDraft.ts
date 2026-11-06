import { readSessionStorage, writeSessionStorage } from "@platform/ui/lib/safeStorage";
import { SUGGESTION_MAX_LENGTH } from "@/games/wow-forever/data/featureRequests/suggestCopy";
import { SUGGESTION_DRAFT_STORAGE_KEY } from "@/games/wow-forever/data/featureRequests/suggestStorageKeys";

/**
 * The idea being written, kept for the tab (sessionStorage) so a failed, paused or rate-limited submit
 * — or a reload — never loses it. Cleared (stored empty) once the idea is taken.
 */
export function readSuggestionDraft(): string {
  return (readSessionStorage(SUGGESTION_DRAFT_STORAGE_KEY) ?? "").slice(0, SUGGESTION_MAX_LENGTH);
}

export function writeSuggestionDraft(text: string): void {
  writeSessionStorage(SUGGESTION_DRAFT_STORAGE_KEY, text);
}

export function clearSuggestionDraft(): void {
  writeSessionStorage(SUGGESTION_DRAFT_STORAGE_KEY, "");
}
