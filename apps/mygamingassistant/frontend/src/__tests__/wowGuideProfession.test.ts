import { describe, expect, it } from "vitest";
import { CRAFTING_FEATURES } from "@/games/wow-forever/data/professions/crafting/craftingFeatures";
import { CRAFTING_GROUP, SECONDARY_GROUP } from "@/games/wow-forever/data/professions/professionPicker";
import { isCraftingProfession, parseGuideProfession } from "@/games/wow-forever/lib/guideProfession";
import { CRAFTING_PROFESSION } from "@/games/wow-forever/types/crafting";

describe("profession picker", () => {
  it("keeps every old ?p= link working and sends anything else to Cooking", () => {
    for (const p of ["cooking", "fishing", "tailoring", "enchanting", "alchemy", "blacksmithing", "leatherworking", "engineering", "firstaid"]) expect(parseGuideProfession(p)).toBe(p);
    for (const bad of [null, "", "jewelcrafting", "Tailoring", "first aid"]) expect(parseGuideProfession(bad)).toBe("cooking");
  });

  it("lists every crafting guide once, alphabetically within its group", () => {
    for (const group of [CRAFTING_GROUP, SECONDARY_GROUP]) {
      const labels = group.options.map((o) => o.label);
      expect(labels).toEqual([...labels].sort());
    }
    const guides = [...CRAFTING_GROUP.options, ...SECONDARY_GROUP.options].map((o) => o.id).filter(isCraftingProfession);
    expect(guides.sort()).toEqual(Object.values(CRAFTING_PROFESSION).sort());
  });

  it("puts First Aid under Secondary but gives it a crafting guide", () => {
    expect(SECONDARY_GROUP.options.map((o) => o.id)).toContain(CRAFTING_PROFESSION.firstaid);
    expect(CRAFTING_GROUP.options.map((o) => o.id)).not.toContain(CRAFTING_PROFESSION.firstaid);
    for (const o of CRAFTING_GROUP.options) expect(isCraftingProfession(o.id)).toBe(true);
    expect(SECONDARY_GROUP.options.filter((o) => isCraftingProfession(o.id)).map((o) => o.id)).toEqual([CRAFTING_PROFESSION.firstaid]);
  });

  it("only Tailoring and Enchanting take typed prices", () => {
    const priced = Object.entries(CRAFTING_FEATURES).filter(([, f]) => f.priced).map(([p]) => p);
    expect(priced.sort()).toEqual(["enchanting", "tailoring"]);
  });
});
