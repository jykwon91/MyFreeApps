import type { ServerStatusPoint } from "@/games/wow-forever/types/serverStatus/serverStatusPoint";

/** One ruleset's recorded status for the history window. */
export interface RulesetHistory {
  slug: string;
  name: string;
  /** When the current status started (ISO); null when nothing is recorded. */
  since: string | null;
  /** False when the status started before the oldest row kept — "at least since". */
  since_exact: boolean;
  /** Oldest first; the first may be before the window (the status the window opens with). */
  points: ServerStatusPoint[];
}
