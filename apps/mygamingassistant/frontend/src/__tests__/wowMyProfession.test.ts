import { describe, expect, it } from "vitest";
import { markTrainerRecipes, recipeMarks } from "@/games/wow-forever/lib/trainers/markTrainerRecipes";
import { panelSummary, rankMarkedSuffix } from "@/games/wow-forever/lib/trainers/markedSummary";
import { myProfession } from "@/games/wow-forever/lib/trainers/myProfession";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";
import type { MyProfession } from "@/games/wow-forever/types/trainers/myProfession";
import type { TrainerRecipeRow } from "@/games/wow-forever/types/trainers/trainerRecipeRow";

const row = (spell: number, skill: number, spec: string | null = null): TrainerRecipeRow => ({
  spell, name: `Recipe ${spell}`, skill, cost: 0, spec, status: "needs-data",
});

const MINE: MyProfession = { characterName: "Jason Kwon", skill: 100, maxSkill: 150, knownSpells: new Set([1, 4]) };

describe("markTrainerRecipes", () => {
  const rows = [row(1, 50), row(2, 50), row(3, 115), row(4, 120), row(5, 90, "Mooncloth")];

  it("Known first (even above your skill), then Can learn / Needs by skill; spec recipes you don't know stay unmarked", () => {
    expect(markTrainerRecipes(rows, { mine: MINE, knownOnly: false }).map((r) => r.status)).toEqual([
      "known", "can-learn", "needs-skill", "known", "needs-data",
    ]);
  });

  it("keeps a typed skill's status for rows it can't speak for (other faction, unknown spec)", () => {
    const typed = [{ ...row(2, 50), status: "can-learn" as const }, { ...row(5, 90, "Mooncloth"), status: "needs-skill" as const }];
    expect(markTrainerRecipes(typed, { mine: MINE, knownOnly: true }).map((r) => r.status)).toEqual(["can-learn", "needs-skill"]);
  });

  it("the other faction's character marks only Known", () => {
    expect(markTrainerRecipes(rows, { mine: MINE, knownOnly: true }).map((r) => r.status)).toEqual([
      "known", "needs-data", "needs-data", "known", "needs-data",
    ]);
  });

  it("no character leaves the rows as they are", () => {
    expect(markTrainerRecipes(rows, null)).toBe(rows);
  });
});

const marked = (...statuses: TrainerRecipeRow["status"][]) => statuses.map((status, i) => ({ ...row(i, 50), status }));

describe("rankMarkedSuffix", () => {
  it("counts what you can learn, says all known, and says nothing for an empty rank or no character", () => {
    expect(rankMarkedSuffix(marked("known", "can-learn", "can-learn", "needs-skill"), true)).toBe(" · 2 you can learn");
    expect(rankMarkedSuffix(marked("known", "known"), true)).toBe(" · all known");
    expect(rankMarkedSuffix(marked("known", "needs-skill"), true)).toBe("");
    expect(rankMarkedSuffix([], true)).toBe("");
    expect(rankMarkedSuffix(marked("can-learn"), false)).toBe("");
  });
});

describe("panelSummary", () => {
  it("counts only recipes you don't know yet", () => {
    expect(panelSummary(marked("known", "known", "can-learn", "can-learn"), 100)).toBe("All 2 learnable now");
    expect(panelSummary(marked("known", "can-learn", "needs-skill", "needs-data"), 100)).toBe("1 of 2 learnable now");
    expect(panelSummary(marked("needs-skill"), 10)).toBe("None learnable yet");
    expect(panelSummary(marked("known", "known"), 100)).toBe("You know all of these");
    expect(panelSummary(marked("can-learn"), null)).toBeNull();
  });
});

describe("recipeMarks", () => {
  it("only a ready state marks; another faction marks Known only", () => {
    expect(recipeMarks({ kind: "none" })).toBeNull();
    expect(recipeMarks({ kind: "not-learned", characterName: "Jason Kwon" })).toBeNull();
    expect(recipeMarks({ kind: "ready", mine: MINE, lastLogin: null, otherFaction: null })).toEqual({ mine: MINE, knownOnly: false });
    expect(recipeMarks({ kind: "ready", mine: MINE, lastLogin: null, otherFaction: "Horde" })?.knownOnly).toBe(true);
  });
});

describe("myProfession", () => {
  const character = (primaries: unknown[] | null) =>
    ({ name: "Jason", surname: "Kwon", professions: primaries ? { primaries, secondaries: [] } : null }) as unknown as CharacterResponse;

  it("reads the profession's skill and maps Blizzard recipe ids to recipe spells", () => {
    // 4002 → Woolen Bag (3757); 999999 isn't a known recipe id and is dropped.
    const mine = myProfession(character([
      { id: 197, name: "Tailoring", skill: 204, max_skill: 225, recipes: [{ id: 4002, name: "Woolen Bag" }, { id: 999999, name: "?" }] },
    ]), "tailoring");
    expect(mine).toEqual({ characterName: "Jason Kwon", skill: 204, maxSkill: 225, knownSpells: new Set([3757]) });
  });

  it("null when they haven't learned it, or Blizzard didn't send professions", () => {
    expect(myProfession(character([{ id: 197, name: "Tailoring", skill: 1, max_skill: 75, recipes: [] }]), "alchemy")).toBeNull();
    expect(myProfession(character(null), "tailoring")).toBeNull();
  });
});
