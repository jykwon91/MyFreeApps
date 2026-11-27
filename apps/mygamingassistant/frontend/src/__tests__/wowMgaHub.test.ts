import { describe, expect, it } from "vitest";
import hubBindings from "../../addon/MGAHub/Bindings.xml?raw";
import hubLua from "../../addon/MGAHub/MGAHub.lua?raw";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_HUB_FRAME_STUBS, WOW_HUB_HELPERS } from "@/test/addonLua/wowHubStubs.lua";

const STUBS = `
out = {}
${WOW_HUB_FRAME_STUBS}
${WOW_HUB_HELPERS}
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(out, "chat: " .. tostring(m)) end }
SlashCmdList = {}
local function tipLine(_, t) table.insert(out, "tip: " .. t) end
GameTooltip = { SetOwner = function() end, SetText = tipLine, AddLine = tipLine, Show = function() end, Hide = function() end }
function say(text) DEFAULT_CHAT_FRAME:AddMessage(text) end
-- What each addon registers, in the order the game would load their folders.
function registerAll()
  local ran = {}
  MGAHub.Register({ name = "Buffs", order = 30, menu = { { text = "What's missing now", func = function() table.insert(ran, "missing") end } },
    settings = function(section, top) section.refresh = function() end; return 40 end })
  MGAHub.Register({ name = "Dungeon Quests", order = 10, menu = { { text = "Dungeon journal", func = function() table.insert(ran, "journal") end } },
    settings = function(section, top) return 40 end })
  MGAHub.Register({ name = "Loot", order = 20, menu = { { text = "Upgrades in your bags", func = function() table.insert(ran, "bags") end } },
    settings = function(section, top) return 40 end })
  MGAHub.Register({ name = "Prices", order = 40, settings = function(section, top) return 40 end })
  return ran
end
function buttons()
  local n = 0
  for _, f in ipairs(hubFrames) do if f.name == "MGAHubMinimapButton" then n = n + 1 end end
  return n
end
`;

/** Every file in every addon folder (`addon/<Addon>/<file>`), as raw text, keyed by `<Addon>/<file>`. */
const ADDON_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../../addon/*/*.{lua,toc,xml}", { query: "?raw", import: "default", eager: true }),
  ).map(([path, text]) => [path.replace(/^.*\/addon\//, ""), text]),
);
const ADDON_FOLDERS = [...new Set(Object.keys(ADDON_FILES).map((path) => path.split("/")[0]))].sort();
const OTHER_ADDONS = ADDON_FOLDERS.filter((folder) => folder !== "MGAHub");
const tocOf = (folder: string): string => ADDON_FILES[`${folder}/${folder}.toc`];
const tocField = (toc: string, field: string): string[] =>
  (toc.match(new RegExp(`^## ${field}: (.*)$`, "m"))?.[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const bindingNames = (xml: string): string[] => [...xml.matchAll(/<Binding\s+name="([^"]+)"/g)].map((m) => m[1]);

const plain = (lines: string[]): string[] => lines.map((l) => l.replace(/\|c[0-9a-f]{8}|\|r/g, ""));

/** Loads the hub, then runs `scenario`; returns what the stubs recorded. */
function run(scenario: string): string[] {
  return plain(runAddonLua([["MGAHub/MGAHub.lua", hubLua], ["scenario", scenario]], STUBS));
}

const say = (expr: string): string => `say(${expr})`;

