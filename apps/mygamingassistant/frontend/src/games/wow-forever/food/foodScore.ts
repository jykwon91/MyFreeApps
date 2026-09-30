import { findClass, findSpec, LEVELING_SPEC_ID, roleFor, type SpecRole, type WowClassId } from "@/games/wow-forever/data/classes";
import type { StatWeights } from "@/games/wow-forever/data/weights/statWeights";
import type { FoodActivity } from "@/games/wow-forever/food/foodActivities";
import { resolveWeights } from "@/games/wow-forever/scoring/resolveWeights";
import type { FoodBuff, FoodBuffPart } from "@/games/wow-forever/types/food";

export interface FoodWeights {
  weights: StatWeights;
  role: SpecRole;
  /** "Pawn's Classic Era weights for Fury Warrior" / "the Warrior leveling rule of thumb". */
  label: string;
  /** PvP bumps Stamina up to your main stat's worth — a rule of thumb, not a sim. */
  pvpStamina: boolean;
}

/**
 * The weight table a food is judged by.
 *
 * Leveling always uses the class leveling rule of thumb. The other activities
 * use Pawn's Classic Era weights for the chosen spec; with "Leveling (any)"
 * they fall back to the leveling rule of thumb.
 */
export function foodWeights(classId: WowClassId, specId: string, activity: FoodActivity): FoodWeights {
  const className = findClass(classId)?.name ?? classId;
  const spec = findSpec(classId, specId);
  const useSpec = activity !== "leveling" && spec !== undefined;
  const resolved = resolveWeights({
    classId,
    specId: useSpec ? specId : LEVELING_SPEC_ID,
    bracket: useSpec ? "level60" : "leveling",
    currentHitPct: null,
  });
  const label =
    resolved.source === "pawn-classic" && spec
      ? `Pawn's Classic Era weights for ${spec.name} ${className}`
      : `the ${className} leveling rule of thumb`;
  return { weights: resolved.weights, role: roleFor(classId, useSpec ? specId : LEVELING_SPEC_ID), label, pvpStamina: activity === "pvp" };
}

function stat(w: StatWeights, key: keyof StatWeights["stats"]): number {
  return w.stats[key] ?? 0;
}

/** Stamina in PvP is worth at least as much as your main stat (you're the target). */
function staminaWeight(fw: FoodWeights): number {
  const w = fw.weights;
  if (!fw.pvpStamina) return stat(w, "stamina");
  const main = Math.max(stat(w, "strength"), stat(w, "agility"), stat(w, "intellect"), spellDamageWeight(fw));
  return Math.max(stat(w, "stamina"), main);
}

/** Spell damage; weights that only list "spell_power" (damage + healing) count for it — not for healers. */
function spellDamageWeight(fw: FoodWeights): number {
  const w = fw.weights.stats;
  if (w.spell_damage !== undefined) return w.spell_damage;
  if (fw.role === "healer") return 0;
  return w.spell_power ?? 0;
}

/** Healing power only helps a healer; a healer's "spell_power" counts for it. */
function healingWeight(fw: FoodWeights): number {
  const w = fw.weights.stats;
  if (w.healing !== undefined) return w.healing;
  if (fw.role !== "healer") return 0;
  return w.spell_power ?? 0;
}

/** What one buff part is worth. Attack power raises melee AND ranged, so it's the better of the two, not both. */export function partValue(part: FoodBuffPart, fw: FoodWeights): number {
  const keys = part.stats ?? [];
  const w = fw.weights;
  let weight: number;
  if (keys.includes("attack_power")) {
    weight = Math.max(stat(w, "attack_power"), stat(w, "ranged_attack_power"));
  } else if (keys.includes("armor")) {
    weight = w.armor;
  } else if (keys.includes("stamina")) {
    weight = staminaWeight(fw);
  } else if (keys.includes("spell_damage")) {
    weight = spellDamageWeight(fw);
  } else if (keys.includes("healing")) {
    weight = healingWeight(fw);
  } else {
    // "Critical Strike chance" is melee AND spell crit; a spec only weights the one it uses.
    weight = keys.reduce((best, k) => (k === "armor" ? best : Math.max(best, stat(w, k))), 0);
  }
  return part.amount * weight;
}

/** The buff's worth for this class/spec/activity; 0 when it raises nothing they use. */
export function buffValue(buff: FoodBuff | null, fw: FoodWeights): number {
  if (!buff) return 0;
  return buff.parts.reduce((sum, p) => sum + partValue(p, fw), 0);
}

/** The Fishing skill a buff gives (0 for none). */
export function fishingSkill(buff: FoodBuff | null): number {
  return buff?.parts.find((p) => p.utility === "fishing")?.amount ?? 0;
}
