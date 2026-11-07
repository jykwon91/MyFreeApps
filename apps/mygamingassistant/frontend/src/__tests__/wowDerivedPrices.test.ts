import { describe, expect, it } from "vitest";
import { autoPrice, derivePrices, withDerived, type Makers } from "@/games/wow-forever/crafting/derivedPrices";
import enchantingJson from "@/games/wow-forever/data/professions/crafting/enchanting.json";
import type { CraftingFile } from "@/games/wow-forever/types/crafting";

const LESSER_ASTRAL = 10998;
const GREATER_ASTRAL = 11082;
const ORE = 1;
const BAR = 2;
const STONE = 3;
const ROD = 4;

function reagent(id: number, count: number) {
  return { id, name: `Item ${id}`, count };
}

const MAKERS: Makers = {
  [BAR]: { count: 1, reagents: [reagent(ORE, 1)] },
  [ROD]: { count: 1, reagents: [reagent(BAR, 1), reagent(STONE, 2)] },
};

describe("derivePrices", () => {
  it("prices a greater essence as 3 lesser, and a lesser as a third of a greater", () => {
    const greater = derivePrices({ [LESSER_ASTRAL]: 200 }, {}, [GREATER_ASTRAL]);
    expect(greater.get(GREATER_ASTRAL)).toEqual({ copper: 600, from: "essence", partner: LESSER_ASTRAL });
    const lesser = derivePrices({ [GREATER_ASTRAL]: 900 }, {}, [LESSER_ASTRAL]);
    expect(lesser.get(LESSER_ASTRAL)).toEqual({ copper: 300, from: "essence", partner: GREATER_ASTRAL });
  });

  it("prices a craftable item from its reagents, down through reagents that are made too", () => {
    const out = derivePrices({ [ORE]: 50, [STONE]: 10 }, MAKERS, [ROD]);
    expect(out.get(ROD)).toEqual({ copper: 70, from: "materials" });
  });

  it("divides by how many one craft makes", () => {
    const out = derivePrices({ [ORE]: 100 }, { [BAR]: { count: 3, reagents: [reagent(ORE, 2)] } }, [BAR]);
    expect(out.get(BAR)?.copper).toBe(67);
  });

  it("gives no price when any reagent has none", () => {
    expect(derivePrices({ [ORE]: 50 }, MAKERS, [ROD]).has(ROD)).toBe(false);
  });

  it("gives no price for an item with no recipe and no essence partner", () => {
    expect(derivePrices({ [ORE]: 50 }, MAKERS, [STONE]).size).toBe(0);
  });

  it("ends a cycle as no price instead of looping", () => {
    const loop: Makers = {
      [BAR]: { count: 1, reagents: [reagent(ROD, 1)] },
      [ROD]: { count: 1, reagents: [reagent(BAR, 1)] },
    };
    expect(derivePrices({}, loop, [BAR, ROD]).size).toBe(0);
    // Neither half of an essence pair prices the other from nothing.
    expect(derivePrices({}, {}, [LESSER_ASTRAL, GREATER_ASTRAL]).size).toBe(0);
  });

  it("never works an item out from its own price", () => {
    // You typed a Greater Astral price; its worked-out price can't be 3 × (yours / 3).
    expect(derivePrices({ [GREATER_ASTRAL]: 900 }, {}, [GREATER_ASTRAL]).has(GREATER_ASTRAL)).toBe(false);
  });

  it("prices Golden Rod from the Forever recipe Blacksmithing makes it with", () => {
    const file = enchantingJson as unknown as CraftingFile;
    const known = { 3577: 1000, 3478: 30 }; // Gold Bar, Coarse Grinding Stone
    expect(derivePrices(known, file.makers ?? {}, [11128]).get(11128)).toEqual({ copper: 1060, from: "materials" });
  });
});

describe("autoPrice", () => {
  it("lets a real auction price win over a derived one", () => {
    expect(autoPrice(500, { copper: 70, from: "materials" })).toEqual({ copper: 500, from: "auction" });
    expect(autoPrice(undefined, { copper: 70, from: "materials" })).toEqual({ copper: 70, from: "materials" });
    expect(autoPrice(undefined, undefined)).toBeUndefined();
  });
});

describe("withDerived", () => {
  it("fills only the gaps: a known price is never replaced", () => {
    const derived = new Map([
      [ROD, { copper: 70, from: "materials" as const }],
      [BAR, { copper: 1, from: "materials" as const }],
    ]);
    expect(withDerived({ [BAR]: 50 }, derived)).toEqual({ [BAR]: 50, [ROD]: 70 });
  });
});
