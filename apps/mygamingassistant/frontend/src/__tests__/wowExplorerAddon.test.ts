import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import explorerBindings from "../../addon/MGAExplorer/Bindings.xml?raw";
import explorerCore from "../../addon/MGAExplorer/Core.lua?raw";
import explorerData from "../../addon/MGAExplorer/Data.lua?raw";
import explorerHub from "../../addon/MGAExplorer/MGAHub.lua?raw";
import explorerMain from "../../addon/MGAExplorer/MGAExplorer.lua?raw";
import explorerToc from "../../addon/MGAExplorer/MGAExplorer.toc?raw";
import explorerMapPins from "../../addon/MGAExplorer/MapPins.lua?raw";
import explorerWindow from "../../addon/MGAExplorer/Window.lua?raw";
import waypointsCore from "../../addon/MGAWaypoints/Core.lua?raw";
import waypointsData from "../../addon/MGAWaypoints/Data.lua?raw";
import waypointsDisplay from "../../addon/MGAWaypoints/Display.lua?raw";
import waypointsHub from "../../addon/MGAWaypoints/MGAHub.lua?raw";
import waypointsMain from "../../addon/MGAWaypoints/MGAWaypoints.lua?raw";
import waypointsPicker from "../../addon/MGAWaypoints/Picker.lua?raw";
import exploreJson from "@/games/wow-forever/data/explore/explore.json";
import { explorerAddonDataLua } from "@/games/wow-forever/lib/explorerAddon/explorerAddonDataLua";
import { explorerAddonZip } from "@/games/wow-forever/lib/explorerAddon/explorerAddonZip";
import type { ExploreData } from "@/games/wow-forever/types/explore/exploreData";
import { runAddonLua } from "@/test/addonLua/runAddonLua";
import { WOW_EXPLORER_STUBS } from "@/test/addonLua/wowExplorerStubs.lua";

const DATA = exploreJson as unknown as ExploreData;
const TIRISFAL = 1420;
const DUROTAR = 1411;
const ELWYNN = 1429;
const DEATHKNELL = 1037;
const BRILL = 1043;
const UNDERCITY = 1045;
const TIRISFAL_ACHIEVEMENT = 768;

/** Helpers every scenario shares: stand on a zone map (percent) in that zone, find an area, and print values. */
const PRELUDE = `
local W, M = MGAWaypoints, MGAExplorer
function stand(map, x, y) local s = W.WorldSpot(map, x, y); at = { x = s.wx, y = s.wy, c = s.c }; bestMap = map end
function area(criteria)
  for _, zone in ipairs(M.Zones()) do
    for _, a in ipairs(zone.areas) do if a.criteria == criteria then return a end end
  end
end
function standOn(criteria) local a = area(criteria); stand(a.zone.map, a.x, a.y) end
function exploreZone(map)
  for _, c in ipairs(MGAExplorerData.continents) do
    for _, zone in ipairs(c.zones) do
      if map == nil or zone.map == map then for _, a in ipairs(zone.areas) do discovered[a[1]] = true end end
    end
  end
end
function plain(text) return (text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end
function say(v) table.insert(out, tostring(v)) end
function target() local t = W.Target(); return t and t.name or "none" end
`;

/** Loads MGA Waypoints, then MGA Explorer (login included), runs `scenario`, and returns what it printed. */
function run(scenario: string): string[] {
  return runAddonLua(
    [
      ["MGAWaypoints/MGAHub.lua", waypointsHub],
      ["MGAWaypoints/Data.lua", waypointsData],
      ["MGAWaypoints/Core.lua", waypointsCore],
      ["MGAWaypoints/Display.lua", waypointsDisplay],
      ["MGAWaypoints/Picker.lua", waypointsPicker],
      ["MGAWaypoints/MGAWaypoints.lua", waypointsMain],
      ["MGAExplorer/MGAHub.lua", explorerHub],
      ["MGAExplorer/Data.lua", explorerData],
      ["MGAExplorer/Core.lua", explorerCore],
      ["MGAExplorer/MapPins.lua", explorerMapPins],
      ["MGAExplorer/Window.lua", explorerWindow],
      ["MGAExplorer/MGAExplorer.lua", explorerMain],
      ["prelude", PRELUDE],
      ["login", `fire("PLAYER_LOGIN"); clear()`],
      ["scenario", `local W, M = MGAWaypoints, MGAExplorer
${scenario}`],
    ],
    WOW_EXPLORER_STUBS,
  );
}

