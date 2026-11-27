import { describe, expect, it } from "vitest";
import dropsCore from "../../addon/MGADrops/Core.lua?raw";
import dropsData from "../../addon/MGADrops/Data.lua?raw";
import dropsMain from "../../addon/MGADrops/MGADrops.lua?raw";
import dropsToc from "../../addon/MGADrops/MGADrops.toc?raw";
import dropsWindow from "../../addon/MGADrops/Window.lua?raw";
import hubLua from "../../addon/MGAHub/MGAHub.lua?raw";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_DROPS_STUBS } from "@/test/addonLua/wowDropsStubs.lua";

const HOGGER = 448;
const KOBOLD_VERMIN = 6;
const STORMWIND_GUARD = 68;
const FOREVER_ONLY = 999999;

const FILES: Record<string, string> = {
  "Data.lua": dropsData,
  "Core.lua": dropsCore,
  "Window.lua": dropsWindow,
  "MGADrops.lua": dropsMain,
};

/** The toc's file list, in load order. */
function tocFiles(): string[] {
  return dropsToc
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
}

/** Loads MGA Hub (its dependency), then MGA Drops in toc order on the stubs, then runs `scenario`; returns what was recorded. */
function run(scenario: string, before = ""): string[] {
  const chunks: [string, string][] = tocFiles().map((name) => [name, FILES[name]]);
  return runAddonLua([["before", before], ["MGAHub/MGAHub.lua", hubLua], ...chunks, ["scenario", scenario]], WOW_DROPS_STUBS);
}

/** Hovers a unit and returns the tooltip lines without colour codes or icons. */
function hover(unit: string, setup = "", before = ""): string[] {
  return run(`${setup}\nclear()\nhoverUnit("${unit}")\nfor i, l in ipairs(out) do out[i] = plain(l) end`, before);
}

const MOB = (npc: number, extra = "") => `units.mouseover = { guid = creature(${npc}), attackable = true${extra} }`;

