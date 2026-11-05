import { describe, expect, it } from "vitest";
import { CRAFTING_FEATURES } from "@/games/wow-forever/data/professions/crafting/craftingFeatures";
import { CRAFTING_GROUP, SECONDARY_GROUP } from "@/games/wow-forever/data/professions/professionPicker";
import { isCraftingProfession, parseGuideProfession } from "@/games/wow-forever/lib/guideProfession";
import { CRAFTING_PROFESSION } from "@/games/wow-forever/types/crafting";

describe("profession picker", () => {
  it("keeps every old ?p= link working and sends anything else to Cooking", () => {
    for (const p of ["cooking", "fishing", "tailoring", "enchanting", "alchemy", "blacksmithing", "leatherworking", "engineering"]) expect(parseGuideProfession(p)).toBe(p);
    for (const bad of [null, "", "jewelcrafting", "Tailoring"]) expect(parseGuideProfession(bad)).toBe("cooking");
  });

  it("lists every crafting profession once, alphabetically, and nothing else as crafting", () => {
    const labels = CRAFTING_GROUP.options.map((o) => o.label);
    expect(labels).toEqual([...labels].sort());
    expect(CRAFTING_GROUP.options.map((o) => o.id).sort()).toEqual(Object.values(CRAFTING_PROFESSION).sort());
    for (const o of SECONDARY_GROUP.options) expect(isCraftingProfession(o.id)).toBe(false);
  });

  it("only Tailoring and Enchanting take typed prices", () => {
    const priced = Object.entries(CRAFTING_FEATURES).filter(([, f]) => f.priced).map(([p]) => p);
    expect(priced.sort()).toEqual(["enchanting", "tailoring"]);
  });
});
