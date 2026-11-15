import type { PROFESSION } from "@/games/wow-forever/data/professions/professionTypes";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";

/** A profession the Goal planner can level: every crafting one (First Aid included) and Cooking. */
export type PlannerProfession = CraftingProfession | typeof PROFESSION.cooking;
