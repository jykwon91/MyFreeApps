import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import blacksmithingJson from "@/games/wow-forever/data/professions/crafting/blacksmithing.json";
import leatherworkingJson from "@/games/wow-forever/data/professions/crafting/leatherworking.json";
import trainerSkillsJson from "@/games/wow-forever/data/professions/crafting/classic/trainerSkills.json";
import { resolveRoute } from "@/games/wow-forever/crafting/craftRoute";
import { parseSpec, routeForSpec, specChain } from "@/games/wow-forever/crafting/craftSpecs";
import { shoppingList, shoppingListText } from "@/games/wow-forever/crafting/shoppingList";
import { CRAFTING_ROUTES } from "@/games/wow-forever/data/professions/crafting/craftingRoutes";
import { CRAFTING_SPECS } from "@/games/wow-forever/data/professions/crafting/craftingSpecs";
import { CRAFT_SPEC_STORAGE_KEY, useCraftingSpec } from "@/games/wow-forever/hooks/useCraftingSpec";
import type { CraftingFile, CraftingProfession, ResolvedRouteEntry, TrainerSkills } from "@/games/wow-forever/types/crafting";

const TRAINER_SKILLS = trainerSkillsJson as unknown as Record<CraftingProfession, TrainerSkills>;
// Every profession with specializations.
const SPEC_FILES = {
  blacksmithing: blacksmithingJson as unknown as CraftingFile,
  leatherworking: leatherworkingJson as unknown as CraftingFile,
} as const;
type SpecProfession = keyof typeof SPEC_FILES;

function entriesFor(profession: SpecProfession): ResolvedRouteEntry[] {
  const file = SPEC_FILES[profession];
  return resolveRoute(CRAFTING_ROUTES[profession], new Map(file.recipes.map((r) => [r.spell, r])), TRAINER_SKILLS[profession]);
}

const FILE = SPEC_FILES.blacksmithing;
const SPECS = CRAFTING_SPECS.blacksmithing!;
const ENTRIES = entriesFor("blacksmithing");

const COPPER_ORE = 2770;
const COPPER_BAR = 2840;

function optionSpells(entries: readonly ResolvedRouteEntry[]): number[] {
  return entries.flatMap((e) => (e.kind === "options" ? e.recipes.map((r) => r.spell) : []));
}

describe.each(Object.keys(SPEC_FILES) as SpecProfession[])("%s specializations", (profession) => {
  const file = SPEC_FILES[profession];
  const specs = CRAFTING_SPECS[profession]!;
  const entries = entriesFor(profession);
  const specOf = (spell: number) => file.recipes.find((r) => r.spell === spell)?.spec;

  it("names a choice for every specialization the data has, at the data's skill", () => {
    const records = file.specs ?? [];
    expect(specs.choices.map((c) => c.spell).sort()).toEqual(records.map((r) => r.spell).sort());
    for (const record of records) {
      for (const quest of record.quests) {
        expect(quest.skill, record.name).toBe(specs.forkAt);
        expect(quest.level, record.name).toBe(specs.level);
      }
    }
  });

  it("never needs a specialization on a craft row, nor before the fork", () => {
    for (const entry of entries) {
      if (entry.kind === "craft") expect(entry.recipe.spec, entry.recipe.name).toBeUndefined();
      else if (entry.step.from < specs.forkAt) for (const r of entry.recipes) expect(r.spec, r.name).toBeUndefined();
    }
  });

  it("shows every option until you choose, then only yours and the ones anyone can make", () => {
    expect(optionSpells(routeForSpec(entries, specs, null))).toEqual(optionSpells(entries));
    for (const choice of specs.choices) {
      const allowed = new Set(specChain(specs, choice.id).map((c) => c.spell));
      const kept = optionSpells(routeForSpec(entries, specs, choice.id));
      expect(kept.length, choice.id).toBeGreaterThan(0);
      for (const spell of kept) {
        const spec = specOf(spell);
        expect(spec === undefined || allowed.has(spec), `${choice.id} ${spell}`).toBe(true);
      }
      // Every route option your choice can learn stays.
      for (const spell of optionSpells(entries)) {
        const spec = specOf(spell);
        if (spec === undefined || allowed.has(spec)) expect(kept, `${choice.id} ${spell}`).toContain(spell);
      }
      // And each first-level choice gets at least one recipe of its own.
      if (!choice.requires) expect(kept.some((spell) => specOf(spell) === choice.spell), choice.id).toBe(true);
    }
  });

  it("leaves something to craft to 300 whichever you choose", () => {
    for (const choice of specs.choices) {
      const route = routeForSpec(entries, specs, choice.id);
      const last = route[route.length - 1];
      expect(last.step.to).toBe(300);
      const recipes = last.kind === "options" ? last.recipes : [last.recipe];
      expect(recipes.some((r) => r.grey > 299), choice.id).toBe(true);
    }
  });
});

