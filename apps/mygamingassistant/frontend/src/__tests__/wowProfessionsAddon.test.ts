import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import sharedBindings from "../../addon/shared/Bindings.xml?raw";
import sharedHub from "../../addon/shared/MGAHub.lua?raw";
import { PROFESSIONS_ADDON_FILES } from "@/games/wow-forever/data/professionsAddon/professionsAddonFiles";
import { buildProfessionsAddonData } from "@/games/wow-forever/lib/professionsAddon/buildProfessionsAddonData";
import { luaValue } from "@/games/wow-forever/lib/addons/luaValue";
import { npcPlace } from "@/games/wow-forever/lib/professionsAddon/npcPlace";
import { parseSkillSpan } from "@/games/wow-forever/lib/professionsAddon/parseSkillSpan";
import { professionsAddonDataLua } from "@/games/wow-forever/lib/professionsAddon/professionsAddonDataLua";
import { professionsAddonZip } from "@/games/wow-forever/lib/professionsAddon/professionsAddonZip";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_PROFESSION_STUBS } from "@/test/addonLua/wowProfessionStubs.lua";

const files = PROFESSIONS_ADDON_FILES;
const plain = (lines: string[]): string[] => lines.map((l) => l.replace(/\|c[0-9a-f]{8}|\|r/g, ""));

/** Loads the addon the way its .toc does, then runs `scenario`; returns what the stubs recorded. */
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

/** Wrapped lines read as one run of text. */
const flat = (lines: string[]): string => lines.join(" ").replace(/\s+/g, " ");

/** Crafts for one row the way the site counts: one per orange point, then 1 / chance as it fades to grey. */
function craftsFor(from: number, to: number, yellow: number, grey: number, skill = from): number {
  let sum = 0;
  for (let s = Math.max(skill, from); s < to; s += 1) sum += s < yellow ? 1 : 1 / ((grey - s) / (grey - yellow));
  return Math.ceil(sum - 1e-9);
}

describe("MGA Professions data", () => {
  it("builds every profession the Professions page has and matches Data.lua", async () => {
    const professions = await buildProfessionsAddonData();
    expect(professions.map((p) => p.key)).toEqual([
      "alchemy", "blacksmithing", "enchanting", "engineering", "leatherworking", "tailoring",
      "herbalism", "mining", "skinning", "cooking", "firstaid", "fishing",
    ]);
    for (const p of professions) {
      expect(p.steps.length, p.key).toBeGreaterThan(0);
      expect(p.ranks.length, p.key).toBeGreaterThan(1);
    }
    expect(professions.find((p) => p.key === "herbalism")?.nodes.length).toBeGreaterThan(5);
    expect(professions.find((p) => p.key === "mining")?.nodes.length).toBeGreaterThan(3);
    expect(professions.find((p) => p.key === "skinning")?.mobs.length).toBeGreaterThan(20);
    await expect(professionsAddonDataLua(professions)).toMatchFileSnapshot("../../addon/MGAProfessions/Data.lua");
  }, 60_000);

  it("writes plain data as Lua and leaves out null fields", () => {
    expect(luaValue({ a: 1, "b-c": "x\"y", skip: null, list: [1, 2] }, 5)).toBe('{a = 1, ["b-c"] = "x\\"y", list = {1, 2}}');
    expect(() => luaValue(Number.NaN)).toThrow();
  });

  it("reads a skill span", () => {
    expect(parseSkillSpan("1–10")).toEqual({ from: 1, to: 10 });
    expect(parseSkillSpan("75")).toEqual({ from: 75, to: 75 });
    expect(() => parseSkillSpan("lots")).toThrow();
  });

  it("refuses an NPC the World Map data doesn't know", () => {
    expect(() => npcPlace({ name: "Nobody", npcId: -1, where: "Nowhere", x: 1, y: 1 })).toThrow();
  });
});