describe("MGA Drops toc", () => {
  it("targets Forever's interface, loads after MGA Hub, saves its settings and loads the data before the code", () => {
    expect(dropsToc).toMatch(/^## Interface: 16001$/m);
    expect(dropsToc).toMatch(/^## Dependencies: MGAHub$/m);
    expect(dropsToc).toMatch(/^## SavedVariables: MGADropsSettings$/m);
    expect(tocFiles()).toEqual(["Data.lua", "Core.lua", "Window.lua", "MGADrops.lua"]);
  });

  it("ships no Bindings.xml: the MGA key bindings load once, from MGAHub", () => {
    const folder = import.meta.glob("../../addon/MGADrops/*", { query: "?raw", import: "default" });
    expect(Object.keys(folder).some((path) => path.endsWith("Bindings.xml"))).toBe(false);
    expect(dropsToc).not.toMatch(/Bindings/);
  });

  it("never reads the combat log", () => {
    for (const code of [dropsCore, dropsMain, dropsWindow]) {
      expect(code).not.toMatch(/COMBAT_LOG|CombatLogGetCurrentEventInfo/);
    }
  });

  it("labels the data as Classic's in the generated file", () => {
    expect(dropsData).toMatch(/cmangos classic-db/);
    expect(dropsData).toMatch(/WoW Forever may differ/);
  });
});

describe("the creature tooltip", () => {
  it("lists Hogger's likeliest drops with Classic's chances, then how many more and the world drops", () => {
    const lines = hover("mouseover", MOB(HOGGER));
    expect(lines).toEqual([
      "Drops Classic drop rates (Forever may differ)",
      "  Huge Gnoll Claw | 100% quest",
      "  Linen Cloth | 23.3%",
      "  Tough Jerky | 6.1%",
      "  Refreshing Spring Water | 3.5%",
      "  Tigerseye | 3%",
      "  Gold Pickup Schedule | 2%",
      "  +3 more: hold Shift",
      "  Random world drops | 14.3%",
    ]);
  });

  it("lists every drop while Shift is held", () => {
    const lines = hover("mouseover", `${MOB(HOGGER)}\nshift = true`);
    expect(lines).toContain("  Shadowgem | 0.74%");
    expect(lines).toContain("  Malachite | 0.64%");
    expect(lines.some((line) => line.includes("hold Shift"))).toBe(false);
  });

  it("leaves out an Alliance-only drop for a Horde player", () => {
    const lines = hover("mouseover", `${MOB(HOGGER)}\nfaction = "Horde"`);
    expect(lines.some((line) => line.includes("Gold Pickup Schedule"))).toBe(false);
    expect(lines).toContain("  Minor Healing Potion | 1.8%");
  });

  it("adds the lines once, though both tooltip hooks fire", () => {
    const lines = hover("mouseover", MOB(KOBOLD_VERMIN));
    expect(lines.filter((line) => line.startsWith("Drops")).length).toBe(1);
  });

  it("reads the GUID from the unit when the post-call doesn't pass one", () => {
    const lines = hover("mouseover", `${MOB(KOBOLD_VERMIN)}\npostCallGuid = false`);
    expect(lines[0]).toBe("Drops Classic drop rates (Forever may differ)");
  });

  it("works on a client with only OnTooltipSetUnit", () => {
    const lines = hover("mouseover", MOB(KOBOLD_VERMIN), "TooltipDataProcessor = nil");
    expect(lines[0]).toBe("Drops Classic drop rates (Forever may differ)");
  });

  it("says 'no drop data' for a creature Classic doesn't have", () => {
    expect(hover("mouseover", MOB(FOREVER_ONLY))).toEqual(["Drops: no drop data"]);
  });

  it("stays quiet on critters without data, players, creatures you can't attack and hidden GUIDs", () => {
    expect(hover("mouseover", MOB(FOREVER_ONLY, ', creatureType = "Critter"'))).toEqual([]);
    expect(hover("mouseover", `${MOB(KOBOLD_VERMIN, ", player = true")}`)).toEqual([]);
    expect(hover("mouseover", `units.mouseover = { guid = creature(${STORMWIND_GUARD}), attackable = false }`)).toEqual([]);
    expect(hover("mouseover", `${MOB(KOBOLD_VERMIN)}\nsecret[creature(${KOBOLD_VERMIN})] = true`)).toEqual([]);
    expect(hover("mouseover", `units.mouseover = { guid = "Player-1-0ABC", attackable = true }`)).toEqual([]);
  });

  it("adds nothing when the tooltip setting is off", () => {
    expect(hover("mouseover", `${MOB(HOGGER)}\nMGADrops.Settings().tooltip = false`)).toEqual([]);
  });

  it("redraws with the full list when Shift is pressed over the tooltip", () => {
    const lines = run(`${MOB(HOGGER)}
hoverUnit("mouseover")
clear()
shift = true
fire("MODIFIER_STATE_CHANGED", "LSHIFT", 1)
for i, l in ipairs(out) do out[i] = plain(l) end`);
    expect(lines).toContain("  Malachite | 0.64%");
  });

  it("shows item icons from the client and touches no other Blizzard frame", () => {
    const lines = run(`${MOB(KOBOLD_VERMIN)}
hoverUnit("mouseover")
table.insert(out, "touched " .. #touched)`);
    expect(lines.some((line) => line.includes("|T1755:14:14|t"))).toBe(true);
    expect(lines.slice(-1)[0]).toBe("touched 0");
  });
});

describe("the lookup window", () => {
  const rows = `function rows()
  for i = 1, 20 do
    local row = _G["MGADropsRow" .. i]
    if row.shownFlag then table.insert(out, plain(row.text.text) .. " | " .. plain(row.chance.text)) end
  end
end`;

  it("opens straight on the drops when the name matches one creature", () => {
    const lines = run(`${rows}
clear()
SlashCmdList.MGADROPS("hogger")
table.insert(out, plain(MGADropsWindow.shownFlag and "shown" or "hidden"))
rows()`);
    expect(lines[0]).toBe("shown");
    expect(lines).toContain("Huge Gnoll Claw | 100% quest");
    expect(lines).toContain("Random world drops | 14.3%");
  });

  it("lists every match for a partial name, then a match's drops when it's clicked", () => {
    const lines = run(`${rows}
SlashCmdList.MGADROPS("kobold")
clear()
rows()
table.insert(out, "--")
local first = MGADropsRow1
first.scripts.OnClick(first)
table.insert(out, plain(MGADropsBack.shownFlag and "back" or "no back"))
rows()`);
    const gap = lines.indexOf("--");
    expect(gap).toBeGreaterThan(1);
    expect(lines.slice(0, gap).every((line) => /Kobold/.test(line))).toBe(true);
    expect(lines[gap + 1]).toBe("back");
    expect(lines.length).toBeGreaterThan(gap + 2);
  });

  it("says when no creature by that name has drop data", () => {
    const lines = run(`${rows}
SlashCmdList.MGADROPS("zzzz no such mob")
clear()
rows()`);
    expect(lines).toEqual(["No creature by that name has drop data. | "]);
  });

  it("opens on your target's drops from the slash command with no name, and the search when your target has none", () => {
    const target = run(`${rows}
units.target = { guid = creature(${KOBOLD_VERMIN}), attackable = true }
SlashCmdList.MGADROPS("")
clear()
rows()`);
    expect(target.slice(0, 2)).toEqual(["Melted Candle | 29.8%", "Shiny Red Apple | 13.5%"]);
    expect(target).toContain("Random world drops | 9.6%");
    const none = run(`units.target = { guid = creature(${FOREVER_ONLY}), attackable = true }
SlashCmdList.MGADROPS("")`);
    expect(none.some((line) => line.includes("your target has no drop data"))).toBe(true);
  });

  it("adds a Mob drops entry to the MGA menu", () => {
    const lines = run(`fire("PLAYER_LOGIN")
MGAHub.OpenMenu()
for _, l in ipairs(menuLines()) do table.insert(out, l) end
clickRow("Mob drops")
table.insert(out, MGADropsWindow.shownFlag and "window shown" or "window hidden")`);
    expect(lines).toContain("[Drops]");
    expect(lines).toContain("Mob drops");
    expect(lines.slice(-1)[0]).toBe("window shown");
  });
});
