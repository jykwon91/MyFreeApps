-- MGA Explorer, the logic: which areas Explore Azeroth still needs, which one to go to next, and what the
-- window lists. No frames here; Window.lua draws the list and MapPins.lua the World Map pins.
--
-- Data.lua holds every zone and area the challenge counts, read from the Forever client's achievement
-- criteria. Progress comes from the game itself, in this order:
--   1. the achievement API (GetAchievementInfo / GetAchievementCriteriaInfo): exactly what the challenge counts;
--   2. the map you have uncovered (C_MapExplorationInfo.GetExploredMapTextures), matched to each area's overlay;
--   3. nothing: every area shows as not known yet, and the list and guidance still work.
-- Guidance is MGA Waypoints' arrow and pins (a required dependency): MGAWaypoints.SetTarget.

MGAExplorer = MGAExplorer or {}
local M = MGAExplorer
local Data = MGAExplorerData
local W = MGAWaypoints

M.DEFAULTS = { mapPins = true, outlines = true, autoNext = true }
-- Waypoints clears its arrow on arrival. Closer than this to the area's spot, that clear is an arrival,
-- so we keep guiding until the game says the area is discovered.
M.KEEP_YARDS = 60
M.SOURCE_TEXT = {
  achievements = "Progress from your achievements.",
  map = "Progress from the map you have uncovered (the achievement list can't be read here).",
  none = "This client won't say what you have explored; every area shows as not known yet.",
}

local function say(text)
  DEFAULT_CHAT_FRAME:AddMessage("|cff33aaffMGA Explorer:|r " .. text)
end
M.Say = say

function M.Settings()
  MGAExplorerSettings = MGAExplorerSettings or {}
  for key, value in pairs(M.DEFAULTS) do
    if MGAExplorerSettings[key] == nil then MGAExplorerSettings[key] = value end
  end
  return MGAExplorerSettings
end

-- The zones ----------------------------------------------------------------------------

local zones, byMap = nil, nil

-- Every zone as a table, built once from Data.lua: { achievement, name, map, continent, continentName, areas, state, source }.
-- An area: { criteria, overlay, name, x, y, texX, texY, rect = { left, top, right, bottom }, zone }: x, y is where to go
-- (inside the rect), the rect the patch of zone map the area covers, all in percent. state[criteria] = true (explored), false (not), nil (unknown).
function M.Zones()
  if zones then return zones end
  zones, byMap = {}, {}
  for _, continent in ipairs(Data.continents) do
    for _, row in ipairs(continent.zones) do
      local zone = {
        achievement = row.achievement, name = row.name, map = row.map,
        continent = continent.continent, continentName = continent.name:gsub("^Explore ", ""),
        areas = {}, state = {}, source = "none",
      }
      for _, a in ipairs(row.areas) do
        table.insert(zone.areas, {
          criteria = a[1], overlay = a[2], name = a[3], x = a[4], y = a[5], texX = a[6], texY = a[7],
          rect = { a[8], a[9], a[10], a[11] }, zone = zone,
        })
      end
      table.insert(zones, zone)
      byMap[zone.map] = zone
    end
  end
  return zones
end

function M.ZoneForMap(map)
  M.Zones()
  return map and byMap[map] or nil
end

function M.Explored(area)
  return area.zone.state[area.criteria]
end

-- (explored, total) of a zone.
function M.Count(zone)
  local done = 0
  for _, area in ipairs(zone.areas) do
    if zone.state[area.criteria] == true then done = done + 1 end
  end
  return done, #zone.areas
end

function M.ZoneDone(zone)
  local done, total = M.Count(zone)
  return done == total
end

-- Reading progress ---------------------------------------------------------------------

