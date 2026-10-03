import { describe, expect, it } from "vitest";
import tailoringJson from "@/games/wow-forever/data/professions/crafting/tailoring.json";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import {
  currentEntryIndex,
  expectedCrafts,
  learnAt,
  learnSkill,
  parseSkill,
  resolveRoute,
  skillColors,
} from "@/games/wow-forever/crafting/craftRoute";
import { shoppingList, shoppingListText } from "@/games/wow-forever/crafting/shoppingList";
import { CRAFTING_GUIDES } from "@/games/wow-forever/data/professions/crafting/craftingGuide";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_RANKS } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { createSourceLookup, type RawSourcesFile } from "@/games/wow-forever/data/sourceDecode";
import sourcesJson from "@/games/wow-forever/data/professions/crafting/classic/sources.json";
import { hasSources } from "@/games/wow-forever/food/recipeSources";
import type { CraftingFile, CraftingProfession, CraftRecipe, TrainerSkills } from "@/games/wow-forever/types/crafting";

const SOURCES = createSourceLookup(sourcesJson as unknown as RawSourcesFile);

const FILES: Record<CraftingProfession, CraftingFile> = {
  tailoring: tailoringJson as unknown as CraftingFile,
  enchanting: enchantingJson as unknown as CraftingFile,
};
const TRAINER_SKILLS = trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>;
const PROFESSIONS = ["tailoring", "enchanting"] as const;

function recipeMap(file: CraftingFile): Map<number, CraftRecipe> {
  return new Map(file.recipes.map((r) => [r.spell, r]));
}

function resolved(profession: CraftingProfession) {
  return resolveRoute(CRAFTING_ROUTES[profession], recipeMap(FILES[profession]), TRAINER_SKILLS[profession]);
}

const BOLT_OF_LINEN = 2996;
const LINEN_CLOTH = 2589;

describe("expectedCrafts", () => {
  const recipe = { yellow: 25, grey: 50 };

  it("counts one craft per point while orange", () => {
    expect(expectedCrafts(recipe, 1, 25)).toBe(24);
  });

  it("needs more crafts as the recipe fades toward grey", () => {
    // 25 -> 26 is a sure point (chance 25/25); 45 -> 46 is 5/25, so five crafts.
    expect(expectedCrafts(recipe, 25, 26)).toBe(1);
    expect(expectedCrafts(recipe, 45, 46)).toBe(5);
    expect(expectedCrafts(recipe, 25, 45)).toBeGreaterThan(20);
  });

  it("never gives a point at grey", () => {
    expect(expectedCrafts(recipe, 49, 51)).toBe(Number.POSITIVE_INFINITY);
  });

  it("puts green half-way", () => {
    expect(skillColors(recipe)).toEqual({ yellow: 25, green: 38, grey: 50 });
  });
});

describe("currentEntryIndex and parseSkill", () => {
  const entries = [{ step: { from: 1, to: 50 } }, { step: { from: 50, to: 95 } }];

  it("picks the row that still raises your skill", () => {
    expect(currentEntryIndex(entries, null)).toBeNull();
    expect(currentEntryIndex(entries, 1)).toBe(0);
    expect(currentEntryIndex(entries, 50)).toBe(1);
    expect(currentEntryIndex(entries, 94)).toBe(1);
    expect(currentEntryIndex(entries, 95)).toBe(2);
  });

  it("accepts only whole skills from 1 to 300", () => {
    expect(parseSkill("120")).toBe(120);
    expect(parseSkill(300)).toBe(300);
    for (const bad of ["", "0", "301", "12.5", "abc", null, undefined]) expect(parseSkill(bad)).toBeNull();
  });
});

describe("learnAt", () => {
  const base: CraftRecipe = { spell: 1, name: "X", yellow: 60, grey: 95, reagents: [], learn: { source: "trainer" } };

  it("uses the Forever trainer skill and flags it when it moved from Classic", () => {
    expect(learnAt(base, { "1": { classic: 60, forever: 60 } })).toEqual({ kind: "trainer", skill: 60, estimated: false });
    expect(learnAt(base, { "1": { classic: 60, forever: 50 } })).toEqual({ kind: "trainer", skill: 50, estimated: true });
    expect(learnAt(base, {})).toEqual({ kind: "trainer", skill: 60, estimated: true });
  });

  it("keeps patterns and starting recipes", () => {
    expect(learnSkill(learnAt({ ...base, learn: { source: "start", skill: 1 } }, {}))).toBe(1);
    const item = learnAt({ ...base, learn: { source: "item", skill: 175, itemId: 9, item: "Pattern: X" } }, {});
    expect(item).toEqual({ kind: "item", skill: 175, itemId: 9, item: "Pattern: X" });
  });
});

