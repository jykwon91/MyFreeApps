import { beforeAll, describe, expect, it } from "vitest";
import { loadAllCraftingData } from "@/games/wow-forever/crafting/loadCraftingData";
import { CAMP_BLUEPRINT_DROPS } from "@/games/wow-forever/data/professions/crafting/campBlueprintDrops";
import { campRecipes } from "@/games/wow-forever/lib/campObjects/campRecipes";
import type { CraftingProfession, CraftRecipe } from "@/games/wow-forever/types/crafting";

let byProfession = new Map<CraftingProfession, CraftRecipe[]>();

beforeAll(async () => {
  const all = await loadAllCraftingData();
  byProfession = new Map([...all].map(([p, data]) => [p, campRecipes(data.file.recipes)]));
});

function names(profession: CraftingProfession): string[] {
  return (byProfession.get(profession) ?? []).map((r) => r.name);
}

describe("camp objects", () => {
  it("every crafting profession builds its three camp objects, smallest first", () => {
    expect(names("tailoring")).toEqual(["Faction Banner", "Faction Banner", "Spinning Wheel", "Loom"]);
    expect(names("enchanting")).toEqual(["Enchanted Lute", "Arcane Salvager", "Arcane Forge"]);
    expect(names("alchemy")).toEqual(["Mana Well", "Fermenter", "Alchemy Laboratory"]);
    expect(names("blacksmithing")).toEqual(["Sharpening Wheel", "Anvil", "Master Forge"]);
    expect(names("leatherworking")).toEqual(["Camp Tent", "Tanning Rack", "Sewing Machine"]);
    expect(names("engineering")).toEqual(["Reagent Bot", "Repair Bot", "Anarchist's Workbench"]);
    expect(names("firstaid")).toEqual(["First Aid Kit", "Toxin Study", "Plague Doctor's Laboratory"]);
  });

  it("each one says what it does in the game's words, with level-60 numbers filled in", () => {
    for (const recipes of byProfession.values()) {
      for (const r of recipes) {
        expect(r.effect, r.name).toContain("Requires a Campfire nearby.");
        expect(r.effect, r.name).not.toContain("$");
      }
    }
    const well = byProfession.get("alchemy")?.[0];
    expect(well?.effect).toContain("regenerate 29 Mana every 5 sec");
  });

  it("the bigger ones are taught by a Blueprint from the game files, and each Blueprint has a drop listed", () => {
    const salvager = byProfession.get("enchanting")?.find((r) => r.name === "Arcane Salvager");
    expect(salvager?.learn).toMatchObject({ source: "item", skill: 140, itemId: 273103, item: "Blueprint: Arcane Salvager" });
    const blueprints = [...byProfession.values()].flat().flatMap((r) => (r.learn.source === "item" ? [r.learn.itemId] : []));
    expect(blueprints).toHaveLength(14);
    // Only one player guide names the Arcane Forge's drop, and vaguely ("Nanaya, Kalimdor"), so it stays unknown.
    const unknown = [273116];
    const listed = blueprints.filter((id) => !unknown.includes(id));
    expect(Object.keys(CAMP_BLUEPRINT_DROPS).map(Number).sort()).toEqual([...listed].sort());
  });

  it("campRecipes keeps only camp objects", () => {
    const base = { grey: 0, reagents: [], learn: { source: "trainer" as const } };
    const picked = campRecipes([
      { ...base, spell: 3, name: "Loom", yellow: 300, camp: true },
      { ...base, spell: 1, name: "Bolt of Linen Cloth", yellow: 1 },
      { ...base, spell: 2, name: "Faction Banner", yellow: 20, camp: true },
    ]);
    expect(picked.map((r) => r.spell)).toEqual([2, 3]);
  });
});
