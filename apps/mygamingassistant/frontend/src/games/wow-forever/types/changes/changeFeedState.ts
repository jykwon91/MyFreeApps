import type { ChangeEntry } from "@/games/wow-forever/types/changes/changeEntry";

/** The feed's rows for the picked categories: loading, ready, or failed with a retry. */
export type ChangeFeedState =
  | { status: "loading" }
  | { status: "ready"; entries: readonly ChangeEntry[] }
  | { status: "error"; retry: () => void; retrying: boolean };
