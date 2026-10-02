import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import FoodSourceList from "@/games/wow-forever/components/food/detail/FoodSourceList";
import sourcesJson from "@/games/wow-forever/data/professions/crafting/classic/sources.json";
import tailoringJson from "@/games/wow-forever/data/professions/crafting/tailoring.json";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import { resolveRoute } from "@/games/wow-forever/crafting/craftRoute";
import { describeDisenchant, describeSkinning, matSummary, soldToYou } from "@/games/wow-forever/crafting/matSources";
import { shoppingList, shoppingListText } from "@/games/wow-forever/crafting/shoppingList";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import { describeCommonDrop, hasSources, isCommonDrop } from "@/games/wow-forever/food/recipeSources";
import { FACTION } from "@/games/wow-forever/types/worldMap";
import type { CraftingFile, CraftingProfession, TrainerSkills } from "@/games/wow-forever/types/crafting";

const SOURCES = createSourceLookup(sourcesJson as unknown as RawSourcesFile);
const FILES: Record<CraftingProfession, CraftingFile> = {
  tailoring: tailoringJson as unknown as CraftingFile,
  enchanting: enchantingJson as unknown as CraftingFile,
};
const TRAINER_SKILLS = trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>;

const LINEN_CLOTH = 2589;
const COARSE_THREAD = 2320;
const STRANGE_DUST = 10940;
const SOUL_DUST = 11083;
const LESSER_MAGIC_ESSENCE = 10938;
const LARGE_GLIMMERING_SHARD = 11084;
const RUGGED_LEATHER = 8170;
const WOOL_CLOTH = 2592;
const COPPER_ROD = 6217;

function summary(itemId: number, madeBy: string | null = null): string {
  return matSummary({ sources: SOURCES.reagent(itemId), madeBy }, FACTION.alliance, null);
}

describe("crafting material sources", () => {
  it("sums up cloth as a drop from mobs in a level band, not three named mobs", () => {
    const drop = SOURCES.reagent(LINEN_CLOTH).drop;
    expect(drop && isCommonDrop(drop)).toBe(true);
    expect(summary(LINEN_CLOTH)).toMatch(/^Drops from mobs level \d+–\d+$/);
    expect(describeCommonDrop(drop!)).toMatch(/^Drops from \d+ kinds of mobs, level \d+–\d+ — most in /);
  });

  it("still lists the cloth drop when a chest also holds it", () => {
    const { container } = render(
      <FoodSourceList sources={SOURCES.reagent(LINEN_CLOTH)} faction={FACTION.alliance} zoneId={null} preferEasySources />,
    );
    expect(container.textContent).toMatch(/Drops from \d+ kinds of mobs, level/);
  });

  it("says vendor goods are sold in most towns", () => {
    expect(summary(COARSE_THREAD)).toBe("Sold in most towns");
  });

  it("tells you which greens to disenchant for dusts and essences", () => {
    const soul = SOURCES.reagent(SOUL_DUST).disenchant!;
    expect(soul).toMatchObject({ minLevel: 21, maxLevel: 30, mostlyFrom: "armor" });
    expect(describeDisenchant(soul)).toBe("Disenchant green armor for level 21–30 (about 75% each).");
    expect(summary(SOUL_DUST)).toBe("Disenchant level 21–30 green armor");
    expect(SOURCES.reagent(LESSER_MAGIC_ESSENCE).disenchant?.mostlyFrom).toBe("weapon");
  });

  it("points shards at blue items, which always give one", () => {
    const shard = SOURCES.reagent(LARGE_GLIMMERING_SHARD).disenchant!;
    expect(shard.fromBlue).toBe(true);
    expect(describeDisenchant(shard)).toMatch(/^Disenchant blue items for level 21–25 — every one gives a shard/);
  });

  it("puts a limited-stock vendor after disenchanting", () => {
    expect(summary(STRANGE_DUST)).toMatch(/^Disenchant level 5–20 green armor · Sold .*\(limited stock\)$/);
  });

  it("says where to skin leather, but not sheep for Wool Cloth", () => {
    const skin = SOURCES.reagent(RUGGED_LEATHER).skinning!;
    expect(describeSkinning(skin)).toMatch(/^Skin beasts level \d+–\d+ — most in /);
    expect(summary(RUGGED_LEATHER, "Leatherworking")).toMatch(/^Skin beasts level \d+–\d+ · Made by Leatherworking$/);
    expect(SOURCES.reagent(WOOL_CLOTH).skinning).toBeNull();
  });

  it("buys a rod a vendor sells, even though Blacksmithing can make it", () => {
    expect(soldToYou(SOURCES.reagent(COPPER_ROD), FACTION.alliance)).toBe(true);
  });

  it("knows where every material of both routes comes from, apart from items new in Forever", () => {
    for (const profession of ["tailoring", "enchanting"] as const) {
      const file = FILES[profession];
      const recipes = new Map(file.recipes.map((r) => [r.spell, r]));
      const entries = resolveRoute(CRAFTING_ROUTES[profession], recipes, TRAINER_SKILLS[profession]);
      const label = profession === "tailoring" ? "Tailoring" : "Enchanting";
      const unknown = shoppingList(entries, null, file, label)
        .buy.filter((l) => !l.madeBy && l.id < 100_000 && !hasSources(SOURCES.reagent(l.id)))
        .map((l) => l.name);
      expect(unknown, profession).toEqual([]);
    }
  });

  it("copies the list with where to get each item", () => {
    const file = FILES.tailoring;
    const entries = resolveRoute(CRAFTING_ROUTES.tailoring, new Map(file.recipes.map((r) => [r.spell, r])), TRAINER_SKILLS.tailoring);
    const list = shoppingList(entries, null, file, "Tailoring");
    const text = shoppingListText(list, (l) => summary(l.id, l.madeBy ?? null));
    expect(text).toMatch(/^\d+x Linen Cloth — Drops from mobs level/m);
    expect(text).toMatch(/^\d+x Coarse Thread — Sold in most towns$/m);
  });
});