describe("MGA Professions route from your skill", () => {
  it("plans the first row from skill 1 and counts crafts the way the site does", () => {
    const out = run(`known = { { line = 171, skill = 1, max = 75 } }; lines("alchemy", "route")`);
    const crafts = craftsFor(1, 60, 55, 95);
    expect(out).toContain(`Craft ${crafts} x Elixir of Minor Defense (skill 1-60)`);
    expect(out.some((l) => l.includes("skill 1 (from the game)"))).toBe(true);
  });

  it("falls back to the old skills list, by name, only when GetProfessions is missing", () => {
    const old =
      'GetProfessions = nil; GetProfessionInfo = nil; GetNumSkillLines = function() return 2 end; ' +
      'GetSkillLineInfo = function(i) if i == 1 then return "Professions", 1, 1, 0 end return "Alchemy", nil, nil, 100, 0, 0, 150 end; ';
    const out = run(`${old} lines("alchemy", "route")`);
    expect(out.some((l) => l.includes("skill 100 (from the game)"))).toBe(true);
    // Neither API: nothing read, nothing thrown.
    const none = run(`GetProfessions = nil; GetProfessionInfo = nil; lines("alchemy", "route")`);
    expect(none.some((l) => l.includes("type your skill below"))).toBe(true);
  });

  it("starts at the row your skill is in", () => {
    const out = run(`known = { { line = 171, skill = 100, max = 150 } }; lines("alchemy", "route")`);
    expect(out.some((l) => l.startsWith("Craft") && l.includes("Elixir of Wisdom (skill 100-140)"))).toBe(true);
    expect(out.some((l) => l.includes("Elixir of Minor Defense"))).toBe(false);
  });

  it("uses the skill typed into the window when the game lists none, and says so", () => {
    const out = run(`MGAProfessions.SetSkill("alchemy", 100); lines("alchemy", "route")`);
    expect(out.some((l) => l.includes("skill 100 (typed in)"))).toBe(true);
    const unknown = run(`lines("alchemy", "route")`);
    expect(unknown.some((l) => l.includes("type your skill below"))).toBe(true);
  });

  it("shows only the next rows until the full route is asked for", () => {
    const short = run(`known = { { line = 171, skill = 1, max = 75 } }; lines("alchemy", "route")`);
    const full = run(`known = { { line = 171, skill = 1, max = 75 } }; lines("alchemy", "route", true)`);
    expect(short.some((l) => l.includes("more rows"))).toBe(true);
    expect(full.length).toBeGreaterThan(short.length);
    expect(full.some((l) => l.includes("Draught of Detect Demon"))).toBe(true);
  });

  it("says when you are at the rank cap and who trains the next one", () => {
    const out = run(`known = { { line = 171, skill = 75, max = 75 } }; lines("alchemy", "route"); lines("alchemy", "trainers")`);
    expect(out.some((l) => l.includes("at your rank cap (75)"))).toBe(true);
    expect(out.some((l) => l.startsWith("Journeyman") && l.endsWith("<- next"))).toBe(true);
    expect(out.some((l) => l.includes("Lilyssia Nightbreeze"))).toBe(true);
    expect(out.some((l) => l.includes("Yelmak"))).toBe(false);
  });

  it("lists the other faction's trainers for a Horde player", () => {
    const out = run(`player.faction = "Horde"; lines("alchemy", "trainers")`);
    expect(out.some((l) => l.includes("Yelmak"))).toBe(true);
    expect(out.some((l) => l.includes("Lilyssia Nightbreeze"))).toBe(false);
  });

  it("puts your professions first and opens on one of them", () => {
    const out = run(`
      known = { { line = 164, skill = 30, max = 75 } }
      table.insert(out, MGAProfessions.ProfessionOrder()[1] .. " " .. MGAProfessions.DefaultKey())
    `);
    expect(out).toEqual(["blacksmithing blacksmithing"]);
  });
});

describe("MGA Professions have and need", () => {
  const scenario = (extra: string): string =>
    `known = { { line = 171, skill = 1, max = 75 } }; ${extra}; lines("alchemy", "route")`;

  it("counts what is in your bags against what the row needs", () => {
    const crafts = craftsFor(1, 60, 55, 95);
    const out = run(scenario("bags[765] = 7"));
    expect(out).toContain(`  Silverleaf x ${crafts}  (have 7)`);
  });

  it("adds what the bank held at your last visit, and says it is from then", () => {
    const out = run(scenario(`bankItems[765] = 40; fire("BANKFRAME_OPENED")`));
    expect(out.some((l) => l.includes("Silverleaf") && l.includes("(have 40)"))).toBe(true);
    expect(out.some((l) => l.includes("as of your last bank visit"))).toBe(true);
  });
});

