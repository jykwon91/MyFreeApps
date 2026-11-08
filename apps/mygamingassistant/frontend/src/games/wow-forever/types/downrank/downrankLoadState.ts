import type { DownrankFamily } from "@/games/wow-forever/types/downrank/downrankFamily";

/** The calculator's data: loading, ready, or failed with a retry. */
export type DownrankLoadState =
  | { status: "loading" }
  | { status: "ready"; families: readonly DownrankFamily[] }
  | { status: "error"; retry: () => void; retrying: boolean };
