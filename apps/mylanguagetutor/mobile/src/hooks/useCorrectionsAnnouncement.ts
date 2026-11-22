import { correctionsAnnouncement } from "@mylanguagetutor/api-client/utils/correctionsAnnouncement";
import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";
import { useAnnouncement } from "@platform/mobile";
import { useState } from "react";

/**
 * Tells a screen reader about the newest turn's suggestions, the note that they didn't arrive, and the
 * retry prompt, once, when the turn finishes. Skipping the retry prompt afterwards doesn't say it again.
 */
export function useCorrectionsAnnouncement(entries: readonly TranscriptEntry[]): void {
  const last = entries[entries.length - 1];
  const fresh = correctionsAnnouncement(last);
  const [said, setSaid] = useState<{ key: string; text: string } | null>(null);
  if (last && fresh && said?.key !== last.key) setSaid({ key: last.key, text: fresh });
  useAnnouncement(last && said?.key === last.key ? said.text : undefined, "polite");
}