-- The zone's areas from the achievement API; nil when the client won't say, or says something we can't match.
-- A zone achievement another character earned says nothing about this one, so that falls through to the map.
function M.ReadAchievement(zone)
  if not (GetAchievementInfo and GetAchievementNumCriteria and GetAchievementCriteriaInfo) then return nil end
  local ok, id, _, _, completed, _, _, _, _, _, _, _, _, earnedByMe = pcall(GetAchievementInfo, zone.achievement)
  if not ok or not id then return nil end
  local state = {}
  if completed then
    if earnedByMe == false then return nil end
    for _, area in ipairs(zone.areas) do state[area.criteria] = true end
    return state
  end
  local okCount, count = pcall(GetAchievementNumCriteria, zone.achievement)
  if not okCount or type(count) ~= "number" or count == 0 then return nil end
  local byCriteria, byAsset, byName = {}, {}, {}
  for i = 1, count do
    local okRow, name, _, done, _, _, _, _, asset, _, criteriaId = pcall(GetAchievementCriteriaInfo, zone.achievement, i)
    if okRow then
      local value = done and true or false
      if criteriaId then byCriteria[criteriaId] = value end
      if asset then byAsset[asset] = value end
      if name then byName[name] = value end
    end
  end
  for _, area in ipairs(zone.areas) do
    local value = byCriteria[area.criteria]
    if value == nil then value = byAsset[area.overlay] end
    if value == nil then value = byName[area.name] end
    if value == nil then return nil end
    state[area.criteria] = value
  end
  return state
end

-- The zone's areas from the map you have uncovered, by overlay offset; nil when the client won't say.
-- An area today's map art doesn't draw (a city inside the zone) stays unknown.
function M.ReadMap(zone)
  if not (C_MapExplorationInfo and C_MapExplorationInfo.GetExploredMapTextures) then return nil end
  local ok, textures = pcall(C_MapExplorationInfo.GetExploredMapTextures, zone.map)
  if not ok or type(textures) ~= "table" then return nil end
  local seen = {}
  for _, t in ipairs(textures) do
    if t.offsetX and t.offsetY then seen[t.offsetX .. ":" .. t.offsetY] = true end
  end
  local state = {}
  for _, area in ipairs(zone.areas) do
    if area.texX then state[area.criteria] = seen[area.texX .. ":" .. area.texY] == true end
  end
  return state
end

-- Re-reads every zone. Returns the areas that turned explored since the last read.
function M.Refresh()
  local found = {}
  for _, zone in ipairs(M.Zones()) do
    local state, source = M.ReadAchievement(zone), "achievements"
    if not state then state, source = M.ReadMap(zone), "map" end
    if not state then state, source = {}, "none" end
    for _, area in ipairs(zone.areas) do
      if state[area.criteria] == true and zone.state[area.criteria] == false then table.insert(found, area) end
    end
    zone.state, zone.source = state, source
  end
  return found
end

-- The weakest source any zone was read with: what the window says progress comes from.
function M.Source()
  local worst = "achievements"
  for _, zone in ipairs(M.Zones()) do
    if zone.source == "none" then return "none" end
    if zone.source == "map" then worst = "map" end
  end
  return worst
end

-- Where you are -------------------------------------------------------------------------

function M.CurrentZone()
  return M.ZoneForMap(W.CurrentMap())
end

local function playerContinent()
  local me = W.PlayerSpot()
  if me then return me.c end
  local zone = M.CurrentZone()
  return zone and zone.continent or nil
end

function M.Spot(area)
  return W.WorldSpot(area.zone.map, area.x, area.y)
end

function M.Coords(area)
  return string.format("%.1f, %.1f", area.x, area.y)
end

-- What's left and where to go next -------------------------------------------------------

-- The nearest area not explored yet: in the zone you're in first, then the nearest on your continent,
-- then the first left anywhere; areas the client can't report come after all of those. `skip` (an area) is passed over.
function M.Next(skip)
  local me = W.PlayerSpot()
  local here = M.CurrentZone()
  local best, bestRank, bestYards
  for _, zone in ipairs(M.Zones()) do
    for _, area in ipairs(zone.areas) do
      if area ~= skip and zone.state[area.criteria] ~= true then
        local spot = M.Spot(area)
        local yards = (me and spot) and W.Yards(me, spot) or math.huge
        local rank = 3
        if zone == here then rank = 1 elseif yards < math.huge then rank = 2 end
        -- An area the client can't report (read from the map, where today's art doesn't draw it) never turns explored, so it goes last.
        if zone.state[area.criteria] == nil and zone.source ~= "none" then rank = rank + 3 end
        if not best or rank < bestRank or (rank == bestRank and yards < bestYards) then
          best, bestRank, bestYards = area, rank, yards
        end
      end
    end
  end
  return best
