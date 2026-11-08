import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { AskMacroRow } from "@/games/wow-forever/types/ask/askMacroRow";

/** `find_macros`: ready-made macros with a Copy button each. */
export interface AskMacrosCard {
  kind: typeof ASK_CARD.macros;
  macros: AskMacroRow[];
  /** Every match, before the cut to `macros`. */
  total: number;
  pageHref: string;
}
