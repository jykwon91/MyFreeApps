import type { ForeverChange } from "@/games/wow-forever/data/professions/professionTypes";

export const FOREVER_CHANGES: readonly ForeverChange[] = [
  { text: "Cooked food's Well Fed buff also gives +5% experience from kills — eat before you fight.", confidence: "confirmed" },
  { text: "Raw meat and fish stack to 20 instead of 10.", confidence: "confirmed" },
  { text: "Legacy tree: Master Chef gives up to a 50% chance of an extra dish; Luremaster gives a chance of an extra fish while a lure is on.", confidence: "confirmed" },
  { text: "Some city fires no longer count as cooking fires (Stormwind, Orgrimmar), and campfires can't be placed inside capitals.", confidence: "confirmed" },
  { text: "Cooking and Fishing teach camp objects: Basic, Journeyman and Expert Campfires, plus a Fish Bowl, Fishing Rack and Fishing Hut.", confidence: "confirmed" },
  { text: "The skill levels each campfire unlocks at are still changing in the beta.", confidence: "unconfirmed" },
];

/** Recipe difficulty colors, as shown in the Cooking window. */
export const SKILL_COLORS = [
  { label: "Orange", meaning: "always a skill point", swatch: "bg-orange-500" },
  { label: "Yellow", meaning: "usually", swatch: "bg-yellow-400" },
  { label: "Green", meaning: "rarely — move on", swatch: "bg-green-500" },
  { label: "Gray", meaning: "never", swatch: "bg-gray-400" },
] as const;
