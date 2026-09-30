import type { StatKey } from "@/games/wow-forever/data/statKeys";

/** One thing a Well Fed buff raises, as the client's tooltip words it. */
export interface FoodBuffPart {
  amount: number;
  /** "1% Critical Strike chance", "15% movement speed". */
  percent: boolean;
  label: string;
  /** Item Compare stat keys this counts as ("armor" = the weights' armor weight). */
  stats?: (StatKey | "armor")[];
  /** A buff for a task, not a fight. */
  utility?: "fishing" | "herbalism" | "speed";
}

export interface FoodBuff {
  parts: FoodBuffPart[];
  duration: string;
  /** "while in Westfall" — the buff only works there. */
  zone?: string;
}

export interface FoodRestore {
  amount: number;
  seconds: number;
}

export type FoodKind = "food" | "drink" | "feast" | "other";

export interface FoodLearn {
  /** "recipe" = a Recipe item teaches it; "trainer" = no recipe item (trainer or known from the start). */
  source: "recipe" | "trainer";
  /** Cooking skill to learn it — from the recipe item; null for trainer recipes (see trainerSkills). */
  skill: number | null;
  recipe: string | null;
  /** Cooking skill at which it turns grey (no more skill-ups). */
  greyAt: number | null;
}

/** A row of `data/food/foods.json` — generated from the Forever client, never hand-edited. */
export interface FoodRecord {
  id: number;
  name: string;
  /** Level needed to eat it. */
  level: number;
  heal: FoodRestore | null;
  mana: FoodRestore | null;
  buff: FoodBuff | null;
  /** +N% kill XP, when the client's tooltip lists the Well Fed XP boost. */
  xpBonusPct: number | null;
  tooltip: string;
  learn: FoodLearn;
  kind: FoodKind;
}
