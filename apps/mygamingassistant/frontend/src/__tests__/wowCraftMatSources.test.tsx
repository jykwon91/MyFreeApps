import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
import {
  canFarm,
  describeCommonDrop,
  farmSpots,
  hasSources,
  isCommonDrop,
  isHostileGround,
  isRareDrop,
  mobsForLevel,
  stockLabel,
} from "@/games/wow-forever/food/recipeSources";
import { FACTION, TERRITORY } from "@/games/wow-forever/types/worldMap";
import { COOKING_ROUTE } from "@/games/wow-forever/data/professions/cooking";
import { FOOD_SOURCES } from "@/games/wow-forever/data/food/recipeSourceData";
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
const SPIDERS_SILK = 3182;
// Linen, Wool, Silk, Mageweave, Runecloth.
const CLOTH = [LINEN_CLOTH, WOOL_CLOTH, 4306, 4338, 14047];

function summary(itemId: number, madeBy: string | null = null, level: number | null = null): string {
  return matSummary({ sources: SOURCES.reagent(itemId), madeBy }, { faction: FACTION.alliance, zoneId: null, level });
}

describe("crafting material sources", () => {
  it("names a farm spot for cloth on your own side, not just a level band", () => {
    const drop = SOURCES.reagent(LINEN_CLOTH).drop!;
    expect(isCommonDrop(drop)).toBe(true);
    expect(describeCommonDrop(drop)).toMatch(/^\d+ kinds of mobs drop it, level \d+–\d+\. The best one to farm in each zone:$/);
    const alliance = farmSpots(drop, FACTION.alliance, null)[0];
    const horde = farmSpots(drop, FACTION.horde, null)[0];
    expect(alliance.spot?.territory).toBe(TERRITORY.alliance);
    expect(horde.spot?.territory).toBe(TERRITORY.horde);
    expect(summary(LINEN_CLOTH)).toBe(
      `Drops from ${alliance.name}, level ${alliance.minLevel}–${alliance.maxLevel}, ${alliance.spot?.zoneName}`,
    );
  });

  it("puts your zone's farm spot first and the other faction's zones last", () => {
    const drop = SOURCES.reagent(WOOL_CLOTH).drop!;
    const spots = farmSpots(drop, FACTION.alliance, null);
    const hostile = spots.map((m) => isHostileGround(m.spot!, FACTION.alliance));
    expect(hostile.indexOf(true)).toBeGreaterThan(0);
    expect(hostile.slice(hostile.indexOf(true)).every(Boolean)).toBe(true);
    const ashenvale = spots.find((m) => m.spot?.zoneName === "Ashenvale")!;
    expect(farmSpots(drop, FACTION.alliance, ashenvale.spot!.zoneId)[0]).toBe(ashenvale);
  });

  it("gives every cloth-like drop a farm spot, and each cloth several with a place and coordinates", () => {
    for (const lookup of [SOURCES, FOOD_SOURCES]) {
      for (const id of Object.keys(sourcesJson.reagents)) {
        const drop = lookup.reagent(Number(id)).drop;
        if (!drop || isRareDrop(drop) || !isCommonDrop(drop)) continue;
        expect(drop.mobs.length, id).toBeGreaterThanOrEqual(CLOTH.includes(Number(id)) ? 5 : 1);
        for (const m of drop.mobs) expect(m.spot?.zoneName, `${id} ${m.name}`).toBeTruthy();
      }
    }
  });

  it("lists the cloth farm spots with directions, warning about the other faction's ground", () => {
    const { container, getByRole } = render(
      <MemoryRouter>
        <FoodSourceList sources={SOURCES.reagent(WOOL_CLOTH)} faction={FACTION.alliance} zoneId={null} level={null} preferEasySources />
      </MemoryRouter>,
    );
    const list = getByRole("list", { name: "Where to farm it" });
    expect(list.querySelectorAll("li").length).toBe(5);
    expect(list.querySelectorAll("a").length).toBe(5);
    expect(container.textContent).not.toContain("Horde territory");
    fireEvent.click(getByRole("button", { name: /^Show \d+ more farm spots$/ }));
    expect(list.querySelectorAll("li").length).toBe(SOURCES.reagent(WOOL_CLOTH).drop!.mobs.length);
    expect(container.textContent).toContain("Thistlefur Village, Ashenvale");
    expect(container.textContent).toContain("Horde territory");
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
    expect(summary(STRANGE_DUST)).toMatch(/^Disenchant level 5–20 green armor · Sold .*\(limited, 4 at a time\)$/);
  });

  it("says how many a limited vendor holds and how often it restocks", () => {
    const tilli = SOURCES.reagent(LESSER_MAGIC_ESSENCE).vendors.find((v) => v.name === "Tilli Thistlefuzz")!;
    expect(tilli).toMatchObject({ limited: true, stock: 2, restockMinutes: 120 });
    expect(stockLabel(tilli)).toBe("2 at a time · restocks about every 2 hours");
    const { container } = render(
      <MemoryRouter>
        <FoodSourceList sources={SOURCES.reagent(LESSER_MAGIC_ESSENCE)} faction={FACTION.alliance} zoneId={null} level={null} />
      </MemoryRouter>,
    );
    expect(container.textContent).toContain("Limited: 2 at a time · restocks about every 2 hours");
    expect(container.textContent).toContain("shared with every player on your realm");
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

  it("names the lowest-level mob that drops a meat, with its level", () => {
    const wolves = FOOD_SOURCES.reagent(2672).drop!.mobs;
    const lowest = Math.min(...wolves.map((m) => m.minLevel));
    const line = matSummary({ sources: FOOD_SOURCES.reagent(2672), madeBy: null }, { faction: FACTION.alliance, zoneId: null, level: null }, 1);
    expect(line).toMatch(new RegExp(`^Drops from .+, level ${lowest}(–[0-9]+)?$`));
  });

  it("names every Cooking route material with an item that has known sources", () => {
    for (const step of COOKING_ROUTE) {
      if (step.kind !== "craft") continue;
      const text = typeof step.materials === "string" ? step.materials : Object.values(step.materials).join(" ");
      expect(step.mats?.length, step.name).toBeGreaterThan(0);
      for (const m of step.mats ?? []) {
        expect(text, step.name).toContain(m.name);
        expect(hasSources(FOOD_SOURCES.reagent(m.id)), m.name).toBe(true);
      }
    }
  });

  it("copies the list with where to get each item", () => {
    const file = FILES.tailoring;
    const entries = resolveRoute(CRAFTING_ROUTES.tailoring, new Map(file.recipes.map((r) => [r.spell, r])), TRAINER_SKILLS.tailoring);
    const list = shoppingList(entries, null, file, "Tailoring");
    const text = shoppingListText(list, (l) => summary(l.id, l.madeBy ?? null));
    expect(text).toMatch(/^\d+x Linen Cloth — Drops from [^,]+, level \d+–\d+, /m);
    expect(text).toMatch(/^\d+x Coarse Thread — Sold in most towns$/m);
  });

  it("lists every mob that drops Spider's Silk, each with its own chance", () => {
    const drop = SOURCES.reagent(SPIDERS_SILK).drop!;
    expect(isRareDrop(drop) || isCommonDrop(drop)).toBe(false);
    expect(drop.mobs.length).toBeGreaterThan(20);
    expect(drop.mobs.every((m) => m.chance >= 1)).toBe(true);
  });

  it("ranks the mobs you can farm at your level by drop chance, then the ones too high", () => {
    const ranked = mobsForLevel(SOURCES.reagent(SPIDERS_SILK).drop!.mobs, 20);
    const farmable = ranked.filter((r) => !r.tooHigh).map((r) => r.mob);
    const tooHigh = ranked.filter((r) => r.tooHigh).map((r) => r.mob);
    expect(farmable.length).toBeGreaterThan(0);
    expect(farmable.every((m) => m.maxLevel <= 22)).toBe(true);
    expect(farmable.map((m) => m.chance)).toEqual([...farmable.map((m) => m.chance)].sort((a, b) => b - a));
    expect(tooHigh.every((m) => !canFarm(m, 20))).toBe(true);
    expect(tooHigh.map((m) => m.minLevel)).toEqual([...tooHigh.map((m) => m.minLevel)].sort((a, b) => a - b));
    expect(ranked.slice(0, farmable.length).every((r) => !r.tooHigh)).toBe(true);
  });

  it("keeps the data's order when no level is set", () => {
    const mobs = SOURCES.reagent(SPIDERS_SILK).drop!.mobs;
    expect(mobsForLevel(mobs, null).map((r) => r.mob)).toEqual(mobs);
  });

  it("names the best drop chance you can farm at your level in the one-liner", () => {
    const best = mobsForLevel(SOURCES.reagent(SPIDERS_SILK).drop!.mobs, 30)[0].mob;
    expect(summary(SPIDERS_SILK, null, 30)).toBe(`Drops from ${best.name}, level ${best.minLevel}–${best.maxLevel}, ${best.chance}%`);
    // Too low to farm any of them: the lowest-level mob, as without a level.
    expect(summary(SPIDERS_SILK, null, 5)).toBe(summary(SPIDERS_SILK));
  });

  it("shows five mobs, then all of them, marking the ones too high for you", () => {
    const drop = SOURCES.reagent(SPIDERS_SILK).drop!;
    const { container, getByRole, getByText } = render(
      <MemoryRouter>
        <FoodSourceList sources={SOURCES.reagent(SPIDERS_SILK)} faction={FACTION.alliance} zoneId={null} level={20} />
      </MemoryRouter>,
    );
    expect(getByText(`Drops from ${drop.mobs.length} mobs, highest drop chance you can farm at level 20 first`)).toBeInTheDocument();
    const list = getByRole("list", { name: "Mobs that drop it" });
    expect(list.querySelectorAll("li").length).toBe(5);
    const best = mobsForLevel(drop.mobs, 20)[0].mob;
    expect(list.querySelector("li")!.textContent).toContain(`${best.name} (level ${best.minLevel}–${best.maxLevel}) · ${best.chance}%`);
    fireEvent.click(getByRole("button", { name: `Show ${drop.mobs.length - 5} more mobs` }));
    expect(list.querySelectorAll("li").length).toBe(drop.mobs.length);
    expect(container.textContent).toContain("Too high for level 20");
  });
});
