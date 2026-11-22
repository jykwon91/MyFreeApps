import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import addonBindings from "../../addon/MGAWaypoints/Bindings.xml?raw";
import addonCore from "../../addon/MGAWaypoints/Core.lua?raw";
import addonData from "../../addon/MGAWaypoints/Data.lua?raw";
import addonDisplay from "../../addon/MGAWaypoints/Display.lua?raw";
import addonHub from "../../addon/MGAWaypoints/MGAHub.lua?raw";
import addonMain from "../../addon/MGAWaypoints/MGAWaypoints.lua?raw";
import addonToc from "../../addon/MGAWaypoints/MGAWaypoints.toc?raw";
import addonPicker from "../../addon/MGAWaypoints/Picker.lua?raw";
import { loadDungeons } from "@/games/wow-forever/lib/dungeons/loadDungeons";
import { waypointsAddonDataLua } from "@/games/wow-forever/lib/waypointsAddon/waypointsAddonDataLua";
import { waypointsAddonZip } from "@/games/wow-forever/lib/waypointsAddon/waypointsAddonZip";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_WAYPOINT_STUBS } from "@/test/addonLua/wowWaypointStubs.lua";

const STORMWIND = 1453;
const ORGRIMMAR = 1454;
const EASTERN_KINGDOMS = 1415;
const KALIMDOR = 1414;

/** Helpers every scenario shares: stand somewhere on a zone map (percent), and print values. */
const PRELUDE = `
local M = MGAWaypoints
function stand(map, x, y) local s = M.WorldSpot(map, x, y); at = { x = s.wx, y = s.wy, c = s.c } end
function say(v) table.insert(out, tostring(v)) end
function names(list) local n = {} for i, p in ipairs(list) do n[i] = p.name end return table.concat(n, "|") end
`;

/** Loads the addon (login included), runs `scenario`, and returns what it printed. */
function run(scenario: string): string[] {
  return runAddonLua(
    [
      ["MGAHub.lua", addonHub],
      ["Data.lua", addonData],
      ["Core.lua", addonCore],
      ["Display.lua", addonDisplay],
      ["Picker.lua", addonPicker],
      ["MGAWaypoints.lua", addonMain],
      ["prelude", PRELUDE],
      ["login", `fire("PLAYER_LOGIN"); clear()`],
      ["scenario", `local M = MGAWaypoints
${scenario}`],
    ],
    WOW_WAYPOINT_STUBS,
  );
}

describe("MGA Waypoints files", () => {
  it("Data.lua is the World Map's places (npx vitest run -u rewrites it)", async () => {
    const data = await loadDungeons();
    await expect(waypointsAddonDataLua(data.dungeons)).toMatchFileSnapshot("../../addon/MGAWaypoints/Data.lua");
  });

  it("Data.lua carries every kind of place from the World Map's own data", () => {
    const kinds = run(`
      local seen = {}
      for _, p in ipairs(M.Places()) do seen[p.kind] = (seen[p.kind] or 0) + 1 end
      for _, k in ipairs({"class", "pet", "demon", "prof", "flight", "repair", "inn", "bank", "ah", "dungeon", "place"}) do
        say(k .. "=" .. ((seen[k] or 0) > 0 and "yes" or "NONE"))
      end
      say(#M.Places() == #MGAWaypointsData.places and "all placed" or "some places have no zone")
    `);
    expect(kinds.every((l) => !l.endsWith("NONE"))).toBe(true);
    expect(kinds.slice(-1)).toEqual(["all placed"]);
  });

  it("loads from its toc on the Forever interface, hub first", () => {
    expect(addonToc).toContain("## Interface: 16001");
    expect(addonToc).toContain("## SavedVariables: MGAHubSettings, MGAWaypointsSettings");
    expect(addonToc.trim().split(/\r?\n/).slice(-6)).toEqual(["MGAHub.lua", "Data.lua", "Core.lua", "Display.lua", "Picker.lua", "MGAWaypoints.lua"]);
  });

  it("zips the addon inside its folder", () => {
    const files = unzipSync(waypointsAddonZip());
    expect(Object.keys(files).sort()).toEqual([
      "MGAWaypoints/",
      "MGAWaypoints/Bindings.xml",
      "MGAWaypoints/Core.lua",
      "MGAWaypoints/Data.lua",
      "MGAWaypoints/Display.lua",
      "MGAWaypoints/MGAHub.lua",
      "MGAWaypoints/MGAWaypoints.lua",
      "MGAWaypoints/MGAWaypoints.toc",
      "MGAWaypoints/Picker.lua",
    ]);
    expect(strFromU8(files["MGAWaypoints/Core.lua"])).toBe(addonCore);
    expect(addonBindings).toContain("MGA_MENU");
  });
});

