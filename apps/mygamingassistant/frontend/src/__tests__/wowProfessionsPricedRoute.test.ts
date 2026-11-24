import { describe, expect, it } from "vitest";
import { PROFESSIONS_ADDON_FILES } from "@/games/wow-forever/data/professionsAddon/professionsAddonFiles";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_PROFESSION_STUBS } from "@/test/addonLua/wowProfessionStubs.lua";

const files = PROFESSIONS_ADDON_FILES;
const plain = (lines: string[]): string[] => lines.map((l) => l.replace(/\|c[0-9a-f]{8}|\|r/g, ""));

function run(scenario: string): string[] {
  return plain(
    runAddonLua(
      [
        ["MGAHub.lua", files["MGAHub.lua"]],
        ["Data.lua", files["Data.lua"]],
        ["Core.lua", files["Core.lua"]],
        ["Window.lua", files["Window.lua"]],
        ["MGAProfessions.lua", files["MGAProfessions.lua"]],
        ["scenario", scenario],
      ],
      WOW_PROFESSION_STUBS,
    ),
  );
}

const ROUTE = `{
  { from = 1, to = 40, name = "Bolt of Linen Cloth", spell = 2963, yellow = 20, grey = 40, learn = "Trainer", mats = { { id = 2589, name = "Linen Cloth", count = 2 } } },
  { from = 40, to = 75, name = "Linen Bag", spell = 3915, yellow = 45, grey = 65, learn = "Trainer", mats = { { id = 2589, name = "Linen Cloth", count = 3 } } },
}`;

function scenario(houseExtra: string): string {
  return `
    time = function() return 1000000 + 2 * 3600 end
    known = { { line = 197, skill = 1, max = 75 } }
    MGAPricesData = { updated = 1000000, houses = { alliance = { updated = 1000000, items = { [2589] = {10} }${houseExtra} } } }
    lines("tailoring", "route")
  `;
}

describe("MGA Professions priced route", () => {
  it("shows the route picked at today's prices, with when they were updated", () => {
    const out = run(scenario(`, routes = { tailoring = ${ROUTE} }`));
    expect(out).toContain("Route picked from today's auction prices, updated 2 hours ago.");
    expect(out.some((l) => l.startsWith("Craft") && l.includes("Bolt of Linen Cloth (skill 1-40)"))).toBe(true);
    expect(out.some((l) => l.includes("Mats cost about"))).toBe(true);
  });

  it("falls back to the built-in route without route data for the profession", () => {
    const out = run(scenario(""));
    expect(out.some((l) => l.includes("auction prices"))).toBe(false);
    expect(out.some((l) => l.startsWith("Craft"))).toBe(true);
  });

  it("falls back to the built-in route when MGA Prices is not installed", () => {
    const out = run(`known = { { line = 197, skill = 1, max = 75 } }; lines("tailoring", "route")`);
    expect(out.some((l) => l.includes("auction prices"))).toBe(false);
  });
});