const withoutChat = (lines: string[]): string[] => lines.filter((l) => !l.startsWith("chat"));

describe("MGA Explorer files", () => {
  it("Data.lua is the site's Explorer data (npx vitest run -u rewrites it)", async () => {
    await expect(explorerAddonDataLua(DATA)).toMatchFileSnapshot("../../addon/MGAExplorer/Data.lua");
  });

  it("Data.lua carries every zone and area Explore Azeroth counts, each on a map MGA Waypoints knows", () => {
    const lines = run(`
      local zones, areas, unknown = 0, 0, 0
      for _, zone in ipairs(M.Zones()) do
        zones = zones + 1
        if not MGAWaypointsData.zones[zone.map] then unknown = unknown + 1 end
        areas = areas + #zone.areas
      end
      say(zones); say(areas); say(unknown)
    `);
    const areas = DATA.continents.flatMap((c) => c.zones).reduce((n, z) => n + z.areas.length, 0);
    expect(lines).toEqual(["43", String(areas), "0"]);
  });

  it("loads from its toc on the Forever interface after MGA Waypoints, hub first", () => {
    expect(explorerToc).toContain("## Interface: 16001");
    expect(explorerToc).toContain("## Dependencies: MGAWaypoints");
    expect(explorerToc).toContain("## SavedVariables: MGAHubSettings, MGAExplorerSettings");
    expect(explorerToc.trim().split(/\r?\n/).slice(-6)).toEqual(["MGAHub.lua", "Data.lua", "Core.lua", "MapPins.lua", "Window.lua", "MGAExplorer.lua"]);
    expect(explorerBindings).toContain("<Bindings>");
  });

  it("zips MGA Explorer with MGA Waypoints beside it", () => {
    const paths = Object.keys(unzipSync(explorerAddonZip()));
    expect([...new Set(paths.map((path) => path.split("/")[0]))].sort()).toEqual(["MGAExplorer", "MGAWaypoints"]);
    expect(paths.filter((path) => path.startsWith("MGAExplorer/") && !path.endsWith("/")).sort()).toEqual(
      ["Bindings.xml", "Core.lua", "Data.lua", "MGAExplorer.lua", "MGAExplorer.toc", "MGAHub.lua", "MapPins.lua", "Window.lua"].map((f) => `MGAExplorer/${f}`),
    );
  });
});

describe("MGA Explorer progress", () => {
  it("reads each area from the achievement API", () => {
    const lines = run(`
      discovered[${DEATHKNELL}] = true; discovered[${BRILL}] = true
      M.Refresh()
      local zone = M.ZoneForMap(${TIRISFAL})
      say(table.concat({ M.Count(zone) }, "/")); say(zone.source); say(M.Source())
    `);
    expect(lines).toEqual(["2/16", "achievements", "achievements"]);
  });

  it("matches criteria by map overlay, then by name, when the client leaves the criteria id out", () => {
    const lines = run(`
      discovered[${BRILL}] = true
      for _, mode in ipairs({ "asset", "name" }) do
        criteriaReturns = mode
        M.Refresh()
        local zone = M.ZoneForMap(${TIRISFAL})
        say(mode .. " " .. table.concat({ M.Count(zone) }, "/") .. " " .. zone.source .. " " .. tostring(M.Explored(area(${BRILL}))))
      end
    `);
    expect(lines).toEqual(["asset 1/16 achievements true", "name 1/16 achievements true"]);
  });

  it("counts a zone this character finished as all explored", () => {
    const lines = run(`
      exploreZone(${TIRISFAL})
      M.Refresh()
      say(M.ZoneDone(M.ZoneForMap(${TIRISFAL})))
    `);
    expect(lines).toEqual(["true"]);
  });

  it("reads the uncovered map when another character earned the zone, and leaves an area today's art doesn't draw unknown", () => {
    const lines = run(`
      otherCharacter[${TIRISFAL_ACHIEVEMENT}] = true
      uncovered[${DEATHKNELL}] = true
      M.Refresh()
      local zone = M.ZoneForMap(${TIRISFAL})
      say(zone.source); say(table.concat({ M.Count(zone) }, "/"))
      say(tostring(M.Explored(area(${DEATHKNELL})))); say(tostring(M.Explored(area(${BRILL})))); say(tostring(M.Explored(area(${UNDERCITY}))))
      say(M.Source())
    `);
    expect(lines).toEqual(["map", "1/16", "true", "false", "nil", "map"]);
  });

  it("falls back to the map when the achievement API is missing, and to nothing when the map won't say either", () => {
    const lines = run(`
      GetAchievementInfo = nil
      uncovered[${BRILL}] = true
      M.Refresh()
      say(M.Source()); say(tostring(M.Explored(area(${BRILL}))))
      C_MapExplorationInfo = nil
      M.Refresh()
      say(M.Source()); say(tostring(M.Explored(area(${BRILL}))))
      standOn(${BRILL})
      say(M.Next().name)
    `);
    expect(lines).toEqual(["map", "true", "none", "nil", "Brill"]);
  });

  it("sends you to an area the map can't report only when nothing else is left", () => {
    const lines = run(`
      GetAchievementInfo = nil
      for _, c in ipairs(MGAExplorerData.continents) do
        for _, zone in ipairs(c.zones) do for _, a in ipairs(zone.areas) do uncovered[a[1]] = true end end
      end
      uncovered[${BRILL}] = nil
      M.Refresh()
      standOn(${UNDERCITY})
      say(M.Next().name)
      uncovered[${BRILL}] = true
      M.Refresh()
      say(M.Next().name)
    `);
    expect(lines).toEqual(["Brill", "Undercity"]);
  });

  it("survives an achievement API that errors", () => {
    const lines = run(`
      GetAchievementCriteriaInfo = function() error("boom") end
      uncovered[${BRILL}] = true
      M.Refresh()
      say(M.Source())
    `);
    expect(lines).toEqual(["map"]);
  });
});