describe("the MGAHub addon and the addons that use it", () => {
  it("finds every addon folder", () => {
    expect(ADDON_FOLDERS).toContain("MGAHub");
    expect(OTHER_ADDONS.length).toBeGreaterThanOrEqual(8);
    for (const folder of ADDON_FOLDERS) expect(tocOf(folder), folder).toBeDefined();
  });

  it("declares every key binding in exactly one addon folder (a second declaration is a load error in game)", () => {
    const declaredBy = new Map<string, string[]>();
    for (const [path, text] of Object.entries(ADDON_FILES)) {
      if (!path.endsWith("/Bindings.xml")) continue;
      for (const name of bindingNames(text)) declaredBy.set(name, [...(declaredBy.get(name) ?? []), path.split("/")[0]]);
    }
    const twice = [...declaredBy].filter(([, folders]) => folders.length > 1).map(([name, folders]) => `${name}: ${folders.join(", ")}`);
    expect(twice).toEqual([]);
    expect(declaredBy.get("MGA_MENU")).toEqual(["MGAHub"]);
    expect(declaredBy.get("MGA_SETTINGS")).toEqual(["MGAHub"]);
  });

  it("names every binding it declares in that folder's Lua", () => {
    for (const [path, text] of Object.entries(ADDON_FILES)) {
      if (!path.endsWith("/Bindings.xml")) continue;
      const folder = path.split("/")[0];
      const lua = Object.entries(ADDON_FILES).filter(([p]) => p.startsWith(`${folder}/`) && p.endsWith(".lua")).map(([, code]) => code).join("\n");
      for (const name of bindingNames(text)) expect(lua, `${folder} ${name}`).toContain(`BINDING_NAME_${name} = `);
    }
  });

  it("is an addon of its own on the same interface as the others, saving the hub settings", () => {
    const toc = tocOf("MGAHub");
    expect(tocField(toc, "Interface")).toEqual(["16001"]);
    expect(tocField(toc, "SavedVariables")).toEqual(["MGAHubSettings"]);
    expect(tocField(toc, "Dependencies")).toEqual([]);
    expect(toc.trim().split(/\r?\n/).filter((l) => l && !l.startsWith("#"))).toEqual(["MGAHub.lua"]);
    for (const folder of OTHER_ADDONS) expect(tocField(tocOf(folder), "Interface"), folder).toEqual(tocField(toc, "Interface"));
  });

  it.each(OTHER_ADDONS)("%s depends on MGAHub and carries no copy of it", (folder) => {
    const toc = tocOf(folder);
    expect(tocField(toc, "Dependencies")).toContain("MGAHub");
    expect(tocField(toc, "SavedVariables")).not.toContain("MGAHubSettings");
    expect(toc).not.toMatch(/^MGAHub\.lua$/m);
    expect(ADDON_FILES[`${folder}/MGAHub.lua`]).toBeUndefined();
  });

  it("makes one minimap button and one login frame", () => {
    expect(run(`registerAll(); fire("PLAYER_LOGIN"); ${say("buttons()")}`).slice(-1)[0]).toBe("chat: 1");
    const eventFrames = run(`local n = 0; for _, f in ipairs(hubFrames) do if f.events.PLAYER_LOGIN then n = n + 1 end end; ${say("n")}`);
    expect(eventFrames.slice(-1)[0]).toBe("chat: 1");
  });
});

describe("MGAHub.GetProfessionSkills", () => {
  const skills = `local s = MGAHub.GetProfessionSkills(); ${say("s and #s .. ' ' .. (s[1] and (s[1].name .. '=' .. s[1].skill .. '/' .. tostring(s[1].line)) or '-') or 'nil'")}`;
  const last = (setup: string): string => run(`${setup}; ${skills}`).slice(-1)[0];

  it("reads GetProfessions/GetProfessionInfo on a client without GetSkillLineInfo", () => {
    const forever =
      'GetProfessions = function() return 4, nil, 2 end; ' +
      'GetProfessionInfo = function(i) return "P" .. i, 0, i * 10, 300, 0, 0, 100 + i end';
    expect(last(forever)).toBe("chat: 2 P4=40/104");
  });

  it("falls back to the old skills list, and gives up on a collapsed header", () => {
    const lines = (expanded: string) =>
      "GetNumSkillLines = function() return 2 end; " +
      `GetSkillLineInfo = function(i) if i == 1 then return "Professions", 1, ${expanded}, 0 end return "Mining", nil, nil, 77 end`;
    expect(last(lines("1"))).toBe("chat: 1 Mining=77/nil");
    expect(last(lines("nil"))).toBe("chat: nil");
  });

  it("is nil, not an error, with neither API", () => {
    expect(last("")).toBe("chat: nil");
  });
});