describe("shoppingList", () => {
  const tailoring = resolved("tailoring");

  it("turns bolts into cloth, after counting the bolts the route makes", () => {
    const list = shoppingList(tailoring, null, FILES.tailoring, "Tailoring");
    expect(list.buy.some((l) => l.id === BOLT_OF_LINEN)).toBe(false);
    const linen = list.buy.find((l) => l.id === LINEN_CLOTH);
    expect(linen?.count).toBeGreaterThan(0);
    expect(shoppingListText(list)).toContain("Linen Cloth");
  });

  it("only lists what is still ahead of your skill", () => {
    const whole = shoppingList(tailoring, null, FILES.tailoring, "Tailoring");
    const late = shoppingList(tailoring, 250, FILES.tailoring, "Tailoring");
    expect(late.buy.some((l) => l.id === LINEN_CLOTH)).toBe(false);
    expect(late.buy.length).toBeLessThan(whole.buy.length);
  });
});

describe("Enchanting 110–140", () => {
  it("uses trainer recipes, not a limited-stock formula", () => {
    const rows = resolved("enchanting").filter((e) => e.kind === "craft" && e.step.from >= 110 && e.step.to <= 140);
    expect(rows.map((e) => e.kind === "craft" && e.recipe.spell)).toEqual([7779, 13421]);
    for (const row of rows) expect(row.kind === "craft" && row.recipe.learn.source).toBe("trainer");
  });
});

describe.each(PROFESSIONS)("%s route data", (profession) => {
  const file = FILES[profession];
  const entries = resolved(profession);

  it("runs without gaps from 1 to 300", () => {
    expect(entries[0].step.from).toBe(1);
    expect(entries[entries.length - 1].step.to).toBe(300);
    for (let i = 1; i < entries.length; i++) expect(entries[i].step.from).toBe(entries[i - 1].step.to);
  });

  it("only crafts recipes you can learn by then and that still give points", () => {
    for (const entry of entries) {
      if (entry.kind !== "craft") {
        for (const recipe of entry.recipes) expect(recipe.grey, recipe.name).toBeGreaterThan(entry.step.from);
        continue;
      }
      expect(learnSkill(entry.learn), entry.recipe.name).toBeLessThanOrEqual(entry.step.from);
      expect(entry.step.to, entry.recipe.name).toBeLessThan(entry.recipe.grey);
      expect(Number.isFinite(entry.crafts)).toBe(true);
    }
  });

  it("makes each tool it needs before the row that needs it", () => {
    entries.forEach((entry, i) => {
      if (entry.kind !== "craft" || !entry.recipe.tool) return;
      const tool = entry.recipe.tool.id;
      const makerIndex = entries.findIndex((e) => e.kind === "craft" && e.recipe.creates?.id === tool);
      if (makerIndex !== -1) expect(makerIndex, entry.recipe.name).toBeLessThan(i);
    });
  });

  it("trains each rank before the route goes past its cap", () => {
    let cap = 75;
    for (const entry of entries) {
      const reached = CRAFTING_RANKS[profession].filter((r) => r.skill <= entry.step.from);
      const rank = reached[reached.length - 1];
      if (rank) cap = rank.cap;
      expect(entry.step.to, `${entry.step.from}-${entry.step.to}`).toBeLessThanOrEqual(cap);
    }
  });

  // A hand-route row that needs a Pattern / Formula must say where to get it —
  // the data's vendor / drop list, or a note. Else the guide routes you
  // through a recipe you can't find (the old Enchanting 110–130 row).
  it("says where to get every pattern or formula it needs", () => {
    for (const entry of entries) {
      if (entry.kind !== "craft" || entry.recipe.learn.source !== "item") continue;
      const known = hasSources(SOURCES.recipe(entry.recipe.learn.itemId));
      expect(known || Boolean(entry.step.note), `${entry.step.from}-${entry.step.to} ${entry.recipe.learn.item}`).toBe(true);
    }
    for (const entry of entries) {
      if (entry.kind !== "options") continue;
      for (const option of entry.step.options) expect(option.detail, `option ${option.spell}`).not.toBe("");
    }
  });

  it("states the right number of new Forever recipes", () => {
    const count = file.recipes.filter((r) => r.newInForever).length;
    expect(CRAFTING_GUIDES[profession].forever.some((c) => c.text.includes(`adds ${count} `))).toBe(true);
  });
});
