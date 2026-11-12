import {
  MAX_TALENT_LEVEL,
  MIN_TALENT_LEVEL,
  TALENT_BUILD_PARAM,
  TALENT_LEVEL_PARAM,
} from "@/games/wow-forever/data/talents/talentConfig";
import { CALCULATOR_ILLEGAL_REASON, CALCULATOR_UNKNOWN_REASON } from "@/games/wow-forever/data/character/characterTalentsConfig";
import { encodeTalentBuild } from "@/games/wow-forever/lib/talents/talentBuildCode";
import { isLegalBuild, pointsForLevel, totalPoints, treePoints } from "@/games/wow-forever/lib/talents/talentRules";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { CharacterCalculatorLink } from "@/games/wow-forever/types/character/characterCalculatorLink";
import type { CharacterTalents } from "@/games/wow-forever/types/character/characterTalents";
import type { CharacterTalentPick } from "@/games/wow-forever/types/character/characterTalentPick";
import type { CharacterTalentPicked } from "@/games/wow-forever/types/character/characterTalentPicked";
import type { CharacterTalentSet } from "@/games/wow-forever/types/character/characterTalentSet";
import type { Talent } from "@/games/wow-forever/types/talents/talent";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentCellState } from "@/games/wow-forever/types/talents/talentCellState";
import type { TalentPosition } from "@/games/wow-forever/types/talents/talentPosition";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

/** Blizzard's picks laid on the class's trees: a build in the calculator's shape, and how many ids weren't found. */
export function characterTalentSet(trees: readonly TalentTree[], picks: readonly CharacterTalentPick[]): CharacterTalentSet {
  const build: number[][] = trees.map((tree) => tree.talents.map(() => 0));
  let unknown = 0;
  for (const pick of picks) {
    const tree = trees.findIndex((t) => t.talents.some((talent) => talent.id === pick.id));
    const index = tree < 0 ? -1 : trees[tree].talents.findIndex((talent) => talent.id === pick.id);
    // A rank past the tree file's max means Blizzard and our copy disagree: count it, never clamp it.
    if (index < 0 || pick.rank > trees[tree].talents[index].ranks.length) {
      unknown += 1;
      continue;
    }
    build[tree][index] = pick.rank;
  }
  return {
    build,
    unknown,
    trees: trees.map((tree, t) => ({ name: tree.name, points: treePoints(build, t) })),
  };
}

/** Points the character could still spend at `level` (0 when everything is spent). */
export function unspentPoints(build: TalentBuild, level: number): number {
  if (level < MIN_TALENT_LEVEL) return 0;
  return Math.max(0, pointsForLevel(level) - totalPoints(build));
}

/**
 * The talent calculator opened on this build at the character's level, or
 * why not: a talent missing from our trees (the link would open a build the
 * character doesn't have), or points the calculator wouldn't take (a rank
 * past the max, a row not open yet, more points than the level gives).
 */
export function calculatorLink(classId: WowClassId, trees: readonly TalentTree[], set: CharacterTalentSet, level: number): CharacterCalculatorLink {
  const points = totalPoints(set.build);
  if (set.unknown > 0) return { kind: "none", reason: CALCULATOR_UNKNOWN_REASON };
  if (points === 0) return { kind: "none", reason: null };
  if (!isLegalBuild(trees, set.build) || points > pointsForLevel(level)) return { kind: "none", reason: CALCULATOR_ILLEGAL_REASON };
  const params = new URLSearchParams({ [TALENT_BUILD_PARAM]: encodeTalentBuild(set.build) });
  if (level < MAX_TALENT_LEVEL) params.set(TALENT_LEVEL_PARAM, String(level));
  return { kind: "link", href: `/wow-forever/talents/${classId}?${params.toString()}` };
}

/** "1 talent isn't" / "3 talents aren't" — the footnote's subject. */
export function formatUnknownTalents(n: number): string {
  return n === 1 ? "1 talent isn't" : `${n} talents aren't`;
}

/** A read-only cell's screen-reader name: "Pandemic, rank 3 of 3", plus "not open yet" while its row or prerequisite is missing. */
export function characterTalentCellLabel(talent: Talent, rank: number, state: TalentCellState): string {
  const label = `${talent.name}, rank ${rank} of ${talent.ranks.length}`;
  if (state === "locked") return `${label}, not open yet`;
  return label;
}

/** The opened talent and the character's rank in it, or null when none is open. */
export function pickedTalent(trees: readonly TalentTree[], build: TalentBuild, picked: TalentPosition | null): CharacterTalentPicked | null {
  const talent = picked && trees[picked.tree]?.talents[picked.talent];
  if (!picked || !talent) return null;
  return { talent, rank: build[picked.tree][picked.talent] };
}

/** Why the talents section has no talents to list, or null when it does. */
export function characterTalentsNote(talents: CharacterTalents | null, classId: WowClassId | undefined, className: string): string | null {
  if (!talents) return "Blizzard didn't send this character's talents. Look them up again in a moment.";
  if (talents.groups.length === 0) return "No talent points spent yet. Talents open at level 10.";
  if (!classId) return `MGA doesn't have talent trees for ${className}.`;
  return null;
}

/** A heading for each saved set, only when the character has more than one. */
export function talentSetLabel(active: boolean, setCount: number): string | null {
  if (setCount < 2) return null;
  return active ? "Active talents" : "Other saved talents";
}
