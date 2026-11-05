import { useCallback, useEffect, useState } from "react";
import { createSourceLookup, type RawSourcesFile, type SourceLookup } from "@/games/wow-forever/data/sourceDecode";
import type { CraftingFile, CraftingProfession, CraftRecipe, TrainerSkills } from "@/games/wow-forever/types/crafting";

export interface CraftingData {
  file: CraftingFile;
  recipes: ReadonlyMap<number, CraftRecipe>;
  trainerSkills: TrainerSkills;
  sources: SourceLookup;
}

export type CraftingDataState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; data: CraftingData };

// Each profession's data is ~100–200 KB, so it loads only when its guide is opened.
const RECIPE_FILES: Readonly<Record<CraftingProfession, () => Promise<{ default: unknown }>>> = {
  tailoring: () => import("@/games/wow-forever/data/professions/crafting/tailoring.json"),
  enchanting: () => import("@/games/wow-forever/data/professions/crafting/enchanting.json"),
  alchemy: () => import("@/games/wow-forever/data/professions/crafting/alchemy.json"),
  blacksmithing: () => import("@/games/wow-forever/data/professions/crafting/blacksmithing.json"),
};

async function load(profession: CraftingProfession): Promise<CraftingData> {
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

/** The generated recipe, trainer and source data for one crafting profession. */
export function useCraftingData(profession: CraftingProfession): CraftingDataState {
  const [result, setResult] = useState<{ profession: CraftingProfession; data: CraftingData | null } | null>(null);
  // The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
  const retry = useCallback(() => window.location.reload(), []);

  useEffect(() => {
    let live = true;
    load(profession).then(
      (data) => live && setResult({ profession, data }),
      () => live && setResult({ profession, data: null }),
    );
    return () => {
      live = false;
    };
  }, [profession]);

  if (!result || result.profession !== profession) return { status: "loading" };
  if (!result.data) return { status: "error", retry };
  return { status: "ready", data: result.data };
}
