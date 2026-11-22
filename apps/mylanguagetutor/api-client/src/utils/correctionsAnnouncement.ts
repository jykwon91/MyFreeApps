import { CORRECTIONS_ANNOUNCEMENT_COPY } from "../constants/correctionsAnnouncementCopy";
import { PRACTICE_COPY } from "../constants/practiceCopy";
import type { TranscriptEntry } from "../types/session/transcript-entry";

/**
 * What a screen reader should hear once a turn has finished and its suggestions, the note that they
 * didn't arrive, or the tutor's retry prompt are on screen. Nothing while the turn is still arriving
 * or when there is nothing to say.
 */
export function correctionsAnnouncement(entry: TranscriptEntry | undefined): string | undefined {
  if (!entry || entry.status === "pending") return undefined;
  const parts: string[] = [];
  const count = entry.corrections.length;
  if (count === 1) parts.push(CORRECTIONS_ANNOUNCEMENT_COPY.oneSuggestion);
  else if (count > 1) parts.push(`${count} ${CORRECTIONS_ANNOUNCEMENT_COPY.suggestionsSuffix}`);
  if (entry.correctionsMissing) parts.push(PRACTICE_COPY.correctionsMissing);
  if (entry.retryPrompt) parts.push(entry.retryPrompt);
  return parts.length > 0 ? parts.join(". ") : undefined;
}
