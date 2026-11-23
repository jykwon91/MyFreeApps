import type { AddonFactionText } from "@/games/wow-forever/types/professionsAddon/addonFactionText";
import type { AddonMat } from "@/games/wow-forever/types/professionsAddon/addonMat";
import type { AddonOption } from "@/games/wow-forever/types/professionsAddon/addonOption";
import type { AddonPlace } from "@/games/wow-forever/types/professionsAddon/addonPlace";

export const ADDON_STEP_KIND = { craft: "craft", options: "options", text: "text", milestone: "milestone" } as const;
export type AddonStepKind = (typeof ADDON_STEP_KIND)[keyof typeof ADDON_STEP_KIND];

/** One row of a leveling route, in the order the site shows it. */
export interface AddonStep {
  kind: AddonStepKind;
  from: number;
  to: number;
  name: string;
  /** Craft rows: the recipe's spell id, and where it turns yellow / grey. */
  spell: number | null;
  yellow: number | null;
  grey: number | null;
  mats: readonly AddonMat[];
  /** Craft rows: where it is learned, in words, and the skill it asks. */
  learn: string | null;
  learnSkill: number | null;
  /** The recipe is a Pattern / Formula, quest or NPC teach you have to go and get. */
  acquire: boolean;
  /** Text rows: what to gather or buy, and where it comes from. */
  text: AddonFactionText | null;
  source: AddonFactionText | null;
  note: string | null;
  options: readonly AddonOption[];
  /** Milestone rows: the rank it trains, and who sells the book / gives the quest. */
  rank: string | null;
  places: { readonly A: readonly AddonPlace[]; readonly H: readonly AddonPlace[] } | null;
  /** Seen in Forever (true) or a Classic fact not yet checked there (false). */
  confirmed: boolean;
}