end

M.guiding = nil

local function isOurs(target, area)
  return target and area and target.kind == "explore" and target.name == area.name and target.map == area.zone.map
end

-- Points MGA Waypoints' arrow and pins at an area.
function M.Guide(area)
  M.guiding = area
  M.Settings().target = area.criteria
  W.SetTarget({ name = area.name, kind = "explore", map = area.zone.map, x = area.x, y = area.y, zone = area.zone.name })
  local done, total = M.Count(area.zone)
  say(string.format("Guiding you to %s in %s (%s). %d of %d explored there.", area.name, area.zone.name, M.Coords(area), done, total))
end

-- Guides to the next area; false when everything is explored.
function M.GuideNext(skip)
  local area = M.Next(skip)
  if not area then
    M.Stop(true)
    say("Every area Explore Azeroth counts is explored.")
    return false
  end
  M.Guide(area)
  return true
end

-- Stops guiding, and clears the arrow when it still points at our area.
function M.Stop(quiet)
  local area = M.guiding
  M.guiding = nil
  M.Settings().target = nil
  if area and isOurs(W.Target(), area) then W.Clear() end
  if area and not quiet then say("Stopped guiding.") end
end

-- After a refresh: an area you just discovered is announced, and the one being guided to moves on.
function M.AfterRefresh(found)
  for _, area in ipairs(found) do
    local done, total = M.Count(area.zone)
    say(string.format("Discovered %s (%d of %d in %s).", area.name, done, total, area.zone.name))
  end
  local area = M.guiding
  if not (area and M.Explored(area) == true) then return end
  if M.Settings().autoNext then
    M.GuideNext()
  else
    M.Stop(true)
  end
end

-- MGA Waypoints changed its target: someone else's target (or a right-click clear) ends our guiding,
-- except the clear Waypoints makes when you arrive.
function M.OnWaypointsChange()
  local area = M.guiding
  if not area then return end
  local target = W.Target()
  if isOurs(target, area) then return end
  if not target then
    local me, spot = W.PlayerSpot(), M.Spot(area)
    if me and spot and W.Yards(me, spot) <= M.KEEP_YARDS then return end
  end
  M.guiding = nil
  M.Settings().target = nil
end

-- Picks guiding back up after a /reload when the arrow still points at one of our areas.
function M.Restore()
  local saved = M.Settings().target
  if not saved then return end
  local target = W.Target()
  for _, zone in ipairs(M.Zones()) do
    for _, area in ipairs(zone.areas) do
      if area.criteria == saved and isOurs(target, area) then
        M.guiding = area
        return
      end
    end
  end
  M.Settings().target = nil
end

-- The window's lines ------------------------------------------------------------------------

-- Zones in the window's order: your continent first; in it the zone you're in first, then the ones
-- still to do, then the finished ones, by name.
function M.SortedZones()
  local here, continent = M.CurrentZone(), playerContinent()
  local list = {}
  for _, zone in ipairs(M.Zones()) do table.insert(list, zone) end
  table.sort(list, function(a, b)
    local ac, bc = a.continent == continent and 0 or 1, b.continent == continent and 0 or 1
    if ac ~= bc then return ac < bc end
    if a.continent ~= b.continent then return a.continent < b.continent end
    local ah, bh = a == here and 0 or 1, b == here and 0 or 1
    if ah ~= bh then return ah < bh end
    local ad, bd = M.ZoneDone(a) and 1 or 0, M.ZoneDone(b) and 1 or 0
    if ad ~= bd then return ad < bd end
    return a.name < b.name
  end)
  return list
end

