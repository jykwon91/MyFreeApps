import type { DownrankKind } from "@/games/wow-forever/types/downrank/downrankKind";
import type { DownrankTargets } from "@/games/wow-forever/types/downrank/downrankTargets";

/** The amount's word in sentences and headings: "healing" / "damage". */
export const DOWNRANK_AMOUNT_WORD: Readonly<Record<DownrankKind, string>> = {
  heal: "healing",
  damage: "damage",
};

/** The bonus field's label. */
export const DOWNRANK_BONUS_LABEL: Readonly<Record<DownrankKind, string>> = {
  heal: "+Healing",
  damage: "+Spell damage",
};

/** Said under the table for spells that hit more than one target; null for single-target spells. */
export const DOWNRANK_TARGET_NOTE: Readonly<Record<DownrankTargets, string | null>> = {
  single: null,
  chain: "Amounts are for the first target only — each jump does less.",
  group: "Amounts are per party member it reaches.",
};

/** The badge details on the formula note. */
export const DOWNRANK_PROVENANCE_DETAIL = {
  gameFiles: "Each rank's level, max level, mana, cast time, amounts and bonus share are read from the WoW Forever game files.",
  classicRules: "The two penalties are Classic's rules. Forever hasn't said whether it changed them.",
  lowLevel:
    "Forever's game files give ranks learned before level 20 their full bonus share, and nobody has checked in game which is right. Switch the penalty off to see the numbers without it.",
  classicRank: "Forever's game files don't have this rank in full, so its numbers are Classic's.",
} as const;
