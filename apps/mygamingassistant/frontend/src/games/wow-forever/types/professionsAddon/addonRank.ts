import type { AddonFactionText } from "@/games/wow-forever/types/professionsAddon/addonFactionText";
import type { AddonPlace } from "@/games/wow-forever/types/professionsAddon/addonPlace";

/** A rank (Apprentice ... Artisan): the skill it is trained at, the character level it asks, the new cap, and who trains it. */
export interface AddonRank {
  name: string;
  skill: number;
  level: number | null;
  cap: number;
  /** Trainers per faction, capital cities first. */
  trainers: { readonly A: readonly AddonPlace[]; readonly H: readonly AddonPlace[] };
  /** How the rank is gained when it is not a trainer (a dungeon trainer, a book, a quest). */
  how: AddonFactionText | null;
  headsUp: string | null;
  confirmed: boolean;
}