describe("MGA Explorer guidance", () => {
  it("picks the nearest unexplored area in the zone you are in and points MGA Waypoints at it", () => {
    const lines = run(`
      M.Refresh()
      stand(${TIRISFAL}, 30, 68)
      M.GuideNext()
      say(target()); say(W.Target().kind); say(W.Target().map)
    `);
    expect(lines).toEqual([
      "chat: MGA Explorer: Guiding you to Deathknell in Tirisfal Glades (32.8, 64.3). 0 of 16 explored there.",
      "Deathknell",
      "explore",
      String(TIRISFAL),
    ]);
  });

  it("leaves a finished zone for the nearest area on your continent", () => {
    const lines = run(`
      exploreZone(${TIRISFAL})
      M.Refresh()
      stand(${TIRISFAL}, 30, 68)
      local next = M.Next()
      say(next.zone.continent); say(next.zone.name ~= "Tirisfal Glades")
    `);
    expect(lines).toEqual(["0", "true"]);
  });

  it("announces a discovery and moves the arrow on to the next area by itself", () => {
    const lines = run(`
      M.Refresh()
      stand(${TIRISFAL}, 30, 68)
      M.GuideNext()
      clear()
      discovered[${DEATHKNELL}] = true
      fire("CRITERIA_UPDATE")
      say(target())
      tick(1)
      say(target()); say(M.guiding.name)
    `);
    expect(lines[0]).toBe("Deathknell");
    expect(lines[1]).toBe("chat: MGA Explorer: Discovered Deathknell (1 of 16 in Tirisfal Glades).");
    expect(lines[2]).toMatch(/^chat: MGA Explorer: Guiding you to .+ in Tirisfal Glades/);
    expect(lines[3]).not.toBe("Deathknell");
    expect(lines[3]).toBe(lines[4]);
  });

  it("stops at a discovery when Move on by itself is off", () => {
    const lines = run(`
      M.Settings().autoNext = false
      M.Refresh()
      stand(${TIRISFAL}, 30, 68)
      M.GuideNext()
      discovered[${DEATHKNELL}] = true
      M.Update()
      say(target()); say(tostring(M.guiding))
    `);
    expect(withoutChat(lines)).toEqual(["none", "nil"]);
  });

  it("lets another target end the guiding, but keeps guiding through Waypoints' arrival clear", () => {
    const lines = run(`
      M.Refresh()
      standOn(${DEATHKNELL})
      M.Guide(area(${DEATHKNELL}))
      W.Clear()
      say(M.guiding and M.guiding.name or "nil")
      M.Guide(area(${DEATHKNELL}))
      W.SetTarget({ name = "Someone", kind = "class", map = ${TIRISFAL}, x = 60, y = 50 })
      say(tostring(M.guiding))
      M.Guide(area(${DEATHKNELL}))
      stand(${DUROTAR}, 50, 50)
      W.Clear()
      say(tostring(M.guiding))
    `);
    expect(withoutChat(lines)).toEqual(["Deathknell", "nil", "nil"]);
  });

  it("Stop clears its own arrow but never someone else's", () => {
    const lines = run(`
      M.Refresh()
      M.Guide(area(${BRILL}))
      M.Stop()
      say(target())
      W.SetTarget({ name = "Someone", kind = "class", map = ${TIRISFAL}, x = 60, y = 50 })
      M.Stop()
      say(target())
    `);
    expect(withoutChat(lines)).toEqual(["none", "Someone"]);
  });

  it("picks guiding back up after a reload when the arrow still points at its area", () => {
    const lines = run(`
      M.Refresh()
      M.Guide(area(${BRILL}))
      M.guiding = nil
      M.Restore()
      say(M.guiding.name)
      M.guiding = nil
      W.Clear()
      M.Restore()
      say(tostring(M.guiding)); say(tostring(M.Settings().target))
    `);
    expect(withoutChat(lines)).toEqual(["Brill", "nil", "nil"]);
  });

  it("says when everything is explored", () => {
    const lines = run(`
      exploreZone(nil)
      M.Refresh()
      say(tostring(M.GuideNext()))
    `);
    expect(lines).toEqual(["chat: MGA Explorer: Every area Explore Azeroth counts is explored.", "false"]);
  });
});

