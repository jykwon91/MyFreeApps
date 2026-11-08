import type { SpellbookClass } from "@/games/wow-forever/types/spellbook/spellbookClass";

/** One class's spellbook: loading, ready, or failed with a retry. */
export type SpellbookLoadState =
  | { status: "loading" }
  | { status: "ready"; data: SpellbookClass }
  | { status: "error"; retry: () => void; retrying: boolean };
