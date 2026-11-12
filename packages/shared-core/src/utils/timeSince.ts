import { parseISO } from "date-fns";
import { timeAgo } from "./timeAgo";

const MINUTE_MS = 60_000;

/**
 * Like timeAgo, for a time that has already happened. A future time (the
 * device clock running behind the server) or one within the last minute reads
 * "just now" instead of "in 3 minutes" or "30 seconds ago".
 */
export function timeSince(iso: string): string {
  if (Date.now() - parseISO(iso).getTime() < MINUTE_MS) return "just now";
  return timeAgo(iso);
}