local function continentCount(continent)
  local done, total = 0, 0
  for _, zone in ipairs(M.Zones()) do
    if zone.continent == continent then
      total = total + 1
      if M.ZoneDone(zone) then done = done + 1 end
    end
  end
  return done, total
end

-- One line per continent and zone; an expanded zone (expanded[map] = true) also lists the areas it still needs.
-- A line: { text, kind = "continent" | "zone" | "area" | "note", zone, area }.
function M.Lines(expanded)
  local lines = {}
  local here = M.CurrentZone()
  local lastContinent
  for _, zone in ipairs(M.SortedZones()) do
    if zone.continent ~= lastContinent then
      lastContinent = zone.continent
      local done, total = continentCount(zone.continent)
      table.insert(lines, { kind = "continent", text = string.format("|cffffd100%s: %d of %d zones|r", zone.continentName, done, total) })
    end
    local done, total = M.Count(zone)
    local open = expanded[zone.map] and true or false
    local text = string.format("%s %s  %d/%d", open and "-" or "+", zone.name, done, total)
    if done == total then text = "|cff66cc66" .. text .. "  explored|r" end
    if zone == here then text = text .. "  |cff33aaff(you are here)|r" end
    table.insert(lines, { kind = "zone", zone = zone, text = text })
    if open then
      local left = 0
      for _, area in ipairs(zone.areas) do
        local state = zone.state[area.criteria]
        if state ~= true then
          left = left + 1
          local mark = (M.guiding == area) and "  |cff33aaff<- guiding|r" or ""
          local unknown = state == nil and "  |cff999999(not known yet)|r" or ""
          table.insert(lines, { kind = "area", area = area, text = string.format("      %s  (%s)%s%s", area.name, M.Coords(area), unknown, mark) })
        end
      end
      if left == 0 then table.insert(lines, { kind = "note", text = "      Every area here is explored." }) end
    end
  end
  return lines
end

-- "Explore Azeroth: Eastern Kingdoms 3/23 zones, Kalimdor 1/20 zones".
function M.Summary()
  local parts = {}
  for _, continent in ipairs(Data.continents) do
    local done, total = continentCount(continent.continent)
    table.insert(parts, string.format("%s %d/%d zones", continent.name:gsub("^Explore ", ""), done, total))
  end
  return Data.name .. ": " .. table.concat(parts, ", ")
end

-- The zones with areas left, for a continent map: { zone, left, x, y } with x, y (0-1 of that map) the middle of the
-- areas still to find. Empty on any other map.
function M.ZoneBadges(map)
  local badges = {}
  local continent
  for c, continentMap in pairs(W.CONTINENT_MAPS) do
    if continentMap == map then continent = c end
  end
  if continent == nil then return badges end
  for _, zone in ipairs(M.Zones()) do
    if zone.continent == continent then
      local left, sx, sy = 0, 0, 0
      for _, area in ipairs(zone.areas) do
        local spot = zone.state[area.criteria] ~= true and M.Spot(area)
        local x, y = nil, nil
        if spot then x, y = W.MapPoint(spot, map) end
        if x then left, sx, sy = left + 1, sx + x, sy + y end
      end
      if left > 0 then table.insert(badges, { zone = zone, left = left, x = sx / left, y = sy / left }) end
    end
  end
  return badges
end

-- Guides to the nearest area a zone still needs.
function M.GuideInZone(zone)
  local me = W.PlayerSpot()
  local best, bestYards
  for _, area in ipairs(zone.areas) do
    if zone.state[area.criteria] ~= true then
      local spot = M.Spot(area)
      local yards = (me and spot) and W.Yards(me, spot) or math.huge
      if not best or yards < bestYards then best, bestYards = area, yards end
    end
  end
  if best then M.Guide(best) end
end

-- The unexplored areas of a zone map, for the World Map pins.
function M.PinsFor(map)
  local zone = M.ZoneForMap(map)
  local pins = {}
  if not zone then return pins end
  for _, area in ipairs(zone.areas) do
    if zone.state[area.criteria] ~= true then table.insert(pins, area) end
  end
  return pins
end
