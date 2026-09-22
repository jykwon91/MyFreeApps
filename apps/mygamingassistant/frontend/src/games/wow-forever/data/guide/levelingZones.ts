import type { BetaZone, Faction, ZoneBand } from "@/games/wow-forever/data/guide/guideTypes";

/**
 * Classic Era leveling path by faction. Contested zones appear for both.
 * Forever may reshape this — see FOREVER_BETA_ZONES for what's been shown so far.
 */
export const LEVELING_ZONES: Record<Faction, readonly ZoneBand[]> = {
  alliance: [
    { levels: "1–10", zones: ["Elwynn Forest", "Dun Morogh", "Teldrassil"] },
    { levels: "10–20", zones: ["Westfall", "Loch Modan", "Darkshore"] },
    { levels: "20–30", zones: ["Redridge Mountains", "Duskwood", "Wetlands", "Ashenvale"] },
    { levels: "30–40", zones: ["Stranglethorn Vale", "Arathi Highlands", "Desolace", "Dustwallow Marsh"] },
    { levels: "40–50", zones: ["Tanaris", "Feralas", "The Hinterlands", "Badlands", "Swamp of Sorrows"] },
    { levels: "50–60", zones: ["Un'Goro Crater", "Felwood", "Burning Steppes", "Western Plaguelands", "Winterspring", "Eastern Plaguelands"] },
  ],
  horde: [
    { levels: "1–10", zones: ["Durotar", "Mulgore", "Tirisfal Glades"] },
    { levels: "10–20", zones: ["The Barrens", "Silverpine Forest"] },
    { levels: "20–30", zones: ["Stonetalon Mountains", "Hillsbrad Foothills", "Ashenvale", "Thousand Needles"] },
    { levels: "30–40", zones: ["Stranglethorn Vale", "Arathi Highlands", "Desolace", "Badlands"] },
    { levels: "40–50", zones: ["Tanaris", "Feralas", "The Hinterlands", "Swamp of Sorrows", "Dustwallow Marsh"] },
    { levels: "50–60", zones: ["Un'Goro Crater", "Felwood", "Burning Steppes", "Western Plaguelands", "Winterspring", "Eastern Plaguelands"] },
  ],
};

export const FACTIONS: readonly { id: Faction; label: string }[] = [
  { id: "alliance", label: "Alliance" },
  { id: "horde", label: "Horde" },
];

/** Only zones shown for Forever so far. Beta details — may change before launch. */
export const FOREVER_BETA_ZONES: readonly BetaZone[] = [
  { name: "Zephras Isle", detail: "Levels 1–12 — the Skyborne starting zone." },
  { name: "Riverglades", detail: "Eastern Kingdoms, roughly levels 30–45." },
  { name: "Mount Hyjal", detail: "Level 60." },
];