describe("MGA Professions prices", () => {
  const priced = `
    known = { { line = 171, skill = 1, max = 75 } }
    MGAPricesData = { houses = { alliance = { items = { [765] = {100}, [2447] = {50}, [3371] = {10} } } } }
    lines("alchemy", "route")
  `;

  it("costs the mats from MGA Prices' market values", () => {
    const crafts = craftsFor(1, 60, 55, 95);
    const out = run(priced);
    expect(out).toContain(`  Mats cost about ${expectedMoney(crafts * 160)}`);
    expect(out.some((l) => l.includes("Install MGA Prices"))).toBe(false);
  });

  it("uses the Horde house for a Horde player", () => {
    const out = run(`${priced.replace("alliance =", "horde =")}`.replace(`known =`, `player.faction = "Horde"; known =`));
    expect(out.some((l) => l.includes("Mats cost about"))).toBe(true);
  });

  it("asks for MGA Prices when it is not installed", () => {
    const out = run(`known = { { line = 171, skill = 1, max = 75 } }; lines("alchemy", "route")`);
    expect(out).toContain("Install MGA Prices for costs.");
    expect(out.some((l) => l.includes("Mats cost"))).toBe(false);
  });
});

function expectedMoney(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor(copper / 100) % 100;
  const rest = copper % 100;
  const parts = [gold > 0 ? `${gold}g` : "", silver > 0 ? `${silver}s` : "", rest > 0 || copper === 0 ? `${rest}c` : ""];
  return parts.filter(Boolean).join(" ");
}

describe("MGA Professions recipes you know", () => {
  it("marks a recipe learned once the trade-skill window has listed it", () => {
    const out = run(`
      known = { { line = 171, skill = 1, max = 75 } }
      learned[7183] = true
      ProfessionsFrame = CreateFrame("Frame", "ProfessionsFrame", UIParent)
      fire("TRADE_SKILL_SHOW")
      lines("alchemy", "route")
    `);
    expect(flat(out)).toContain("Learn: Known when you train Alchemy. Learned.");
  });

  it("says to open the profession window when it has not seen what you know", () => {
    const out = run(`known = { { line = 171, skill = 1, max = 75 } }; lines("alchemy", "route")`);
    expect(flat(out)).toContain("open your profession window once");
  });
});

describe("MGA Professions where to gather", () => {
  it("ranks herb zones for your side and level, never on enemy ground", () => {
    const out = run(`known = { { line = 182, skill = 1, max = 75 } }; player.level = 8; lines("herbalism", "where")`);
    expect(out.some((l) => l.startsWith("Best now at skill 1:"))).toBe(true);
    expect(out.some((l) => l.includes("Thickest around"))).toBe(true);
    expect(out.some((l) => l.includes("Durotar"))).toBe(false);
  });

  it("keeps skinning to the beasts your skill and level can use", () => {
    const out = run(`known = { { line = 393, skill = 100, max = 150 } }; player.level = 20; lines("skinning", "where")`);
    expect(out[0]).toBe("Beasts level 15-20 at skill 100, your level 20");
  });

  it("has no Where tab for a crafting profession", () => {
    const out = run(`table.insert(out, tostring(MGAProfessions.HasWhere("alchemy")) .. " " .. tostring(MGAProfessions.HasWhere("mining")))`);
    expect(out).toEqual(["false true"]);
  });
});

describe("MGA Professions pins", () => {
  const place = `{ name = "Ainethil", map = 1457, x = 54.9, y = 24, where = "Darnassus" }`;

  it("sets an MGA Waypoints target when it is loaded", () => {
    const out = run(`
      MGAWaypoints = { SetTarget = function(t) table.insert(out, "target: " .. t.name .. " " .. t.map .. " " .. t.x .. " " .. t.zone) end }
      MGAProfessions.Pin(${place})
    `);
    expect(out[0]).toBe("target: Ainethil 1457 54.9 Darnassus");
  });

  it("prints the zone and coordinates when it is not", () => {
    const out = run(`MGAProfessions.Pin(${place})`);
    expect(out[0]).toContain("Ainethil, Darnassus (54.9, 24.0)");
    expect(out[0]).toContain("Install MGA Waypoints");
  });
});

