import { describe, expect, it } from "vitest";
import sharedHub from "../../addon/shared/MGAHub.lua?raw";
import sharedBindings from "../../addon/shared/Bindings.xml?raw";
import buffsBindings from "../../addon/MGABuffs/Bindings.xml?raw";
import buffsHub from "../../addon/MGABuffs/MGAHub.lua?raw";
import dungeonQuestsBindings from "../../addon/MGADungeonQuests/Bindings.xml?raw";
import dungeonQuestsHub from "../../addon/MGADungeonQuests/MGAHub.lua?raw";
import lootBindings from "../../addon/MGALoot/Bindings.xml?raw";
import lootHub from "../../addon/MGALoot/MGAHub.lua?raw";
import pricesBindings from "../../addon/MGAPrices/Bindings.xml?raw";
import pricesHub from "../../addon/MGAPrices/MGAHub.lua?raw";
import waypointsBindings from "../../addon/MGAWaypoints/Bindings.xml?raw";
import waypointsHub from "../../addon/MGAWaypoints/MGAHub.lua?raw";
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

const plain = (lines: string[]): string[] => lines.map((l) => l.replace(/\|c[0-9a-f]{8}|\|r/g, ""));

/** Loads each hub copy in order, then runs `scenario`; returns what the stubs recorded. */
function run(scenario: string, copies: string[] = [sharedHub]): string[] {
  return plain(
    runAddonLua(
      [...copies.map((code, i): [string, string] => [`MGAHub.lua#${i}`, code]), ["scenario", scenario]],
      STUBS,
    ),
  );
}

const say = (expr: string): string => `say(${expr})`;

describe("the MGA hub's copies", () => {
  const copies = {
    "MGABuffs": [buffsHub, buffsBindings],
    "MGADungeonQuests": [dungeonQuestsHub, dungeonQuestsBindings],
    "MGALoot": [lootHub, lootBindings],
    "MGAPrices": [pricesHub, pricesBindings],
    "MGAWaypoints": [waypointsHub, waypointsBindings],
  };

  it.each(Object.entries(copies))("%s ships MGAHub.lua and Bindings.xml identical to addon/shared (edit the shared file, then copy it over)", (_addon, [hub, bindings]) => {
    expect(hub).toBe(sharedHub);
    expect(bindings).toBe(sharedBindings);
  });
});

describe("loading the hub from several addons", () => {
  it("makes one button and one menu whether one addon is installed or all four", () => {
    const one = run(`registerAll(); fire("PLAYER_LOGIN"); ${say("buttons()")}`);
    expect(one.slice(-1)[0]).toBe("chat: 1");
    const four = run(`registerAll(); fire("PLAYER_LOGIN"); ${say("buttons()")}`, [buffsHub, dungeonQuestsHub, lootHub, pricesHub]);
    expect(four.slice(-1)[0]).toBe("chat: 1");
    const eventFrames = run(`local n = 0; for _, f in ipairs(hubFrames) do if f.events.PLAYER_LOGIN then n = n + 1 end end; ${say("n")}`, [buffsHub, dungeonQuestsHub, lootHub, pricesHub]);
    expect(eventFrames.slice(-1)[0]).toBe("chat: 1");
  });

  it("keeps the first copy's hub when a later copy is the same version", () => {
    const lines = run(`local first = MGAHub; ${say("first == MGAHub")}`, [sharedHub, sharedHub]);
    expect(lines.slice(-1)[0]).toBe("chat: true");
  });

  it("hands what an older copy registered to a newer one, which then makes the only button", () => {
    const older = sharedHub.replace("local VERSION = 1", "local VERSION = 0");
    expect(older).not.toBe(sharedHub);
    const lines = run(
      `MGAHub.Register({ name = "Loot", order = 20, menu = { { text = "Upgrades in your bags", func = function() end } } })
       fire("PLAYER_LOGIN"); MGAHub.OpenMenu(); ${say("buttons() .. ' ' .. MGAHub.version .. ' ' .. table.concat(menuLines(), ' | ')")}`,
      [older, sharedHub],
    );
    // The older copy loaded first and registered nothing before the newer one replaced it: the scenario registers on the newer.
    expect(lines.slice(-1)[0]).toBe("chat: 1 1 [Loot] | Upgrades in your bags | - | Settings");
    const carried = run(
      `fire("PLAYER_LOGIN"); MGAHub.OpenMenu(); ${say("buttons() .. ' ' .. table.concat(menuLines(), ' | ')")}`,
      [`${older}\nMGAHub.Register({ name = "Loot", menu = { { text = "Upgrades in your bags", func = function() end } } })`, sharedHub],
    );
    expect(carried.slice(-1)[0]).toBe("chat: 1 [Loot] | Upgrades in your bags | - | Settings");
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

  it("starts on the minimap's ring and follows the cursor around it, saving where it was left", () => {
    const lines = run(`registerAll(); fire("PLAYER_LOGIN")
      local b = MGAHubMinimapButton
      ${say("string.format('%.0f,%.0f', b.point[4], b.point[5])")}
      b.scripts.OnDragStart(b)
      cursor.x, cursor.y = 1700 + 300, 900  -- right of the minimap's centre
      b.scripts.OnUpdate(b)
      b.scripts.OnDragStop(b)
      ${say("string.format('%.0f,%.0f %s', b.point[4], b.point[5], tostring(b.scripts.OnUpdate))")}
      ${say("string.format('%.2f', MGAHubSettings.angle)")}`);
    expect(lines.slice(-3)).toEqual(["chat: -66,-46", "chat: 80,0 nil", "chat: 0.00"]);
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
    expect(sharedBindings).toContain('<Binding name="MGA_MENU" header="MGA" category="MGA">');
    expect(sharedBindings).toContain('<Binding name="MGA_SETTINGS" category="MGA">');
    const lines = run(`${say("BINDING_HEADER_MGA .. '|' .. BINDING_CATEGORY_MGA .. '|' .. BINDING_NAME_MGA_MENU .. '|' .. BINDING_NAME_MGA_SETTINGS")}`);
    expect(lines.slice(-1)[0]).toBe("chat: MGA|MGA|Open MGA menu|Open MGA settings");
  });

  it("run the hub's menu and settings", () => {
    const code = (name: string): string => {
      const body = new RegExp(`<Binding name="${name}"[^>]*>([\\s\\S]*?)</Binding>`).exec(sharedBindings)?.[1];
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
