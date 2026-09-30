import foodsJson from "@/games/wow-forever/data/food/foods.json";
import trainerSkillsJson from "@/games/wow-forever/data/food/classic/trainerSkills.json";
import type { FoodRecord } from "@/games/wow-forever/types/food";

/**
 * Every cooked food and drink in the Forever beta client, and the Cooking
 * skill a Classic trainer asks for the recipes that have no recipe item.
 * Both files are GENERATED — re-run `python -m scripts.wow_food.build`.
 */
export const FOODS: readonly FoodRecord[] = foodsJson.foods as FoodRecord[];

/** e.g. "wago.tools DB2 wow_classic_beta 1.60.1.69977". */
export const FOOD_DATA_SOURCE: string = foodsJson.source;

/** The client build the food data was read from, e.g. "1.60.1.69977". */
export const FOOD_DATA_BUILD: string = foodsJson.source.split(" ").pop() ?? "";

/** Cooked item id -> Cooking skill a Classic trainer asks (cmangos classic-db, GPL-3.0). */
export const TRAINER_SKILLS: Readonly<Record<string, number>> = trainerSkillsJson.skills;
