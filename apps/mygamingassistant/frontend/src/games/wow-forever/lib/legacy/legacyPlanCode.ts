import {
  LEGACY_PLAN_MAX_LENGTH,
  LEGACY_PLAN_SEPARATOR,
  LEGACY_PLAN_VERSION,
} from "@/games/wow-forever/data/legacy/legacyConfig";
import { isLegalPlan, totalSpent } from "@/games/wow-forever/lib/legacy/legacyRules";
import type { LegacyPlan } from "@/games/wow-forever/types/legacy/legacyPlan";
import type { LegacyTree } from "@/games/wow-forever/types/legacy/legacyTree";

const DIGITS = /^[0-9]*$/;

/** `1-<tree 1>-<tree 2>-<tree 3>`: one digit per node in file order, trailing zeros dropped; "" for an empty plan. */
export function encodeLegacyPlan(plan: LegacyPlan): string {
  if (totalSpent(plan) === 0) return "";
  const parts = plan.map((ranks) => ranks.join("").replace(/0+$/, ""));
  return [LEGACY_PLAN_VERSION, ...parts].join(LEGACY_PLAN_SEPARATOR);
}

/** The plan a code names, or null when it isn't one of ours or no character could have it. */
export function decodeLegacyPlan(code: string, trees: readonly LegacyTree[], cap: number): LegacyPlan | null {
  if (code.length > LEGACY_PLAN_MAX_LENGTH) return null;
  const [version, ...parts] = code.split(LEGACY_PLAN_SEPARATOR);
  if (version !== LEGACY_PLAN_VERSION || parts.length !== trees.length) return null;
  const plan: number[][] = [];
  for (const [t, part] of parts.entries()) {
    const size = trees[t].nodes.length;
    if (!DIGITS.test(part) || part.length > size) return null;
    plan.push(Array.from({ length: size }, (_, i) => (i < part.length ? Number(part[i]) : 0)));
  }
  return isLegalPlan(trees, plan, cap) ? plan : null;
}
