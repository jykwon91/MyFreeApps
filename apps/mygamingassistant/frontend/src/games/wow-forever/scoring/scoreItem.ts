import type { SpecRole } from "@/games/wow-forever/data/classes";
import { isRangedWeaponSlot, isWeaponSlot } from "@/games/wow-forever/data/itemSlots";
import { STAT_KEYS, STAT_LABELS, type StatKey } from "@/games/wow-forever/data/statKeys";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";
import { hitCapRuleFor, usefulHit } from "@/games/wow-forever/scoring/hitCap";
import type { ItemScore, ScoreRow } from "@/games/wow-forever/scoring/scoreTypes";
import { weaponDps } from "@/games/wow-forever/scoring/weaponDps";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";

export interface ScoreContext {
  weights: StatWeights;
  role: SpecRole;
  /** Hit % from the rest of your gear; null = unknown (hit is scored in full). */
  currentHitPct: number | null;
}

const ROUND = 100;

function round(value: number): number {
  return Math.round(value * ROUND) / ROUND;
}

function makeRow(
  key: ScoreRow["key"],
  label: string,
  amount: number,
  countedAmount: number,
  weight: number | undefined,
): ScoreRow {
  if (weight === undefined || weight === 0) {
    return { key, label, amount, countedAmount: amount, weight: null, points: null };
  }
  return { key, label, amount, countedAmount, weight, points: round(countedAmount * weight) };
}

function statRow(key: StatKey, amount: number, ctx: ScoreContext, notes: string[]): ScoreRow {
  const rule = hitCapRuleFor(ctx.role);
  let counted = amount;
  if (key === rule.stat) {
    counted = usefulHit(amount, ctx.currentHitPct, rule.capPct);
    if (counted < amount) {
      notes.push(
        `Only ${round(counted)}% of this item's ${rule.label} counts — you'd pass the ${rule.capPct}% cap.`,
      );
    }
  }
  return makeRow(key, STAT_LABELS[key], amount, counted, ctx.weights.stats[key]);
}

function weaponRow(item: CompareItem, weights: StatWeights): ScoreRow | null {
  if (!item.weapon || !isWeaponSlot(item.slot)) return null;
  const dps = weaponDps(item.weapon);
  if (dps <= 0) return null;
  let weight = weights.meleeWeaponDps;
  if (isRangedWeaponSlot(item.slot)) weight = weights.rangedWeaponDps;
  return makeRow("weapon_dps", "Weapon DPS", dps, dps, weight);
}

/**
 * Score one item: sum of (stat amount x weight) + weapon DPS x DPS weight +
 * armor x armor weight. Stats the spec has no weight for are returned as
 * "not scored" rows (weight/points null), never silently as 0.
 */
export function scoreItem(item: CompareItem, ctx: ScoreContext): ItemScore {
  const notes: string[] = [];
  const rows: ScoreRow[] = [];

  const weapon = weaponRow(item, ctx.weights);
  if (weapon) rows.push(weapon);

  for (const key of STAT_KEYS) {
    const amount = item.stats[key];
    if (amount === undefined || amount === 0) continue;
    rows.push(statRow(key, amount, ctx, notes));
  }

  if (item.armor !== null && item.armor > 0) {
    rows.push(makeRow("armor", "Armor", item.armor, item.armor, ctx.weights.armor));
  }

  const total = round(rows.reduce((sum, row) => sum + (row.points ?? 0), 0));
  return { total, rows, notes };
}

/** True when the item has anything the scorer can look at. */
export function hasScorableContent(item: CompareItem): boolean {
  const hasStats = Object.values(item.stats).some((v) => v !== undefined && v !== 0);
  const hasArmor = item.armor !== null && item.armor > 0;
  return hasStats || hasArmor || item.weapon !== null;
}
