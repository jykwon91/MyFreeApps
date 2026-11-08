import {
  MAX_TALENT_LEVEL,
  MIN_TALENT_LEVEL,
  POINTS_PER_TIER,
  TALENT_LEVEL_OFFSET,
} from "@/games/wow-forever/data/talents/talentConfig";
import type { TalentBlock } from "@/games/wow-forever/types/talents/talentBlock";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

/**
 * The Classic talent rules, pure. A point goes into a talent when it isn't at
 * its max rank, a point is left to spend at this level, the tree has
 * `5 × tier` points in the rows above it and every prerequisite has its
 * ranks. A point comes back out unless a talent depending on it, or a row
 * further down, would lose what it needs.
 */

export function emptyBuild(trees: readonly TalentTree[]): TalentBuild {
  return trees.map((tree) => tree.talents.map(() => 0));
}

/** Points a character has at `level`: one per level from 10. */
export function pointsForLevel(level: number): number {
  const clamped = Math.min(Math.max(level, MIN_TALENT_LEVEL), MAX_TALENT_LEVEL);
  return clamped - TALENT_LEVEL_OFFSET;
}

/** The lowest level that has the points a build spends. */
export function minimumLevel(build: TalentBuild): number {
  return Math.max(MIN_TALENT_LEVEL, totalPoints(build) + TALENT_LEVEL_OFFSET);
}

export function treePoints(build: TalentBuild, tree: number): number {
  return (build[tree] ?? []).reduce((sum, rank) => sum + rank, 0);
}

export function totalPoints(build: TalentBuild): number {
  return build.reduce((sum, _ranks, tree) => sum + treePoints(build, tree), 0);
}

/** Points a tree has in the rows above `tier`. */
export function pointsAbove(tree: TalentTree, ranks: readonly number[], tier: number): number {
  return tree.talents.reduce((sum, talent, i) => (talent.tier < tier ? sum + (ranks[i] ?? 0) : sum), 0);
}

/** Points the rows above `tier` need before it opens. */
export function pointsToOpen(tier: number): number {
  return tier * POINTS_PER_TIER;
}

/** Why a point can't go into `build[tree][talent]` at `level`; null when it can. */
export function addBlock(
  trees: readonly TalentTree[],
  build: TalentBuild,
  tree: number,
  talent: number,
  level: number,
): TalentBlock | null {
  const t = trees[tree].talents[talent];
  const ranks = build[tree];
  if (ranks[talent] >= t.ranks.length) return { kind: "maxed" };
  const above = pointsAbove(trees[tree], ranks, t.tier);
  if (above < pointsToOpen(t.tier)) return { kind: "tier", pointsNeeded: pointsToOpen(t.tier) - above };
  const missing = t.prereqs.find((p) => ranks[p.talentIndex] < p.rank);
  if (missing) return { kind: "prereq", talentIndex: missing.talentIndex, rank: missing.rank };
  if (totalPoints(build) >= pointsForLevel(level)) return { kind: "no-points" };
  return null;
}

/** Why a point can't come out of `build[tree][talent]`; null when it can. */
export function removeBlock(
  trees: readonly TalentTree[],
  build: TalentBuild,
  tree: number,
  talent: number,
): TalentBlock | null {
  const ranks = build[tree];
  if (ranks[talent] <= 0) return { kind: "empty" };
  const talents = trees[tree].talents;
  const left = ranks[talent] - 1;
  const dependent = talents.findIndex(
    (other, j) => ranks[j] > 0 && other.prereqs.some((p) => p.talentIndex === talent && left < p.rank),
  );
  if (dependent >= 0) return { kind: "dependent", talentIndex: dependent };
  const after = ranks.map((rank, i) => (i === talent ? left : rank));
  const ownTier = talents[talent].tier;
  const stranded = talents.find(
    (other, j) => after[j] > 0 && other.tier > ownTier && pointsAbove(trees[tree], after, other.tier) < pointsToOpen(other.tier),
  );
  if (stranded) return { kind: "tier-above", tier: stranded.tier };
  return null;
}

function withRank(build: TalentBuild, tree: number, talent: number, rank: number): TalentBuild {
  return build.map((ranks, t) => (t === tree ? ranks.map((r, i) => (i === talent ? rank : r)) : ranks));
}

/** The build with one more point in the talent, or the same build when it can't take one. */
export function addPoint(trees: readonly TalentTree[], build: TalentBuild, tree: number, talent: number, level: number): TalentBuild {
  if (addBlock(trees, build, tree, talent, level)) return build;
  return withRank(build, tree, talent, build[tree][talent] + 1);
}

/** The build with one point fewer in the talent, or the same build when it can't give one back. */
export function removePoint(trees: readonly TalentTree[], build: TalentBuild, tree: number, talent: number): TalentBuild {
  if (removeBlock(trees, build, tree, talent)) return build;
  return withRank(build, tree, talent, build[tree][talent] - 1);
}

/**
 * Whether a build could have been made by adding points one at a time: the
 * right shape, no rank past a talent's max, every spent talent's row open and
 * its prerequisites met, and no more points than a level-60 character has.
 */
export function isLegalBuild(trees: readonly TalentTree[], build: TalentBuild): boolean {
  if (build.length !== trees.length) return false;
  if (totalPoints(build) > pointsForLevel(MAX_TALENT_LEVEL)) return false;
  return trees.every((tree, t) => {
    const ranks = build[t];
    if (ranks.length !== tree.talents.length) return false;
    return tree.talents.every((talent, i) => {
      const rank = ranks[i];
      if (!Number.isInteger(rank) || rank < 0 || rank > talent.ranks.length) return false;
      if (rank === 0) return true;
      if (pointsAbove(tree, ranks, talent.tier) < pointsToOpen(talent.tier)) return false;
      return talent.prereqs.every((p) => ranks[p.talentIndex] >= p.rank);
    });
  });
}
