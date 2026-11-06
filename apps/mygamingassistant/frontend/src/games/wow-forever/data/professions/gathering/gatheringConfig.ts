import type { NodeColorOffsets } from "@/games/wow-forever/types/gathering/nodeColorOffsets";

/** Classic Era: a node is yellow 25 points above its required skill, green at +50, grey at +100. */
export const DEFAULT_NODE_OFFSETS: NodeColorOffsets = { yellow: 25, green: 50, grey: 100 };

/** A zone whose lowest mobs are more than this many levels above you is listed last, with a note. */
export const ZONE_LEVEL_SLACK = 2;

/** A zone with no Forever level range ranks as this many levels off yours (behind any zone that fits). */
export const UNKNOWN_LEVEL_GAP = 99;

/** Fewer Classic spawn points than this and a zone isn't worth the trip. */
export const MIN_ZONE_SPAWNS = 5;

/** How many ranked zones the guide shows. */
export const ZONES_SHOWN = 3;

/** With no skill typed, you've just trained it: skill 1. */
export const UNTRAINED_SKILL = 1;

/**
 * Classic Era's Skinning rule (unconfirmed for Forever): mobs up to this level
 * need only skill 1; up to `SKIN_SKILL_SPLIT` skill reaches skill ÷ 10 + 10,
 * past it skill ÷ 5.
 */
export const SKIN_ANY_SKILL_LEVEL = 10;
export const SKIN_SKILL_SPLIT = 100;

/** How many levels below the top of your band are still worth skinning. */
export const SKIN_BAND_WIDTH = 5;

/** Mobs more than this many levels above you aren't sent your way — too tough to farm. */
export const SKIN_LEVEL_HEADROOM = 2;

/** How many mobs a Skinning zone lists. */
export const MOBS_PER_ZONE = 3;

/** The skill box's line before you've typed a skill. */
export const GATHERING_SKILL_PROMPT = "Type your skill (open your profession window to see it) to see what's worth gathering and where.";

/** The page nav for a gathering guide, in the order the guide shows them. */
export const GATHERING_SECTIONS = [
  { id: "now", label: "Right now" },
  { id: "start", label: "Get started" },
  { id: "route", label: "Leveling route" },
  { id: "forever", label: "What's different in Forever" },
  { id: "reference", label: "Reference" },
] as const;