describe("the MGA menu", () => {
  it("lists each addon's actions under its heading in a fixed order, then Settings", () => {
    const lines = run(`registerAll(); fire("PLAYER_LOGIN"); MGAHub.OpenMenu(); ${say("table.concat(menuLines(), ' | ')")}`);
    expect(lines.slice(-1)[0]).toBe(
      "chat: [Dungeon Quests] | Dungeon journal | [Loot] | Upgrades in your bags | [Buffs] | What's missing now | - | Settings",
    );
  });

  it("is just Settings when the installed addons have no actions", () => {
    const lines = run(`MGAHub.Register({ name = "Prices", settings = function() return 10 end }); fire("PLAYER_LOGIN"); MGAHub.OpenMenu(); ${say("table.concat(menuLines(), ' | ')")}`);
    expect(lines.slice(-1)[0]).toBe("chat: Settings");
  });

  it("runs an entry's action and closes", () => {
    const lines = run(`local ran = registerAll(); fire("PLAYER_LOGIN"); MGAHub.OpenMenu(); clickRow("Upgrades in your bags"); ${say("ran[1] .. ' ' .. tostring(menuShown())")}`);
    expect(lines.slice(-1)[0]).toBe("chat: bags false");
  });

  it("closes on a click anywhere else and on Esc", () => {
    const lines = run(`registerAll(); fire("PLAYER_LOGIN"); MGAHub.OpenMenu();
      ${say("tostring(menuShown()) .. ' ' .. tostring(MGAHubMenuCatcher.shownFlag)")}
      MGAHubMenuCatcher.scripts.OnClick(MGAHubMenuCatcher)
      ${say("tostring(menuShown()) .. ' ' .. tostring(MGAHubMenuCatcher.shownFlag)")}
      MGAHub.OpenMenu(); MGAHubMenu:Hide()
      ${say("tostring(MGAHubMenuCatcher.shownFlag) .. ' ' .. tostring(UISpecialFrames[1])")}`);
    expect(lines.slice(-3)).toEqual(["chat: true true", "chat: false false", "chat: false MGAHubMenu"]);
  });

  it("opens the Settings window from its last entry", () => {
    const lines = run(`registerAll(); fire("PLAYER_LOGIN"); MGAHub.OpenMenu(); clickRow("Settings")`);
    expect(lines).toContain("options: opened id:MGA");
  });

  it("opens mid-screen when the minimap button is hidden", () => {
    const lines = run(`MGAHubSettings = { hidden = true }; registerAll(); fire("PLAYER_LOGIN"); MGAHub.OpenMenu(); ${say("MGAHubMenu.point[1] .. ' ' .. tostring(MGAHubMinimapButton.shownFlag)")}`);
    expect(lines.slice(-1)[0]).toBe("chat: CENTER false");
  });
});

