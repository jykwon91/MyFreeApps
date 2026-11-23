import type { AddonMob } from "@/games/wow-forever/types/professionsAddon/addonMob";
import type { AddonNode } from "@/games/wow-forever/types/professionsAddon/addonNode";
import type { AddonNote } from "@/games/wow-forever/types/professionsAddon/addonNote";
import type { AddonRank } from "@/games/wow-forever/types/professionsAddon/addonRank";
import type { AddonStep } from "@/games/wow-forever/types/professionsAddon/addonStep";

export const ADDON_PROFESSION_KIND = { crafting: "crafting", gathering: "gathering", secondary: "secondary" } as const;
export type AddonProfessionKind = (typeof ADDON_PROFESSION_KIND)[keyof typeof ADDON_PROFESSION_KIND];

/** Everything the addon shows for one profession. */
export interface AddonProfession {
  key: string;
  label: string;
  /** The client's SkillLine id: the addon reads skills by this, never by (translated) name. */
  skillLine: number;
  kind: AddonProfessionKind;
  /** The site's one-line description of the route. */
  intro: string;
  steps: readonly AddonStep[];
  ranks: readonly AddonRank[];
  notes: readonly AddonNote[];
  /** Ore and herbs, lowest skill first; empty for any other profession. */
  nodes: readonly AddonNode[];
  /** Skinning's beasts; empty for any other profession. */
  mobs: readonly AddonMob[];
}
