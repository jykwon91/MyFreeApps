/** What the player reads for each feature-request enum value. */
import type { ContextActivity } from "@/games/wow-forever/types/featureRequests/contextActivity";
import type { ContextClass } from "@/games/wow-forever/types/featureRequests/contextClass";
import type { ContextExperience } from "@/games/wow-forever/types/featureRequests/contextExperience";
import type { ContextFaction } from "@/games/wow-forever/types/featureRequests/contextFaction";
import type { ContextLevelBand } from "@/games/wow-forever/types/featureRequests/contextLevelBand";
import type { ContextProfession } from "@/games/wow-forever/types/featureRequests/contextProfession";
import type { FeatureArea } from "@/games/wow-forever/types/featureRequests/featureArea";
import type { FeatureFeasibility } from "@/games/wow-forever/types/featureRequests/featureFeasibility";
import type { PublicStoryStatus } from "@/games/wow-forever/types/featureRequests/publicStoryStatus";

export const STORY_STATUS_LABEL: Readonly<Record<PublicStoryStatus, string>> = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  shipped: "Shipped",
  not_planned: "Not planned",
};

/** The status chip's colours — the label always says it too, never colour alone. */
export const STORY_STATUS_STYLE: Readonly<Record<PublicStoryStatus, string>> = {
  open: "border-sky-300 text-sky-800 dark:border-sky-700 dark:text-sky-200",
  planned: "border-violet-300 text-violet-800 dark:border-violet-700 dark:text-violet-200",
  in_progress: "border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200",
  shipped: "border-emerald-300 text-emerald-800 dark:border-emerald-700 dark:text-emerald-200",
  not_planned: "border-border text-muted-foreground",
};

export const FEATURE_AREA_LABEL: Readonly<Record<FeatureArea, string>> = {
  map_travel: "World Map & travel",
  leveling_quests: "Leveling & quests",
  professions: "Professions",
  food_consumables: "Food & consumables",
  gold_economy: "Gold & economy",
  gear_upgrades: "Gear & upgrades",
  class_guides: "Class guides",
  dungeons_raids: "Dungeons & raids",
  pvp: "PvP",
  site_app: "The site itself",
};

/** The chip on a card whose idea can't be built as asked. Feasible ideas get no chip. */
export const FEASIBILITY_CHIP: Readonly<Record<FeatureFeasibility, string | null>> = {
  feasible: null,
  needs_data: "Waiting on Forever data",
  not_possible: "Can't build this",
};

export const CONTEXT_CLASS_LABEL: Readonly<Record<ContextClass, string>> = {
  druid: "Druid",
  hunter: "Hunter",
  mage: "Mage",
  paladin: "Paladin",
  priest: "Priest",
  rogue: "Rogue",
  shaman: "Shaman",
  warlock: "Warlock",
  warrior: "Warrior",
  undecided: "Not decided yet",
};

export const CONTEXT_EXPERIENCE_LABEL: Readonly<Record<ContextExperience, string>> = {
  new: "New to WoW",
  returning: "Played before, coming back",
  veteran: "Played a lot",
};

export const CONTEXT_LEVEL_BAND_LABEL: Readonly<Record<ContextLevelBand, string>> = {
  "1-10": "1–10",
  "11-20": "11–20",
  "21-30": "21–30",
  "31-40": "31–40",
  "41-50": "41–50",
  "51-59": "51–59",
  "60-fresh": "60, just got there",
  "60-raiding": "60, raiding",
  "not-playing": "Not playing yet",
};

export const CONTEXT_PROFESSION_LABEL: Readonly<Record<ContextProfession, string>> = {
  alchemy: "Alchemy",
  blacksmithing: "Blacksmithing",
  enchanting: "Enchanting",
  engineering: "Engineering",
  herbalism: "Herbalism",
  leatherworking: "Leatherworking",
  mining: "Mining",
  skinning: "Skinning",
  tailoring: "Tailoring",
  cooking: "Cooking",
  fishing: "Fishing",
  first_aid: "First Aid",
};

export const CONTEXT_ACTIVITY_LABEL: Readonly<Record<ContextActivity, string>> = {
  leveling_solo: "Leveling solo",
  leveling_group: "Leveling in a group",
  dungeons: "Dungeons",
  raiding: "Raiding",
  pvp: "PvP",
  gathering_gold: "Gathering & gold",
  crafting: "Crafting",
  casual: "Just exploring",
};

export const CONTEXT_FACTION_LABEL: Readonly<Record<ContextFaction, string>> = {
  alliance: "Alliance",
  horde: "Horde",
  undecided: "Not decided yet",
};
