import type { ForeverChange } from "@/games/wow-forever/data/professions/professionTypes";
import type { SecondaryProfession } from "@/games/wow-forever/types/secondaryProfession";

export const FOREVER_CHANGES: readonly ForeverChange[] = [
  { text: "Cooked food's Well Fed buff also gives +5% experience from kills — eat before you fight.", confidence: "confirmed" },
  { text: "Raw meat and fish stack to 20 instead of 10.", confidence: "confirmed" },
  { text: "Legacy tree: Master Chef gives up to a 50% chance of an extra dish; Luremaster gives a chance of an extra fish while a lure is on.", confidence: "confirmed" },
  { text: "Some city fires no longer count as cooking fires (Stormwind, Orgrimmar), and campfires can't be placed inside capitals.", confidence: "confirmed" },
  { text: "Cooking and Fishing teach camp objects: Basic, Journeyman and Expert Campfires, plus a Fishing Bowl, Fishing Rack and Fishing Hut.", confidence: "confirmed" },
  { text: "The first campsite items come at skill 20, from starter-zone quests or a trainer. Those needing 140 or more drop in dungeons and raids.", confidence: "confirmed" },
];

/** Each secondary guide's "What's different in Forever" — Cooking and Fishing share one list. */
export const SECONDARY_FOREVER_CHANGES: Readonly<Record<SecondaryProfession, readonly ForeverChange[]>> = {
  cooking: FOREVER_CHANGES,
  fishing: FOREVER_CHANGES,
};

/** Recipe difficulty colors, as shown in the Cooking window. */
export const SKILL_COLORS = [
  { label: "Orange", meaning: "always a skill point", swatch: "bg-orange-500" },
  { label: "Yellow", meaning: "usually", swatch: "bg-yellow-400" },
  { label: "Green", meaning: "rarely — move on", swatch: "bg-green-500" },
  { label: "Gray", meaning: "never", swatch: "bg-gray-400" },
] as const;
