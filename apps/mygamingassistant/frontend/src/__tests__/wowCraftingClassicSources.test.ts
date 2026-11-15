import { describe, expect, it } from "vitest";
import alchemyJson from "@/games/wow-forever/data/professions/crafting/alchemy.json";
import blacksmithingJson from "@/games/wow-forever/data/professions/crafting/blacksmithing.json";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import engineeringJson from "@/games/wow-forever/data/professions/crafting/engineering.json";
import firstaidJson from "@/games/wow-forever/data/professions/crafting/firstaid.json";
import leatherworkingJson from "@/games/wow-forever/data/professions/crafting/leatherworking.json";
import miningJson from "@/games/wow-forever/data/professions/crafting/mining.json";
import tailoringJson from "@/games/wow-forever/data/professions/crafting/tailoring.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import { CRAFTING_PROFESSION, type CraftingFile, type CraftingProfession, type CraftRecipe, type TrainerSkills } from "@/games/wow-forever/types/crafting";
import type { MiningFile } from "@/games/wow-forever/types/gathering/miningFile";
import type { RecipeClassicSource } from "@/games/wow-forever/types/recipeClassicSource";

// The Classic Era client shares its tables with Season of Discovery, so the generator keeps a
// recipe that isn't new in Forever only when a real Classic source teaches it.
const FILES: Record<CraftingProfession, CraftingFile> = {
  tailoring: tailoringJson as unknown as CraftingFile,
  enchanting: enchantingJson as unknown as CraftingFile,
  alchemy: alchemyJson as unknown as CraftingFile,
  blacksmithing: blacksmithingJson as unknown as CraftingFile,
  leatherworking: leatherworkingJson as unknown as CraftingFile,
  engineering: engineeringJson as unknown as CraftingFile,
  firstaid: firstaidJson as unknown as CraftingFile,
};
const MINING = miningJson as unknown as MiningFile;
const TRAINER_SKILLS = trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>;
const CLASSIC_SOURCES: ReadonlySet<RecipeClassicSource> = new Set(["trainer", "item", "start", "quest", "npc"]);

/** Season of Discovery copies that once reached the guides (Earthen Vest, Crimson Silk Belt, Long Silken Cloak, Black Mageweave Vest, Enchanter's Cowl, Greater Mystic Wand). */
const SOD_COPIES = [439100, 439098, 439094, 439086, 439102, 439134];

function classicOf(recipe: CraftRecipe): RecipeClassicSource | undefined {
  return recipe.learn.source === "start" ? undefined : recipe.learn.classic;
}

/** New in Forever, with the skill, or taught by a real Classic source. */
function taughtInForever(recipe: CraftRecipe): boolean {
  const source = classicOf(recipe);
  return Boolean(recipe.newInForever) || recipe.learn.source === "start" || (source !== undefined && CLASSIC_SOURCES.has(source));
}

describe.each(Object.values(CRAFTING_PROFESSION))("%s recipes", (profession) => {
  const recipes = FILES[profession].recipes;

  it("has a Classic teaching source for every recipe that isn't new or with the skill", () => {
    const untaught = recipes.filter((r) => !taughtInForever(r));
    expect(untaught.map((r) => `${r.spell} ${r.name}`)).toEqual([]);
  });

  it("says trainer only for recipes a Classic trainer teaches", () => {
    const skills = TRAINER_SKILLS[profession];
    for (const r of recipes) {
      if (r.learn.source === "trainer" && classicOf(r) === "trainer") expect(skills[String(r.spell)], `${r.spell} ${r.name}`).toBeDefined();
    }
    const bySpell = new Map(recipes.map((r) => [r.spell, r]));
    for (const spell of Object.keys(skills)) {
      const recipe = bySpell.get(Number(spell));
      expect(recipe && classicOf(recipe), spell).toBe("trainer");
    }
  });

  it("labels a recipe trainer only when it's in trainerSkills (or came with Classic's skill, as Forever moved it to a trainer)", () => {
    const skills = TRAINER_SKILLS[profession];
    const strays = recipes.filter(
      (r) => r.learn.source === "trainer" && !r.newInForever && classicOf(r) !== "start" && skills[String(r.spell)] === undefined,
    );
    expect(strays.map((r) => `${r.spell} ${r.name} (${classicOf(r)})`)).toEqual([]);
  });

  it("names the quest or NPC for every recipe Classic taught that way", () => {
    for (const r of recipes) {
      if (r.learn.source === "quest") expect(r.learn.quests.length, `${r.spell} ${r.name}`).toBeGreaterThan(0);
      if (r.learn.source === "npc") expect(r.learn.npcs.every((n) => n.length > 0) && r.learn.npcs.length > 0, `${r.spell} ${r.name}`).toBe(true);
    }
  });

  it("gives new and with-the-skill recipes no Classic source", () => {
    for (const r of recipes.filter((x) => x.newInForever || x.learn.source === "start")) expect(classicOf(r), `${r.spell} ${r.name}`).toBeUndefined();
  });

  it("lists none of Season of Discovery's copies", () => {
    const spells = new Set(recipes.map((r) => r.spell));
    expect(SOD_COPIES.filter((s) => spells.has(s))).toEqual([]);
  });
});

describe("mining recipes", () => {
  it("has a Classic teaching source for every smelt and camp item that isn't new or with the skill", () => {
    const untaught = [...MINING.smelting, ...MINING.camp].filter((r) => !taughtInForever(r));
    expect(untaught.map((r) => `${r.spell} ${r.name}`)).toEqual([]);
  });
});