describe("MGA Waypoints math", () => {
  it("gives the bearing from north, counter-clockwise, and what that is from where you face", () => {
    const lines = run(`
      local from = { c = 0, wx = 0, wy = 0 }
      say(M.Bearing(from, { c = 0, wx = 100, wy = 0 }))
      say(M.Bearing(from, { c = 0, wx = 0, wy = 100 }) - math.pi / 2)
      say(M.Relative(math.pi / 2, 0) - math.pi / 2)
      say(M.Relative(0, math.pi / 2) + math.pi / 2)
      say(M.Relative(-math.pi + 0.1, math.pi - 0.1) - 0.2)
    `);
    expect(lines.map(Number).map((n) => Math.abs(n) < 1e-9)).toEqual([true, true, true, true, true]);
  });

  it("names the compass direction", () => {
    expect(run(`for _, d in ipairs({0, 90, 180, 270, 45, -45}) do say(M.Compass(math.rad(d))) end`)).toEqual(["N", "W", "S", "E", "NW", "NE"]);
  });

  it("prints yards, and says other continent for an unreachable one", () => {
    expect(run(`say(M.YardsText(42.4)); say(M.YardsText(1520)); say(M.YardsText(math.huge))`)).toEqual(["42 yd", "1.5k yd", "other continent"]);
  });

  it("places a spot on the minimap: north up, turning with you, and pulled onto the edge", () => {
    const lines = run(`
      local me = { c = 0, wx = 0, wy = 0 }
      local function show(spot, facing, rotate, square)
        local x, y, edge = M.MinimapOffset(me, spot, facing, rotate, 400, 70, square)
        say(string.format("%.1f %.1f %s", x, y, tostring(edge)))
      end
      show({ wx = 100, wy = 0 }, 0, false)
      show({ wx = 0, wy = 100 }, 0, false)
      show({ wx = 100, wy = 0 }, math.pi / 2, true)
      show({ wx = 1000, wy = 0 }, 0, false)
      show({ wx = 1000, wy = 1000 }, 0, false, true)
      say(M.MinimapYards(0, false) .. " " .. M.MinimapYards(5, true))
    `);
    expect(lines).toEqual(["0.0 35.0 false", "-35.0 0.0 false", "35.0 0.0 false", "0.0 70.0 true", "-70.0 70.0 true", "466.67 50"]);
  });
});

