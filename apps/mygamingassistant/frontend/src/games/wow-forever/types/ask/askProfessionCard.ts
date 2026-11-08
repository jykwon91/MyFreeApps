import type { ASK_CARD } from "@/games/wow-forever/data/ask/askCardKinds";
import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import type { AskGuideRow } from "@/games/wow-forever/types/ask/askGuideRow";

/** `profession_guide`: the next steps of the site's route from the player's skill. */
export interface AskProfessionCard {
  kind: typeof ASK_CARD.profession;
  profession: GuideProfession;
  label: string;
  /** Null = from the start. */
  skill: number | null;
  rows: AskGuideRow[];
  /** Steps after the shown ones. */
  more: number;
  /** The guide works out the cheapest route from auction prices. */
  priced: boolean;
  pageHref: string;
}