describe("MGA Explorer window and lists", () => {
  it("lists your continent first, the zone you are in first, and finished zones last", () => {
    const lines = run(`
      exploreZone(${ELWYNN})
      M.Refresh()
      stand(${DUROTAR}, 50, 50)
      local list = M.SortedZones()
      say(list[1].name); say(list[20].continent); say(list[21].continent); say(list[43].name)
      stand(${TIRISFAL}, 50, 50)
      say(M.SortedZones()[1].name)
    `);
    expect(lines).toEqual(["Durotar", "1", "0", "Elwynn Forest", "Tirisfal Glades"]);
  });

  it("shows continent counts and opens a zone to its unexplored areas", () => {
    const lines = run(`
      discovered[${DEATHKNELL}] = true
      M.Refresh()
      stand(${TIRISFAL}, 50, 50)
      local lines = M.Lines({ [${TIRISFAL}] = true })
      for i = 1, 4 do say(lines[i].kind .. " " .. plain(lines[i].text)) end
      local areas = 0
      for _, l in ipairs(lines) do if l.kind == "area" then areas = areas + 1 end end
      say(areas)
      say(M.Summary())
    `);
    expect(lines).toEqual([
      "continent Eastern Kingdoms: 0 of 23 zones",
      "zone - Tirisfal Glades  1/16  (you are here)",
      "area       Agamand Mills  (49.6, 35.8)",
      "area       Brill  (60.2, 53.3)",
      "15",
      "Explore Azeroth: Eastern Kingdoms 0/23 zones, Kalimdor 0/20 zones",
    ]);
  });

  it("opens from the slash command with your zone open; a zone row folds it, an area row guides", () => {
    const lines = run(`
      M.Refresh()
      stand(${TIRISFAL}, 50, 50)
      local function slash(msg) SlashCmdList.MGAEXPLORER(msg) end
      slash("")
      say(MGAExplorerWindow.shownFlag)
      say(plain(MGAExplorerRow2.text.text))
      MGAExplorerRow3.scripts.OnClick(MGAExplorerRow3)
      say(target())
      MGAExplorerRow2.scripts.OnClick(MGAExplorerRow2)
      say(MGAExplorerRow3.line.kind)
      slash("stop"); say(target())
      slash("next"); say(target() ~= "none")
    `);
    expect(withoutChat(lines)).toEqual(["true", "- Tirisfal Glades  0/16  (you are here)", "Deathknell", "zone", "none", "true"]);
  });

  it("sits in the MGA menu with Next and Stop", () => {
    const lines = run(`
      M.Refresh()
      stand(${TIRISFAL}, 30, 68)
      MGAHub.OpenMenu()
      local items = menuLines()
      local start
      for i, l in ipairs(items) do if l == "[Explorer]" then start = i end end
      say(items[start + 1]); say(items[start + 2]); say(items[start + 3])
      clickRow("Next unexplored area")
      MGAHub.OpenMenu()
      clickRow("Stop exploring (Deathknell)")
      say(target())
    `);
    expect(withoutChat(lines)).toEqual(["Explorer", "Next unexplored area", "Stop exploring", "none"]);
  });
});

const EASTERN_KINGDOMS_MAP = 1415;
const KALIMDOR_MAP = 1414;