describe("the MGA minimap button", () => {
  it("opens the menu on a left click and closes it on the next", () => {
    const lines = run(`registerAll(); fire("PLAYER_LOGIN"); click(MGAHubMinimapButton); ${say("menuShown()")} click(MGAHubMinimapButton, "LeftButton"); ${say("menuShown()")}`);
    expect(lines.slice(-2)).toEqual(["chat: true", "chat: false"]);
  });

  it("opens the settings on a right click", () => {
    const lines = run(`registerAll(); fire("PLAYER_LOGIN"); click(MGAHubMinimapButton, "RightButton"); ${say("menuShown()")}`);
    expect(lines).toContain("options: opened id:MGA");
    expect(lines.slice(-1)[0]).toBe("chat: false");
  });

  it("says what its clicks do in its tooltip", () => {
    const lines = run(`registerAll(); fire("PLAYER_LOGIN"); MGAHubMinimapButton.scripts.OnEnter(MGAHubMinimapButton)`);
    expect(lines.filter((l) => l.startsWith("tip: "))).toEqual(["tip: MGA", "tip: Click: menu · Right-click: settings"]);
  });

  it("starts on the left of the minimap ring, clear of where Questie and other LibDBIcon buttons sit, and follows the cursor around it, saving where it was left", () => {
    const lines = run(`registerAll(); fire("PLAYER_LOGIN")
      local b = MGAHubMinimapButton
      ${say("string.format('%.0f,%.0f', b.point[4], b.point[5])")}
      b.scripts.OnDragStart(b)
      cursor.x, cursor.y = 1700 + 300, 900  -- right of the minimap's centre
      b.scripts.OnUpdate(b)
      b.scripts.OnDragStop(b)
      ${say("string.format('%.0f,%.0f %s', b.point[4], b.point[5], tostring(b.scripts.OnUpdate))")}
      ${say("string.format('%.2f', MGAHubSettings.angle)")}`);
    expect(lines.slice(-3)).toEqual(["chat: -77,21", "chat: 80,0 nil", "chat: 0.00"]);
  });

  it("goes back where it was saved at the next login, and hides when asked", () => {
    const placed = run(`MGAHubSettings = { angle = math.pi / 2 }; registerAll(); fire("PLAYER_LOGIN"); local b = MGAHubMinimapButton; ${say("string.format('%.0f,%.0f', b.point[4], b.point[5])")}`);
    expect(placed.slice(-1)[0]).toBe("chat: 0,80");
    const hidden = run(`registerAll(); fire("PLAYER_LOGIN"); click(MGAHubOption_minimap); ${say("tostring(MGAHubMinimapButton.shownFlag) .. ' ' .. tostring(MGAHubSettings.hidden)")} click(MGAHubOption_minimap); ${say("tostring(MGAHubMinimapButton.shownFlag) .. ' ' .. tostring(MGAHubSettings.hidden)")}`);
    expect(hidden.slice(-2)).toEqual(["chat: false true", "chat: true false"]);
  });

  it("reaches the edge of a square minimap", () => {
    const lines = run(`GetMinimapShape = function() return "SQUARE" end; MGAHubSettings = { angle = math.pi / 4 }; registerAll(); fire("PLAYER_LOGIN"); local b = MGAHubMinimapButton; ${say("string.format('%.0f,%.0f', b.point[4], b.point[5])")}`);
    expect(lines.slice(-1)[0]).toBe("chat: 80,80");
  });

  it("is built even where the minimap button can't be, without taking the settings down", () => {
    const lines = run(`Minimap = nil; registerAll(); fire("PLAYER_LOGIN"); ${say("tostring(MGAHubPanel ~= nil)")}`);
    expect(lines.some((l) => l.startsWith("chat: MGA: minimap button unavailable:"))).toBe(true);
    expect(lines.slice(-1)[0]).toBe("chat: true");
  });
});