describe("Blacksmithing master specializations", () => {
  it("puts the masters after Weaponsmith", () => {
    expect(specChain(SPECS, "axesmith").map((c) => c.id)).toEqual(["axesmith", "weaponsmith"]);
    expect(specChain(SPECS, "armorsmith").map((c) => c.id)).toEqual(["armorsmith"]);
  });

  it("accepts only the profession's own choices", () => {
    expect(parseSpec(SPECS, "weaponsmith")).toBe("weaponsmith");
    expect(parseSpec(SPECS, "dragonscale")).toBeNull();
    expect(parseSpec(undefined, "weaponsmith")).toBeNull();
  });

});

describe("Blacksmithing shopping list", () => {
  it("counts ore for the bars you smelt, with the Mining skill", () => {
    const list = shoppingList(ENTRIES, null, FILE, "Blacksmithing");
    expect(list.buy.some((l) => l.id === COPPER_BAR)).toBe(false);
    expect(list.buy.find((l) => l.id === COPPER_ORE)?.count).toBeGreaterThan(0);
    const copper = list.smelt.find((l) => l.id === COPPER_BAR);
    expect(copper?.smeltSkill).toBe(1);
    expect(shoppingListText(list)).toMatch(/Smelt \d+x Copper Bar \(Mining 1, from \d+x Copper Ore\)/);
    expect(shoppingListText(list)).not.toMatch(/\d+ ?(gold|silver|copper)\b/i);
  });
});

describe("useCraftingSpec", () => {
  afterEach(() => window.localStorage.clear());

  function wrapper(url: string) {
    return function Wrapper({ children }: { children: ReactNode }) {
      return <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
    };
  }

  it("saves a choice per profession", () => {
    const { result } = renderHook(() => useCraftingSpec("blacksmithing"), { wrapper: wrapper("/p") });
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]("armorsmith"));
    expect(result.current[0]).toBe("armorsmith");
    expect(JSON.parse(window.localStorage.getItem(CRAFT_SPEC_STORAGE_KEY)!)).toEqual({ blacksmithing: "armorsmith" });
  });

  it("lets a ?spec= link win and drops a value the profession doesn't have", () => {
    window.localStorage.setItem(CRAFT_SPEC_STORAGE_KEY, JSON.stringify({ blacksmithing: "armorsmith", tailoring: "x" }));
    expect(renderHook(() => useCraftingSpec("blacksmithing"), { wrapper: wrapper("/p?spec=weaponsmith") }).result.current[0]).toBe("weaponsmith");
    expect(renderHook(() => useCraftingSpec("blacksmithing"), { wrapper: wrapper("/p?spec=nope") }).result.current[0]).toBe("armorsmith");
    window.localStorage.setItem(CRAFT_SPEC_STORAGE_KEY, JSON.stringify({ blacksmithing: "tribal" }));
    expect(renderHook(() => useCraftingSpec("blacksmithing"), { wrapper: wrapper("/p") }).result.current[0]).toBeNull();
    expect(renderHook(() => useCraftingSpec("tailoring"), { wrapper: wrapper("/p?spec=armorsmith") }).result.current[0]).toBeNull();
  });

  it("keeps each profession's choice apart", () => {
    const smith = renderHook(() => useCraftingSpec("blacksmithing"), { wrapper: wrapper("/p") });
    act(() => smith.result.current[1]("weaponsmith"));
    const leather = renderHook(() => useCraftingSpec("leatherworking"), { wrapper: wrapper("/p") });
    expect(leather.result.current[0]).toBeNull();
    act(() => leather.result.current[1]("tribal"));
    expect(JSON.parse(window.localStorage.getItem(CRAFT_SPEC_STORAGE_KEY)!)).toEqual({ blacksmithing: "weaponsmith", leatherworking: "tribal" });
    expect(renderHook(() => useCraftingSpec("leatherworking"), { wrapper: wrapper("/p?spec=weaponsmith") }).result.current[0]).toBe("tribal");
  });
});
