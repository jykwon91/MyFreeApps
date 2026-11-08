import type { LegacyPlan } from "@/games/wow-forever/types/legacy/legacyPlan";
import type { LegacyTree } from "@/games/wow-forever/types/legacy/legacyTree";

/**
 * Legacy spending rules, from the game files:
 * - a node takes up to its max ranks; a "coming later" placeholder takes none;
 * - a character spends at most `cap` points over all three trees;
 * - a gated node (5 or 10) opens once that many points are spent in its tree,
 *   counting only nodes with a lower gate — the 5-point nodes can't open the 5
 *   gate themselves.
 * The lines between nodes aren't enforced: the game files draw them but don't
 * say what they require.
 */

export function emptyPlan(trees: readonly LegacyTree[]): LegacyPlan {
  return trees.map((tree) => tree.nodes.map(() => 0));
}

export function treeSpent(ranks: readonly number[]): number {
  return ranks.reduce((sum, rank) => sum + rank, 0);
}

export function totalSpent(plan: LegacyPlan): number {
  return plan.reduce((sum, ranks) => sum + treeSpent(ranks), 0);
}

/** Points spent in a tree in nodes whose gate is below `gate`. */
function spentBelow(tree: LegacyTree, ranks: readonly number[], gate: number): number {
  return tree.nodes.reduce((sum, node, i) => (node.gate < gate ? sum + ranks[i] : sum), 0);
}

/** Whether a node's gate is met (always true for an ungated node). */
export function isNodeOpen(tree: LegacyTree, ranks: readonly number[], node: number): boolean {
  const gate = tree.nodes[node].gate;
  return gate === 0 || spentBelow(tree, ranks, gate) >= gate;
}

/** Whether any character could have this plan. */
export function isLegalPlan(trees: readonly LegacyTree[], plan: LegacyPlan, cap: number): boolean {
  if (plan.length !== trees.length) return false;
  if (totalSpent(plan) > cap) return false;
  return trees.every((tree, t) => {
    const ranks = plan[t];
    if (ranks.length !== tree.nodes.length) return false;
    return tree.nodes.every((node, i) => {
      const rank = ranks[i];
      if (!Number.isInteger(rank) || rank < 0 || rank > node.maxRanks) return false;
      if (node.comingLater && rank > 0) return false;
      return rank === 0 || isNodeOpen(tree, ranks, i);
    });
  });
}

function withRank(plan: LegacyPlan, tree: number, node: number, delta: number): LegacyPlan {
  return plan.map((ranks, t) => (t === tree ? ranks.map((rank, i) => (i === node ? rank + delta : rank)) : ranks));
}

/** Why a rank can't be added to this node, or null when it can. */
export function addBlock(
  trees: readonly LegacyTree[],
  plan: LegacyPlan,
  cap: number,
  tree: number,
  node: number,
): string | null {
  const t = trees[tree];
  const n = t.nodes[node];
  if (n.comingLater) return "Coming in a future update.";
  if (plan[tree][node] >= n.maxRanks) return "Already at its highest rank.";
  if (totalSpent(plan) >= cap) return `All ${cap} points are spent.`;
  const below = spentBelow(t, plan[tree], n.gate);
  if (below < n.gate) {
    const more = n.gate - below;
    return `Spend ${n.gate} points in ${t.name} to unlock (${more} more).`;
  }
  return isLegalPlan(trees, withRank(plan, tree, node, 1), cap) ? null : "This change isn't allowed.";
}

/** Why a rank can't come out of this node, or null when it can. */
export function removeBlock(
  trees: readonly LegacyTree[],
  plan: LegacyPlan,
  cap: number,
  tree: number,
  node: number,
): string | null {
  if (plan[tree][node] <= 0) return "No points spent here.";
  return isLegalPlan(trees, withRank(plan, tree, node, -1), cap)
    ? null
    : `Talents further along ${trees[tree].name} need this point.`;
}

/** The plan with one more rank in the node, or the same plan when that isn't allowed. */
export function addRank(trees: readonly LegacyTree[], plan: LegacyPlan, cap: number, tree: number, node: number): LegacyPlan {
  return addBlock(trees, plan, cap, tree, node) === null ? withRank(plan, tree, node, 1) : plan;
}

/** The plan with one rank less in the node, or the same plan when that isn't allowed. */
export function removeRank(trees: readonly LegacyTree[], plan: LegacyPlan, cap: number, tree: number, node: number): LegacyPlan {
  return removeBlock(trees, plan, cap, tree, node) === null ? withRank(plan, tree, node, -1) : plan;
}
