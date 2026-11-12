import type { TranscriptEntry } from "@mylanguagetutor/api-client/types/session/transcript-entry";

/** The newest tutor reply once it has finished arriving, for the screen reader to read. */
export function latestReply(entries: readonly TranscriptEntry[]): string | undefined {
  const last = entries[entries.length - 1];
  if (!last || last.status === "pending" || !last.replyText) return undefined;
  return last.replyText;
}
