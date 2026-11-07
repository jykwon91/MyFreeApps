import type { ItemPageResult } from "@/games/wow-forever/types/itemPages/itemPageResult";

/** An item page while its shards load. */
export type ItemPageState =
  | { status: "loading" }
  | { status: "error"; retry: () => void; retrying: boolean }
  | { status: "ready"; result: ItemPageResult };
