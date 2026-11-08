import {
  MIN_TALENT_LEVEL,
  TALENT_ORDER_CODE_MAX_LENGTH,
} from "@/games/wow-forever/data/talents/talentConfig";
import { addBlock, emptyBuild } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentOrderEntry } from "@/games/wow-forever/types/talents/talentOrderEntry";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

/**
 * Encode a talent index (0–30) as a single URL-safe character.
 * 0–9 → '0'–'9'; 10–30 → 'a'–'u'.
 */
function encodeTalentIndex(index: number): string {
  return index < 10 ? String(index) : String.fromCharCode(97 + index - 10);
}

/**
 * Decode a single talent-index character back to a number, or null when
 * the character isn't in the expected set.
 */
function decodeTalentIndex(char: string): number | null {
  if (/^[0-9]$/.test(char)) return Number(char);
  if (/^[a-u]$/.test(char)) return char.charCodeAt(0) - 97 + 10;
  return null;
}

/**
 * Encode the order an array of [tree, talent] pairs into the `?o=` string.
 * Each entry is 2 chars: tree digit + talent-index char.
 */
export function encodeTalentOrder(order: readonly TalentOrderEntry[]): string {
  return order.map(([tree, talent]) => String(tree) + encodeTalentIndex(talent)).join("");
}

/**
 * Decode a `?o=` string into the order array, or null when the string is
 * malformed (odd length, unknown characters, out-of-range indices).
 * Does NOT validate against a build or run replay — call `isValidOrder` for that.
 */
export function decodeTalentOrder(
  code: string,
  trees: readonly TalentTree[],
): TalentOrderEntry[] | null {
  if (code.length === 0) return [];
  if (code.length % 2 !== 0 || code.length > TALENT_ORDER_CODE_MAX_LENGTH) return null;
  const entries: TalentOrderEntry[] = [];
  for (let i = 0; i < code.length; i += 2) {
    const treeChar = code[i];
    const talentChar = code[i + 1];
    const tree = Number(treeChar);
    if (!/^[0-2]$/.test(treeChar) || tree >= trees.length) return null;
    const talent = decodeTalentIndex(talentChar);
    if (talent === null || talent >= trees[tree].talents.length) return null;
    entries.push([tree, talent]);
  }
  return entries;
}

/**
 * Whether an order sequence could have been produced by spending points one
 * at a time, and matches the counts in `build`. Replays the order from an
 * empty build, checking each step is legal, then compares final counts.
 */
export function isValidOrder(
  order: readonly TalentOrderEntry[],
  trees: readonly TalentTree[],
  build: TalentBuild,
): boolean {
  const replay = emptyBuild(trees) as number[][];
  for (const [tree, talent] of order) {
    // Level = points spent so far + MIN_TALENT_LEVEL (always enough to add one more).
    const level = replay.reduce((sum, t) => sum + t.reduce((s, r) => s + r, 0), 0) + MIN_TALENT_LEVEL;
    if (addBlock(trees, replay, tree, talent, level) !== null) return false;
    replay[tree][talent]++;
  }
  // Final counts must match the build.
  return trees.every((_, t) =>
    trees[t].talents.every((_, i) => replay[t][i] === build[t][i]),
  );
}

/**
 * Remove the last occurrence of [tree, talent] from the order, used when a
 * point is taken out of a talent. Returns the original array unchanged when
 * [tree, talent] isn't in it at all.
 */
export function removeFromOrder(
  order: readonly TalentOrderEntry[],
  tree: number,
  talent: number,
): TalentOrderEntry[] {
  const idx = [...order].reverse().findIndex(([t, i]) => t === tree && i === talent);
  if (idx === -1) return [...order];
  const removeAt = order.length - 1 - idx;
  return [...order.slice(0, removeAt), ...order.slice(removeAt + 1)];
}