describe("MGA Waypoints picker data", () => {
  it("lists your class's trainers nearest first, for your faction only", () => {
    const lines = run(`
      stand(${STORMWIND}, 50, 50)
      local list = M.Search({ category = "class" })
      say(#list > 0 and "some" or "none")
      local ok = true
      for i, p in ipairs(list) do
        if not (p.kind == "class" and p.tag == "warlock" or p.kind == "demon") or p.side == "H" then ok = false end
        if i > 1 and p.yards and list[i - 1].yards and p.yards < list[i - 1].yards then ok = false end
      end
      say(ok)
      say(list[1].zone)
    `);
    expect(lines).toEqual(["some", "true", "Stormwind City"]);
  });

  it("shows other classes' trainers only to a search, and pet trainers only to hunters", () => {
    const lines = run(`
      stand(${STORMWIND}, 50, 50)
      local kinds = {}
      for _, p in ipairs(M.Search({ category = "class", scope = "all", otherSide = true })) do kinds[p.kind] = true end
      say(kinds.pet == nil)
      player.class = "HUNTER"
      kinds = {}
      for _, p in ipairs(M.Search({ category = "class", scope = "all", otherSide = true })) do kinds[p.kind] = true end
      say(kinds.pet == true and kinds.demon == nil)
      say(#M.Search({ query = "hunter trainer" }) > 0)
    `);
    expect(lines).toEqual(["true", "true", "true"]);
  });

  it("finds the nearest flight master for each faction", () => {
    expect(
      run(`
        stand(${STORMWIND}, 50, 50)
        say(M.Search({ category = "flight" })[1].name)
        player.faction = "Horde"; stand(${ORGRIMMAR}, 50, 50)
        say(M.Search({ category = "flight" })[1].name)
      `),
    ).toEqual(["Dungar Longdrink", "Doras"]);
  });

  it("keeps to this zone, this continent or everywhere, and hides the other faction until asked", () => {
    const lines = run(`
      stand(${STORMWIND}, 50, 50); bestMap = ${STORMWIND}
      local function count(opts) opts.category = "repair"; return #M.Search(opts) end
      local zone, continent, all = count({ scope = "zone" }), count({ scope = "continent" }), count({ scope = "all" })
      say(zone > 0 and zone < continent and continent < all)
      for _, p in ipairs(M.Search({ category = "repair", scope = "zone" })) do if p.map ~= ${STORMWIND} then say("outside the zone") end end
      for _, p in ipairs(M.Search({ category = "repair", scope = "all" })) do if p.side == "H" then say("horde shown") end end
      say(count({ scope = "all", otherSide = true }) > all)
    `);
    expect(lines).toEqual(["true", "true"]);
  });

  it("ranks other continents last", () => {
    expect(
      run(`
        stand(${STORMWIND}, 50, 50)
        local seenOther = false
        local ok = true
        for _, p in ipairs(M.Search({ category = "flight", scope = "all" })) do
          if p.spot.c ~= 0 then seenOther = true elseif seenOther then ok = false end
        end
        say(ok and seenOther)
      `),
    ).toEqual(["true"]);
  });

  it("filters professions", () => {
    expect(
      run(`
        stand(${STORMWIND}, 50, 50)
        local list = M.Search({ category = "prof", scope = "all", profession = "mining" })
        local ok = #list > 0
        for _, p in ipairs(list) do if p.tag ~= "mining" then ok = false end end
        say(ok)
      `),
    ).toEqual(["true"]);
  });

  it("searches every kind of place by name, ignoring category and scope", () => {
    const lines = run(`
      stand(${STORMWIND}, 50, 50)
      say(M.Search({ category = "repair", scope = "zone", query = "dungar" })[1].name)
      say(M.Search({ query = "deadmines" })[1].kind)
      say(#M.Search({ query = "zzzz nothing" }))
    `);
    expect(lines).toEqual(["Dungar Longdrink", "dungeon", "0"]);
  });

  it("lists dungeons with their level and entry door, and a place sorts by name with no position", () => {
    const lines = run(`
      at = nil
      local first = M.Search({ category = "dungeon", scope = "all" })[1]
      say(first.title:find("level") ~= nil)
      local list = M.Search({ category = "place", scope = "all" })
      say(list[1].yards == nil and list[1].name <= list[2].name)
    `);
    expect(lines).toEqual(["true", "true"]);
  });
});

