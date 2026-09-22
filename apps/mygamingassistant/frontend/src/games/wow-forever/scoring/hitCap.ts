import type { SpecRole } from "@/games/wow-forever/data/classes";
import { MELEE_HIT_CAP_PCT, SPELL_HIT_CAP_PCT } from "@/games/wow-forever/data/hitCaps";
import type { StatKey } from "@/games/wow-forever/data/statKeys";

export interface HitCapRule {
  stat: StatKey;
  capPct: number;
  label: string;
}

/** Which hit stat is capped for a role, and at what percent. */
export function hitCapRuleFor(role: SpecRole): HitCapRule {
  if (role === "caster" || role === "healer") {
    return { stat: "spell_hit_pct", capPct: SPELL_HIT_CAP_PCT, label: "spell hit" };
  }
  return { stat: "hit_pct", capPct: MELEE_HIT_CAP_PCT, label: "hit" };
}

/**
 * How much of an item's hit still helps, given hit from the rest of your gear.
 * Returns the full amount when the current hit is unknown.
 */
export function usefulHit(amount: number, currentHitPct: number | null, capPct: number): number {
  if (currentHitPct === null) return amount;
  const room = Math.max(0, capPct - currentHitPct);
  return Math.min(amount, room);
}
