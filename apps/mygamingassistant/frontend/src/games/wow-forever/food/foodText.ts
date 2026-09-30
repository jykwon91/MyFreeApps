import type { FoodActivity } from "@/games/wow-forever/food/foodActivities";
import type { FoodPick } from "@/games/wow-forever/food/rankFoods";
import type { FoodBuff, FoodRecord, FoodRestore } from "@/games/wow-forever/types/food";

/** "+25 Strength, +10 Stamina" / "+15% movement speed in Westfall". */
export function describeBuff(buff: FoodBuff): string {
  const parts = buff.parts.map((p) => `+${p.amount}${p.percent ? "%" : ""} ${p.label}`).join(", ");
  return buff.zone ? `${parts} in ${buff.zone}` : parts;
}

export function describeRestore(restore: FoodRestore, what: "health" | "mana"): string {
  return `${restore.amount.toLocaleString()} ${what} over ${restore.seconds} sec`;
}

/** "Heals 1,392 over 30 sec" — or the mana a drink gives back. */
export function describeRestores(food: FoodRecord): string | null {
  if (food.heal) return `Heals ${describeRestore(food.heal, "health")}`;
  if (food.mana) return `Restores ${describeRestore(food.mana, "mana")}`;
  return null;
}

/** One line on why this is the pick. */
export function whyLine(pick: FoodPick, activity: FoodActivity, who: string): string {
  const { food } = pick;
  const buff = food.buff ? describeBuff(food.buff) : "";
  if (activity === "healing" && food.heal) return `Heals the most of what you can eat: ${describeRestore(food.heal, "health")}.`;
  if (activity === "fishing") return `The most Fishing skill you can eat: ${buff}.`;
  const kindNote = food.kind === "feast" ? " Set it out for the whole group." : "";
  return `${buff} for ${food.buff?.duration ?? "15 min"} — worth the most to ${who}.${kindNote}`;
}

/** "Needs a recipe · Cooking 225" / "Trainer · Cooking 50" / "Trainer". */
export function learnLabel(pick: FoodPick): string {
  const source = pick.food.learn.source === "recipe" ? "Needs a recipe" : "Trainer";
  return pick.skillNeeded === null ? source : `${source} · Cooking ${pick.skillNeeded}`;
}
