import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import type { CraftingFile, CraftingProfession, TrainerSkills } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";

// Each profession's data is ~100–200 KB, so it loads only when its guide (or Ask) needs it.
const RECIPE_FILES: Readonly<Record<CraftingProfession, () => Promise<{ default: unknown }>>> = {
  tailoring: () => import("@/games/wow-forever/data/professions/crafting/tailoring.json"),
  enchanting: () => import("@/games/wow-forever/data/professions/crafting/enchanting.json"),
  alchemy: () => import("@/games/wow-forever/data/professions/crafting/alchemy.json"),
  blacksmithing: () => import("@/games/wow-forever/data/professions/crafting/blacksmithing.json"),
  leatherworking: () => import("@/games/wow-forever/data/professions/crafting/leatherworking.json"),
  engineering: () => import("@/games/wow-forever/data/professions/crafting/engineering.json"),
  firstaid: () => import("@/games/wow-forever/data/professions/crafting/firstaid.json"),
};

/** The generated recipe, trainer and source data for one crafting profession. */
export async function loadCraftingData(profession: CraftingProfession): Promise<CraftingData> {
  const [recipes, skills, sources] = await Promise.all([
    RECIPE_FILES[profession](),
    import("@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json"),
    import("@/games/wow-forever/data/professions/crafting/classic/sources.json"),
  ]);
  const file = recipes.default as CraftingFile;
  const trainerSkills = (skills.default as unknown as Record<CraftingProfession, TrainerSkills>)[profession];
  return {
    file,
    recipes: new Map(file.recipes.map((r) => [r.spell, r])),
    trainerSkills,
    sources: createSourceLookup(sources.default as unknown as RawSourcesFile),
  };
}
