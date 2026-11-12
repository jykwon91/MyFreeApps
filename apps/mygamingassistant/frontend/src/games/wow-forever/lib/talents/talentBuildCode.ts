import {
  MAX_TALENT_LEVEL,
  MIN_TALENT_LEVEL,
  TALENT_BUILD_CODE_MAX_LENGTH,
  TALENT_BUILD_CODE_VERSION,
} from "@/games/wow-forever/data/talents/talentConfig";
import { isLegalBuild } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

// "-" survives URLSearchParams unescaped ("~" would be sent as %7E).
const SEPARATOR = "-";
const TREE_FIELD = /^[0-9]*$/;

/**
 * A build as `?b=`: `2-<tree 1>-<tree 2>-<tree 3>`, each tree one digit per
 * talent (its points, in the tree's tier-then-column order) with trailing
 * zeros dropped — `2--05-` is two points in tree 2's second talent. An empty
 * build is "" (no `b` at all).
 */
export function encodeTalentBuild(build: TalentBuild): string {
  if (build.every((ranks) => ranks.every((r) => r === 0))) return "";
  const trees = build.map((ranks) => ranks.join("").replace(/0+$/, ""));
  return [TALENT_BUILD_CODE_VERSION, ...trees].join(SEPARATOR);
}

/**
 * The build a `?b=` code names, or null when it isn't one this class can have:
 * wrong version or tree count, a character other than a digit, more talents
 * than the tree has, or points no character could spend (a rank past the
 * max, a closed row, a missing prerequisite, more than 51 points). Never
 * patched up — a half-read link would show a build nobody made.
 */
export function decodeTalentBuild(code: string, trees: readonly TalentTree[]): TalentBuild | null {
  if (code.length > TALENT_BUILD_CODE_MAX_LENGTH) return null;
  const [version, ...fields] = code.split(SEPARATOR);
  if (version !== TALENT_BUILD_CODE_VERSION || fields.length !== trees.length) return null;
  const build: number[][] = [];
  for (const [t, field] of fields.entries()) {
    if (!TREE_FIELD.test(field) || field.length > trees[t].talents.length) return null;
    build.push(trees[t].talents.map((_talent, i) => (i < field.length ? Number(field[i]) : 0)));
  }
  return isLegalBuild(trees, build) ? build : null;
}

/** `?lvl=` as a level, or null when it isn't a whole number from 10 to 60. */
export function decodeTalentLevel(value: string | null): number | null {
  if (value === null || !/^[0-9]{1,2}$/.test(value)) return null;
  const level = Number(value);
  return level >= MIN_TALENT_LEVEL && level <= MAX_TALENT_LEVEL ? level : null;
}
