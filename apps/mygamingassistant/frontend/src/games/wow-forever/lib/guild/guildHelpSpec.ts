/**
 * Talent tree ID → scorer spec ID mapping for the guild Help tab's gear scoring.
 *
 * Maps each Blizzard SkillTree id (from `talentTrees.json`) to the scorer's
 * string spec id (from `data/classes.ts`).  Used to score upgrade candidates
 * against each beneficiary's real spec rather than generic leveling weights.
 *
 * Notes:
 * - Druid "Feral Combat" (tree 134) maps to "feral-damage".  Classic's single
 *   Feral tree covers both DPS and tanking; we default to the DPS-oriented
 *   weights since that is the more common leveling use case.
 * - Paladin Holy (tree 594) and Priest Holy (tree 56) share the spec id "holy"
 *   but differ by classId, so weight lookup is unambiguous.
 * - Paladin/Warrior Protection similarly share "protection" but differ by classId.
 * - Druid/Shaman Restoration similarly share "restoration" but differ by classId.
 */

import type { GuildMemberTalentTree } from "@/games/wow-forever/types/guild/guildMemberTalentTree";

/**
 * Blizzard SkillTree id → scorer spec id.
 * Keys are the `id` values from `data/guild/talentTrees.json`.
 */
export const TALENT_TREE_SPEC_ID: Readonly<Record<number, string>> = {
  // Druid
  574: "balance",
  134: "feral-damage", // Feral Combat — see note above
  573: "restoration",
  // Hunter
  50: "beast-mastery",
  163: "marksmanship",
  51: "survival",
  // Mage
  237: "arcane",
  8: "fire",
  6: "frost",
  // Paladin
  594: "holy",
  267: "protection",
  184: "retribution",
  // Priest
  613: "discipline",
  56: "holy",
  78: "shadow", // "Shadow Magic" tree → "shadow" spec id
  // Rogue
  253: "assassination",
  38: "combat",
  39: "subtlety",
  // Shaman
  375: "elemental", // "Elemental Combat" tree → "elemental" spec id
  373: "enhancement",
  374: "restoration",
  // Warlock
  355: "affliction",
  354: "demonology",
  593: "destruction",
  // Warrior
  26: "arms",
  256: "fury",
  257: "protection",
};

/**
 * Returns the scorer spec id for a beneficiary's dominant talent tree, or
 * `null` when the spec can't be determined (talents missing or unknown tree).
 *
 * When this returns `null`, callers should fall back to leveling weights via
 * `scorer({ classId, specId: LEVELING_SPEC_ID }, true)`.
 */
export function resolveHelpSpecId(
  talents: readonly GuildMemberTalentTree[] | null | undefined,
): string | null {
  if (!talents || talents.length === 0) return null;
  const dominant = talents.reduce((top, t) => (t.points > top.points ? t : top));
  return TALENT_TREE_SPEC_ID[dominant.tree_id] ?? null;
}