describe("MGA Professions in the game's menus and windows", () => {
  it("adds Professions to the MGA menu and opens on your profession", () => {
    const out = run(`
      known = { { line = 171, skill = 20, max = 75 } }
      MGAHub.OpenMenu()
      for _, l in ipairs(menuLines()) do table.insert(out, "menu: " .. l) end
      clickRow("Professions")
      table.insert(out, "title: " .. MGAProfessionsWindow.title.text)
    `);
    expect(out).toContain("menu: Professions");
    expect(out).toContain("title: MGA Professions: Alchemy");
  });

  it("opens the key binding's action and closes on a second press", () => {
    const out = run(`
      MGAProfessions.Toggle()
      table.insert(out, "open: " .. tostring(MGAProfessionsWindow.shownFlag))
      MGAProfessions.Toggle()
      table.insert(out, "open: " .. tostring(MGAProfessionsWindow.shownFlag))
    `);
    expect(out).toEqual(["open: true", "open: false"]);
  });

  it("attaches an MGA guide button to the trade-skill window that opens that profession", () => {
    const out = run(`
      ProfessionsFrame = CreateFrame("Frame", "ProfessionsFrame", UIParent)
      tradeLine = 186
      fire("TRADE_SKILL_SHOW")
      table.insert(out, "button: " .. MGAProfessionsTradeButton.text .. " on " .. MGAProfessionsTradeButton.parent.name)
      click(MGAProfessionsTradeButton)
      table.insert(out, "title: " .. MGAProfessionsWindow.title.text)
    `);
    expect(out).toEqual(["button: MGA guide on ProfessionsFrame", "title: MGA Professions: Mining"]);
  });

  it("attaches the button when the profession window loads later, and does nothing when there is none", () => {
    const later = run(`
      fire("TRADE_SKILL_SHOW")
      table.insert(out, "before: " .. tostring(MGAProfessionsTradeButton))
      ProfessionsFrame = CreateFrame("Frame", "ProfessionsFrame", UIParent)
      fire("ADDON_LOADED", "Blizzard_Professions")
      table.insert(out, "after: " .. tostring(MGAProfessionsTradeButton ~= nil))
    `);
    expect(later).toEqual(["before: nil", "after: true"]);
  });

  it("opens on the default profession when the client won't say which window it is", () => {
    const out = run(`
      known = { { line = 164, skill = 5, max = 75 } }
      ProfessionsFrame = CreateFrame("Frame", "ProfessionsFrame", UIParent)
      fire("TRADE_SKILL_SHOW")
      click(MGAProfessionsTradeButton)
      table.insert(out, MGAProfessionsWindow.title.text)
    `);
    expect(out).toEqual(["MGA Professions: Blacksmithing"]);
  });
});

describe("MGA Professions files", () => {
  it("loads the hub first and lists every file in the .toc", () => {
    const toc = files["MGAProfessions.toc"];
    const listed = toc.split("\n").filter((l) => l.endsWith(".lua"));
    expect(listed).toEqual(["MGAHub.lua", "Data.lua", "Core.lua", "Window.lua", "MGAProfessions.lua"]);
    expect(toc).toContain("## SavedVariables: MGAHubSettings, MGAProfessionsSettings");
  });

  it("keeps the shared hub's two bindings and adds its own", () => {
    const blocks = sharedBindings.match(/<Binding [\s\S]*?<\/Binding>/g) ?? [];
    expect(blocks).toHaveLength(2);
    for (const block of blocks) expect(files["Bindings.xml"]).toContain(block);
    expect(files["Bindings.xml"]).toContain('<Binding name="MGA_PROFESSIONS" category="MGA">');
    expect(files["Bindings.xml"]).toContain("MGAProfessions.Toggle()");
    expect(files["MGAProfessions.lua"]).toContain('BINDING_NAME_MGA_PROFESSIONS = "Open MGA Professions"');
  });

  it("ships the shared hub byte for byte", () => {
    expect(files["MGAHub.lua"]).toBe(sharedHub);
  });

  it("zips the addon inside its folder", () => {
    const zip = unzipSync(professionsAddonZip());
    expect(Object.keys(zip).filter((name) => !name.endsWith("/")).sort()).toEqual(Object.keys(files).map((name) => `MGAProfessions/${name}`).sort());
    expect(strFromU8(zip["MGAProfessions/MGAProfessions.toc"])).toContain("## Title: MGA Professions");
  });
});