/** Shows the World Map on `map` and counts the Explorer frames on it. */
const MAP_HELPERS = `
function showMap(map) mapId = map; WorldMapFrame.shownFlag = true; M.DrawMapPins() end
function shown(prefix)
  local n = 0
  for i = 1, 60 do local f = _G[prefix .. i]; if f and f.shownFlag then n = n + 1 end end
  return n
end
`;

describe("MGA Explorer on the World Map", () => {
  it("is on by default: a zone map pins every area it still needs where you discover it, with a box over the area", () => {
    const lines = run(`${MAP_HELPERS}
      say(M.Settings().mapPins); say(M.Settings().outlines)
      discovered[${DEATHKNELL}] = true
      M.Refresh()
      showMap(${TIRISFAL})
      say(shown("MGAExplorerMapPin")); say(shown("MGAExplorerMapArea"))
      local pin, box = MGAExplorerMapPin1, MGAExplorerMapArea1
      say(string.format("%s %.3f %.3f", pin.area.name, pin.point[4] / 1000, -pin.point[5] / 500))
      say(string.format("box %.3f %.3f %.3f %.3f", box.point[4] / 1000, -box.point[5] / 500, box.width / 1000, box.height / 500))
      local r = pin.area.rect
      say(r[1] <= pin.area.x and pin.area.x <= r[3] and r[2] <= pin.area.y and pin.area.y <= r[4])
    `);
    expect(withoutChat(lines)).toEqual([
      "true", "true", "15", "15",
      "Agamand Mills 0.496 0.358",
      "box 0.383 0.274 0.138 0.180",
      "true",
    ]);
  });

  it("a pin click sets the MGA Waypoints target; another zone redraws; the settings take the boxes and pins away", () => {
    const lines = run(`${MAP_HELPERS}
      M.Refresh()
      showMap(${TIRISFAL})
      MGAExplorerMapPin2.scripts.OnClick(MGAExplorerMapPin2)
      say(target()); say(W.Target().kind)
      showMap(${DUROTAR}); say(shown("MGAExplorerMapPin"))
      M.Settings().outlines = false; M.DrawMapPins(); say(shown("MGAExplorerMapArea")); say(shown("MGAExplorerMapPin"))
      M.SetMapPins(false); say(shown("MGAExplorerMapPin"))
    `);
    expect(withoutChat(lines)).toEqual(["Agamand Mills", "explore", "11", "0", "11", "0"]);
  });

  it("a continent map badges every zone with areas left with how many, at the middle of them, and a click guides into that zone", () => {
    const lines = run(`${MAP_HELPERS}
      exploreZone(${ELWYNN})
      discovered[${DEATHKNELL}] = true
      M.Refresh()
      showMap(${EASTERN_KINGDOMS_MAP})
      say(shown("MGAExplorerZoneBadge")); say(shown("MGAExplorerMapPin"))
      local tirisfal
      for i = 1, 30 do local b = _G["MGAExplorerZoneBadge" .. i]; if b and b.shownFlag and b.zone.name == "Tirisfal Glades" then tirisfal = b end end
      say(tirisfal.count.text)
      local x, y = tirisfal.point[4] / 1000, -tirisfal.point[5] / 500
      say(x > 0 and x < 1 and y > 0 and y < 1)
      for i = 1, 30 do local b = _G["MGAExplorerZoneBadge" .. i]; if b and b.shownFlag and b.zone.name == "Elwynn Forest" then say("elwynn badged") end end
      stand(${TIRISFAL}, 30, 68)
      tirisfal.scripts.OnClick(tirisfal)
      say(M.guiding.zone.name)
      showMap(${KALIMDOR_MAP}); say(shown("MGAExplorerZoneBadge"))
    `);
    expect(withoutChat(lines)).toEqual(["22", "0", "15", "true", "Tirisfal Glades", "20"]);
  });

  it("puts a zone badge where its areas are on the continent", () => {
    const lines = run(`
      M.Refresh()
      local badges = M.ZoneBadges(${EASTERN_KINGDOMS_MAP})
      local byName = {}
      for _, b in ipairs(badges) do byName[b.zone.name] = b end
      local tirisfal, stranglethorn = byName["Tirisfal Glades"], byName["Stranglethorn Vale"]
      say(tirisfal.y < stranglethorn.y)
      say(#M.ZoneBadges(${TIRISFAL}))
    `);
    expect(lines).toEqual(["true", "0"]);
  });
});