describe("MGA Waypoints guiding", () => {
  const GO_DUNGAR = `stand(${STORMWIND}, 40, 50); M.SetTarget(M.Search({ query = "dungar" })[1])`;

  it("turns the arrow towards the target as you face, and says how far and which way", () => {
    const lines = run(`
      ${GO_DUNGAR}
      M.Resume()
      local t = M.Target().spot
      at = { x = t.wx - 100, y = t.wy, c = t.c }
      facing = 0; spin(); say(string.format("%.4f", arrowTurn()))
      facing = math.pi / 2; spin(); say(string.format("%.4f", arrowTurn() + math.pi / 2))
      say(select(2, arrowText()))
      say(select(1, arrowText()))
    `);
    expect(lines).toEqual(["0.0000", "0.0000", "100 yd N", "Dungar Longdrink"]);
  });

  it("clears the waypoint on arrival and says so", () => {
    const lines = run(`
      ${GO_DUNGAR}
      M.Resume()
      local t = M.Target().spot
      at = { x = t.wx - 5, y = t.wy, c = t.c }
      M.Update()
      say(M.Target() == nil)
      say(MGAWaypointsArrow.shownFlag)
    `);
    expect(lines).toEqual(["chat: MGA Waypoints: You have arrived at Dungar Longdrink.", "true", "false"]);
  });

  it("leaves the target set while you are further than the arrival distance, and honours a bigger one", () => {
    expect(
      run(`
        ${GO_DUNGAR}
        M.Resume()
        local t = M.Target().spot
        at = { x = t.wx - 20, y = t.wy, c = t.c }
        M.Update(); say(M.Target() ~= nil)
        M.Settings().arrival = 25
        M.Update(); say(M.Target() == nil)
      `).filter((l) => !l.startsWith("chat")),
    ).toEqual(["true", "true"]);
  });

  it("points a Horde player at the zeppelin when the place is on another continent", () => {
    const lines = run(`
      player.faction = "Horde"
      local tower = nil
      for _, ride in ipairs(MGAWaypointsData.rides) do
        for _, stop in ipairs(ride.stops) do if stop.label == "Undercity zeppelin tower" then tower = stop end end
      end
      at = { x = tower.wx, y = tower.wy, c = 0 }
      M.SetTarget(M.Search({ query = "doras" , otherSide = true })[1])
      M.Resume()
      say(select(3, arrowText()))
      say(M.Step(M.PlayerSpot(), M.Target()).final)
    `);
    expect(lines).toEqual(["Take the zeppelin from Undercity zeppelin tower to Orgrimmar zeppelin tower", "false"]);
  });

  it("points an Alliance player at a boat, never a Horde zeppelin", () => {
    expect(
      run(`
        stand(${STORMWIND}, 50, 50)
        M.SetTarget(M.Search({ query = "doras", otherSide = true })[1])
        M.Resume()
        say(select(3, arrowText()):find("^Take the boat from") ~= nil)
      `),
    ).toEqual(["true"]);
  });

  it("says where the place is when it cannot say how to get there, and hides the arrow in an instance", () => {
    const lines = run(`
      ${GO_DUNGAR}
      M.Resume()
      at = { x = 0, y = 0, c = 36 }
      M.Update()
      say(select(2, arrowText()))
      say(MGAWaypointsArrow.texture.shownFlag)
      at = nil
      M.Update()
      say(select(2, arrowText()))
    `);
    expect(lines).toEqual(["Your position isn't available here.", "false", "Your position isn't available here."]);
  });

  it("uses the map position when UnitPosition is missing", () => {
    expect(
      run(`
        UnitPosition = nil
        bestMap = ${STORMWIND}
        C_Map.GetPlayerMapPosition = function() return { GetXY = function() return 0.5, 0.5 end } end
        local spot = M.PlayerSpot()
        local want = M.WorldSpot(${STORMWIND}, 50, 50)
        say(spot.c == want.c and math.abs(spot.wx - want.wx) < 1e-6 and math.abs(spot.wy - want.wy) < 1e-6)
      `),
    ).toEqual(["true"]);
  });

  it("puts a pin on the minimap, and none when switched off", () => {
    const lines = run(`
      ${GO_DUNGAR}
      M.Resume()
      local t = M.Target().spot
      at = { x = t.wx - 100, y = t.wy, c = t.c }
      M.Update()
      local x, y = minimapPinAt()
      say(math.abs(x) < 1e-6 and y > 0)
      say(MGAWaypointsMinimapPin.shownFlag)
      M.Settings().minimapPin = false
      M.Update()
      say(MGAWaypointsMinimapPin.shownFlag)
    `);
    expect(lines).toEqual(["true", "true", "false"]);
  });

  it("puts pins on the zone and continent maps, and none on another continent's", () => {
    const lines = run(`
      ${GO_DUNGAR}
      M.Resume()
      openMap(${STORMWIND}); shownMapPins()
      openMap(${EASTERN_KINGDOMS}); shownMapPins()
      openMap(${KALIMDOR}); shownMapPins()
    `);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^pin: Dungar Longdrink 0\.\d+ 0\.\d+$/);
    expect(lines[1]).toMatch(/^pin: Dungar Longdrink 0\.\d+ 0\.\d+$/);
    expect(lines[0]).not.toBe(lines[1]);
  });
});

