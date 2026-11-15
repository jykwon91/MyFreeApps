import { describe, expect, it } from "vitest";
import { trainerNpcRecipes } from "@/games/wow-forever/lib/trainers/trainerRecipes";
import type { TrainerNpcSpells } from "@/games/wow-forever/types/trainers/trainerNpcSpells";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";
import type { RecipeEntryLookup } from "@/games/wow-forever/types/recipes/recipeEntryLookup";

// Minimal stub with the data the function uses.
const SPELL_1 = 7420; // Enchant Bracer - Minor Health
const SPELL_2 = 7748; // Enchant Bracer - Minor Deflection

const STUB_SPELLS: TrainerNpcSpells = {
  source: "cmangos/classic-db@test",
  tailoring: {},
  enchanting: {
    "1317": [
      [SPELL_1, 15, 50],
      [SPELL_2, 60, 250],
    ],
  },
  alchemy: {},
  blacksmithing: {},
  leatherworking: {},
  engineering: {},
  firstaid: {},
};

function makeEntry(spell: number, name: string): RecipeEntry {
  return {
    key: `enchanting:${spell}`,
    profession: "enchanting",
    name,
    icon: null,
    makes: null,
    category: "enchants",
    skill: 0,
    yellow: null,
    green: null,
    grey: null,
    reagents: [],
    learn: { kind: "start" },
    recipeSources: null,
    sourceUnknown: false,
    effect: null,
    spec: null,
    searchName: name.toLowerCase(),
    nameWords: [name.toLowerCase()],
    recipeItemWords: [],
    reagentWords: [],
  };
}

function makeLookup(entries: RecipeEntry[]): RecipeEntryLookup {
  return new Map(entries.map((e) => [e.key, e]));
}

describe("trainerNpcRecipes", () => {
  it("returns empty array when NPC has no data", () => {
    const rows = trainerNpcRecipes(9999, "enchanting", STUB_SPELLS, null, null);
    expect(rows).toHaveLength(0);
  });

  it("returns empty array for a gathering profession (no data for it)", () => {
    const spells: TrainerNpcSpells = { ...STUB_SPELLS, enchanting: {} };
    const rows = trainerNpcRecipes(1317, "enchanting", spells, null, null);
    expect(rows).toHaveLength(0);
  });

  it("returns all spells when lookup is null (pre-load)", () => {
    const rows = trainerNpcRecipes(1317, "enchanting", STUB_SPELLS, null, null);
    // With null lookup, all spells from the data file are included.
    expect(rows).toHaveLength(2);
    expect(rows[0].spell).toBe(SPELL_1);
    expect(rows[1].spell).toBe(SPELL_2);
  });

  it("filters to only spells present in the recipe book when lookup is loaded", () => {
    const lookup = makeLookup([makeEntry(SPELL_1, "Enchant Bracer - Minor Health")]);
    const rows = trainerNpcRecipes(1317, "enchanting", STUB_SPELLS, lookup, null);
    // SPELL_2 not in the recipe book → skipped.
    expect(rows).toHaveLength(1);
    expect(rows[0].spell).toBe(SPELL_1);
    expect(rows[0].name).toBe("Enchant Bracer - Minor Health");
  });

  it("sets status to needs-data when player skill is null", () => {
    const rows = trainerNpcRecipes(1317, "enchanting", STUB_SPELLS, null, null);
    for (const row of rows) {
      expect(row.status).toBe("needs-data");
    }
  });

  it("marks can-learn when player skill meets the recipe skill", () => {
    const rows = trainerNpcRecipes(1317, "enchanting", STUB_SPELLS, null, 15);
    expect(rows[0].status).toBe("can-learn"); // skill 15 == required 15
    expect(rows[1].status).toBe("needs-skill"); // skill 15 < required 60
  });

  it("marks all as can-learn when player skill exceeds everything", () => {
    const rows = trainerNpcRecipes(1317, "enchanting", STUB_SPELLS, null, 300);
    for (const row of rows) {
      expect(row.status).toBe("can-learn");
    }
  });

  it("includes cost in copper from the data file", () => {
    const rows = trainerNpcRecipes(1317, "enchanting", STUB_SPELLS, null, null);
    expect(rows[0].cost).toBe(50);
    expect(rows[1].cost).toBe(250);
  });

  it("preserves the skill value from the data file", () => {
    const rows = trainerNpcRecipes(1317, "enchanting", STUB_SPELLS, null, null);
    expect(rows[0].skill).toBe(15);
    expect(rows[1].skill).toBe(60);
  });
});
