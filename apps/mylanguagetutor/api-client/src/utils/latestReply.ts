import type { TranscriptEntry } from "../types/session/transcript-entry";

/**
 * The newest tutor reply once it has finished arriving, for the screen reader to read on the website
 * and the phone. Never a reply still streaming in: each chunk would be read over the tutor's voice.
 */
export function latestReply(entries: readonly TranscriptEntry[]): string | undefined {
  const last = entries[entries.length - 1];
  if (!last || last.status === "pending" || !last.replyText) return undefined;
  return last.replyText;
}
