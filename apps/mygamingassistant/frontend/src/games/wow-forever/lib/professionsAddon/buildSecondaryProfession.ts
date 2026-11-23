import { COOKING_ROUTE } from "@/games/wow-forever/data/professions/cooking";
import { SECONDARY_FOREVER_CHANGES } from "@/games/wow-forever/data/professions/foreverChanges";
import { FISHING_ROUTE } from "@/games/wow-forever/data/professions/fishing";
import { SECONDARY_GROUP } from "@/games/wow-forever/data/professions/professionPicker";
import { PROFESSION_SKILL_LINES } from "@/games/wow-forever/data/professions/professionSkillLines";
import type { RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import { CITY_TRAINERS, TOWN_TRAINERS } from "@/games/wow-forever/data/professions/trainers";
import { SECONDARY_ROUTE_INTRO } from "@/games/wow-forever/data/professionsAddon/professionsAddonCopy";
import { buildGuideSteps } from "@/games/wow-forever/lib/professionsAddon/buildGuideSteps";
import { buildSecondaryRanks } from "@/games/wow-forever/lib/professionsAddon/buildRanks";
import { notesOf } from "@/games/wow-forever/lib/professionsAddon/notesOf";
import { npcPlace } from "@/games/wow-forever/lib/professionsAddon/npcPlace";
import { ADDON_PROFESSION_KIND, type AddonProfession } from "@/games/wow-forever/types/professionsAddon/addonProfession";
import type { AddonPlace } from "@/games/wow-forever/types/professionsAddon/addonPlace";
import type { SecondaryProfession } from "@/games/wow-forever/types/secondaryProfession";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

const ROUTES: Readonly<Record<SecondaryProfession, readonly RouteStep[]>> = { cooking: COOKING_ROUTE, fishing: FISHING_ROUTE };

function labelOf(key: SecondaryProfession): string {
  const option = SECONDARY_GROUP.options.find((o) => o.id === key);
  if (!option) throw new Error(`Professions addon: no picker label for ${key}`);
  return option.label;
}

function apprenticeTrainers(key: SecondaryProfession, faction: PlayerFaction): AddonPlace[] {
  return [
    ...CITY_TRAINERS.filter((city) => city.faction === faction).map((city) => npcPlace(city[key])),
    ...TOWN_TRAINERS[faction][key].map(npcPlace),
  ];
}

/** Cooking or Fishing: the site's hand-written route, its rank milestones and trainers. */
export function buildSecondaryProfession(key: SecondaryProfession): AddonProfession {
  const route = ROUTES[key];
  return {
    key,
    label: labelOf(key),
    skillLine: PROFESSION_SKILL_LINES[key],
    kind: ADDON_PROFESSION_KIND.secondary,
    intro: SECONDARY_ROUTE_INTRO[key],
    steps: buildGuideSteps(route),
    ranks: buildSecondaryRanks(key, route, { A: apprenticeTrainers(key, "A"), H: apprenticeTrainers(key, "H") }),
    notes: notesOf(SECONDARY_FOREVER_CHANGES[key]),
    nodes: [],
    mobs: [],
  };
}
