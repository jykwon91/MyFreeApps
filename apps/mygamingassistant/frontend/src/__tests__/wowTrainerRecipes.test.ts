import { describe, expect, it } from "vitest";
import { recipeOnlyFrom } from "@/games/wow-forever/lib/trainers/recipeOnlyFrom";
import { rankRecipes } from "@/games/wow-forever/lib/trainers/rankRecipes";
import { trainerNpcRecipes } from "@/games/wow-forever/lib/trainers/trainerRecipes";
import type { RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import type { ProfessionRankStep } from "@/games/wow-forever/types/trainers/professionRankStep";
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

function step(name: string, skill: string): ProfessionRankStep {
  return { name, skill, level: null, cap: null, craftingRank: null, milestone: null };
}

const STEPS = [step("Apprentice", "1"), step("Journeyman", "50"), step("Expert", "125"), step("Artisan", "200")];

describe("rankRecipes", () => {
  const npcs = {
    "1": [
      [101, 210, 900],
      [102, 50, 100],
      [103, 1, 10],
    ] as const,
    "2": [
      [102, 50, 100],
      [104, 124, 300],
      [105, 49, 90],
      [999, 60, 1],
    ] as const,
  };
  const lookup = makeLookup([
    { ...makeEntry(101, "Mooncloth Robe"), key: "tailoring:101", spec: "Mooncloth" },
    { ...makeEntry(102, "B Shirt"), key: "tailoring:102" },
    { ...makeEntry(103, "Linen Bolt"), key: "tailoring:103" },
    { ...makeEntry(104, "Gloves"), key: "tailoring:104" },
    { ...makeEntry(105, "A Vest"), key: "tailoring:105" },
  ]);
  const byRank = rankRecipes("tailoring", STEPS, npcs, lookup);
  const names = (rank: string) => (byRank.get(rank) ?? []).map((r) => r.name);

  it("puts each recipe in the highest rank whose skill it has reached; edges stay below", () => {
    expect(names("Apprentice")).toEqual(["Linen Bolt", "A Vest"]); // 1, 49
    expect(names("Journeyman")).toEqual(["B Shirt", "Gloves"]); // 50, 124
    expect(names("Expert")).toEqual([]);
    expect(names("Artisan")).toEqual(["Mooncloth Robe"]); // 210
  });

  it("lists a spell two trainers teach once, and skips spells the recipe book lacks", () => {
    const all = [...byRank.values()].flat().map((r) => r.spell);
    expect(all.filter((s) => s === 102)).toHaveLength(1);
    expect(all).not.toContain(999);
  });

  it("carries cost and the specialization", () => {
    const robe = byRank.get("Artisan")?.[0];
    expect(robe?.cost).toBe(900);
    expect(robe?.spec).toBe("Mooncloth");
    expect(byRank.get("Journeyman")?.[0].spec).toBeNull();
  });
});

describe("recipeOnlyFrom", () => {
  const npc = (npcId: number, name: string): RankTrainer => ({ npcId, name, where: "Stormwind City", x: 40, y: 84, zoneId: 1453, city: true });
  const trainers = [npc(1, "Georgio"), npc(2, "Lucan"), npc(3, "Jalane")];
  const spells = { "1": [[10, 1, 0]] as const, "2": [[10, 1, 0]] as const, "3": [[10, 1, 0], [20, 190, 0]] as const, "4": [[30, 1, 0]] as const };

  it("names the trainers when at most `max` of yours teach it", () => {
    expect(recipeOnlyFrom(20, spells, trainers, 2)?.map((t) => t.name)).toEqual(["Jalane"]);
  });
  it("is null when more than `max` of yours teach it", () => {
    expect(recipeOnlyFrom(10, spells, trainers, 2)).toBeNull();
  });
  it("is empty when only the other faction's trainers teach it", () => {
    expect(recipeOnlyFrom(30, spells, trainers, 2)).toEqual([]);
  });
});