describe("the MGA settings window", () => {
  it("adds one MGA page to Options > AddOns with a section per addon that has settings", () => {
    const lines = run(`registerAll(); fire("PLAYER_LOGIN"); MGAHub.OpenSettings()`);
    expect(lines.filter((l) => l.startsWith("options: "))).toEqual(["options: added MGA", "options: opened id:MGA"]);
    const sections = run(`registerAll(); fire("PLAYER_LOGIN"); local names = {}
      for _, f in ipairs(hubFrames) do
        if f.kind == "FontString" and f.parent and f.parent.parent and f.parent.parent.name == "MGAHubScrollContent" then table.insert(names, f.text) end
      end
      ${say("table.concat(names, ' | ')")}`);
    expect(sections.slice(-1)[0]).toBe("chat: Dungeon Quests | Loot | Buffs | Prices");
  });

  it("gives a section its heading to build under and refreshes it when the page opens", () => {
    const lines = run(`local refreshed = 0
      MGAHub.Register({ name = "Loot", settings = function(section, top)
        ${say("top.text")}
        section.refresh = function() refreshed = refreshed + 1 end
        return 10
      end })
      fire("PLAYER_LOGIN"); MGAHub.OpenSettings(); ${say("refreshed")}`);
    expect(lines.filter((l) => l.startsWith("chat: "))).toEqual(["chat: Loot", "chat: 2"]);
  });

  it("keeps the other sections when one can't be built", () => {
    const lines = run(`MGAHub.Register({ name = "Loot", order = 1, settings = function() error("boom") end })
      MGAHub.Register({ name = "Prices", order = 2, settings = function() return 10 end })
      fire("PLAYER_LOGIN"); ${say("tostring(MGAHubPanel ~= nil)")}`);
    expect(lines.some((l) => l.startsWith("chat: MGA: Loot settings unavailable:") && l.includes("boom"))).toBe(true);
    expect(lines.slice(-1)[0]).toBe("chat: true");
  });

  it("uses the older Interface Options list on clients without the Settings window", () => {
    const lines = run(`Settings = nil; registerAll(); fire("PLAYER_LOGIN"); MGAHub.OpenSettings()`);
    expect(lines.filter((l) => l.startsWith("options: "))).toEqual(["options: added (old list) MGA", "options: opened (old list) MGA", "options: opened (old list) MGA"]);
  });

  it("says so in chat when the client has no options page to open", () => {
    const lines = run(`Settings = nil; InterfaceOptions_AddCategory = nil; registerAll(); fire("PLAYER_LOGIN"); MGAHub.OpenSettings()`);
    expect(lines.slice(-1)[0]).toBe("chat: MGA: this game version has no AddOns options page, so there are no settings to open.");
  });

  it("has a dropdown that lists its choices, marks the current one and saves the pick", () => {
    const lines = run(`local picked
      MGAHub.Register({ name = "Loot", settings = function(section, top)
        local pick = MGAHub.UI.Dropdown(section, "TestPick", 200,
          function() return { { value = false, text = "Automatic" }, { value = "arms", text = "Arms" } } end,
          function() return picked or false end,
          function(value) picked = value end)
        pick.refresh()
        return 30
      end })
      fire("PLAYER_LOGIN")
      ${say("TestPick.text")}
      click(TestPick); ${say("table.concat(menuLines(), ' | ')")}
      clickRow("Arms"); ${say("TestPick.text .. ' ' .. tostring(picked)")}`);
    expect(lines.slice(-3)).toEqual(["chat: Automatic", "chat: Automatic | Arms", "chat: Arms arms"]);
  });
});

describe("the MGA key bindings", () => {
  it("lists both actions in an MGA category of the game's Key Bindings", () => {
    expect(hubBindings).toContain('<Binding name="MGA_MENU" header="MGA" category="MGA">');
    expect(hubBindings).toContain('<Binding name="MGA_SETTINGS" category="MGA">');
    const lines = run(`${say("BINDING_HEADER_MGA .. '|' .. BINDING_CATEGORY_MGA .. '|' .. BINDING_NAME_MGA_MENU .. '|' .. BINDING_NAME_MGA_SETTINGS")}`);
    expect(lines.slice(-1)[0]).toBe("chat: MGA|MGA|Open MGA menu|Open MGA settings");
  });

  it("run the hub's menu and settings", () => {
    const code = (name: string): string => {
      const body = new RegExp(`<Binding name="${name}"[^>]*>([\\s\\S]*?)</Binding>`).exec(hubBindings)?.[1];
      if (!body) throw new Error(`no ${name} binding`);
      return body.trim();
    };
    const lines = run(`registerAll(); fire("PLAYER_LOGIN"); ${code("MGA_MENU")}; ${say("menuShown()")} ${code("MGA_SETTINGS")}`);
    expect(lines).toContain("chat: true");
    expect(lines).toContain("options: opened id:MGA");
  });
});

describe("the /mga command", () => {
  it("opens the menu, or the settings with 'settings'", () => {
    const lines = run(`registerAll(); fire("PLAYER_LOGIN"); SlashCmdList.MGAHUB(""); ${say("menuShown()")} SlashCmdList.MGAHUB("settings")`);
    expect(lines).toContain("chat: true");
    expect(lines).toContain("options: opened id:MGA");
  });
});