describe("MGA Waypoints menu, picker and commands", () => {
  it("adds its entries to the MGA menu, with a Clear that names the waypoint", () => {
    const lines = run(`
      stand(${STORMWIND}, 50, 50)
      MGAHub.OpenMenu()
      say(table.concat(menuLines(), ","))
      clickRow("Nearest flight master")
      MGAHub.OpenMenu()
      say(table.concat(menuLines(), ","))
      clickRow("Clear waypoint (Dungar Longdrink)")
      say(M.Target() == nil)
    `);
    expect(lines[0]).toContain("[Waypoints],Go to...,Nearest class trainer,Nearest flight master,Nearest repair vendor,Clear waypoint");
    expect(lines[0]).not.toContain("Clear waypoint (");
    expect(lines[2]).toContain("Clear waypoint (Dungar Longdrink)");
    expect(lines.slice(-1)).toEqual(["true"]);
  });

  it("opens the picker from the menu, lists the nearest first and guides to the row you click", () => {
    const lines = run(`
      stand(${STORMWIND}, 50, 50)
      MGAHub.OpenMenu()
      clickRow("Go to...")
      say(MGAWaypointsPicker.shownFlag)
      say(MGAWaypointsPickerRow1.name.text)
      MGAWaypointsPickerRow1.scripts.OnClick(MGAWaypointsPickerRow1)
      say(M.Target().name == MGAWaypointsPickerRow1.name.text)
      say(MGAWaypointsPicker.shownFlag)
    `);
    expect(lines.slice(0, 2)).toEqual(["true", expect.any(String)]);
    expect(lines.slice(-2)).toEqual(["true", "false"]);
  });

  it("switches category, scope and faction from its buttons, and searches as you type", () => {
    const lines = run(`
      stand(${STORMWIND}, 50, 50)
      M.OpenPicker()
      click(MGAWaypointsCategoryflight)
      say(MGAWaypointsPickerRow1.name.text)
      click(MGAWaypointsScope); say(MGAWaypointsScope.text)
      click(MGAWaypointsSide); say(MGAWaypointsSide.text)
      MGAWaypointsSearch:SetText("deadmines")
      MGAWaypointsSearch.scripts.OnTextChanged(MGAWaypointsSearch)
      say(MGAWaypointsPickerRow1.name.text:find("Deadmines") ~= nil)
    `);
    expect(lines).toEqual(["Dungar Longdrink", "Everywhere", "Both factions", "true"]);
  });

  it("has a settings section that flips the arrow off, and clears from there", () => {
    const lines = run(`
      stand(${STORMWIND}, 50, 50)
      M.GoNearest("flight")
      MGAHub.OpenSettings()
      say(MGAWaypointsOptions_arrow.checked)
      click(MGAWaypointsOptions_arrow)
      say(M.Settings().arrow)
      click(MGAWaypointsOptions_clear)
      say(M.Target() == nil)
    `);
    expect(lines.filter((l) => !l.startsWith("chat") && !l.startsWith("options"))).toEqual(["true", "false", "true"]);
  });

  it("answers /mgawp: browse, go by name, clear, and say when nothing matches", () => {
    const lines = run(`
      stand(${STORMWIND}, 50, 50)
      slash("")
      say(MGAWaypointsPicker.shownFlag)
      slash("dungar")
      say(M.Target().name)
      slash("clear")
      say(M.Target() == nil)
      slash("zzzzqq")
      slash("clear")
    `);
    expect(lines).toEqual([
      "true",
      "chat: MGA Waypoints: Guiding you to Dungar Longdrink in Stormwind City.",
      "Dungar Longdrink",
      "chat: MGA Waypoints: Waypoint cleared.",
      "true",
      'chat: MGA Waypoints: Nothing called "zzzzqq" found. Open /mgawp to browse.',
      "chat: MGA Waypoints: Nothing to clear.",
    ]);
  });

  it("keeps the waypoint between sessions and picks it up again at login", () => {
    const lines = run(`
      stand(${STORMWIND}, 40, 50); M.GoNearest("flight")
      MGAWaypointsArrow:Hide()
      fire("PLAYER_ENTERING_WORLD")
      say(MGAWaypointsArrow.shownFlag)
    `);
    expect(lines.slice(-1)).toEqual(["true"]);
  });
});
