-- MGA Waypoints, the logic: where you are, where a place is, which places the picker lists and in what
-- order, and what the arrow should point at. No frames here; Display.lua draws and Picker.lua lists.
--
-- Data.lua holds every place from the site's World Map data. A place is a row
-- {kind, name, title, map, x, y, side, tag, sub}: x and y are percent of the zone map `map`. A zone
-- {continent, wxMin, wxMax, wyMin, wyMax, name} turns that into world yards: world x runs north and
-- world y runs west, the same two numbers UnitPosition gives for you.

MGAWaypoints = MGAWaypoints or {}
local M = MGAWaypoints
local Data = MGAWaypointsData

local atan2 = math.atan2 or math.atan -- Lua 5.1 (the game) has atan2; the Lua the tests run on has atan(y, x)
local TWO_PI = 2 * math.pi

M.DEFAULTS = { arrow = true, mapPin = true, minimapPin = true, arrival = 15, otherSide = false, scope = "continent" }
M.ARRIVALS = { 5, 10, 15, 25, 40 }
M.SCOPES = { "zone", "continent", "all" }
M.SCOPE_TEXT = { zone = "This zone", continent = "This continent", all = "Everywhere" }
-- The continent maps' ids, to name a continent in "it is on Kalimdor".
local CONTINENT_MAPS = { [0] = 1415, [1] = 1414 }
local COMPASS = { "N", "NW", "W", "SW", "S", "SE", "E", "NE" }

-- What the picker lists. `kinds` are Data's place kinds; `own` limits class trainers to your class.
M.CATEGORIES = {
  { id = "class", label = "Class trainer", kinds = { "class", "pet", "demon" }, own = true },
  { id = "flight", label = "Flight master", kinds = { "flight" } },
  { id = "prof", label = "Profession", kinds = { "prof" } },
  { id = "repair", label = "Repair", kinds = { "repair" } },
  { id = "inn", label = "Innkeeper", kinds = { "inn" } },
  { id = "bank", label = "Bank / auctions", kinds = { "bank", "ah" } },
  { id = "dungeon", label = "Dungeon", kinds = { "dungeon" } },
  { id = "place", label = "Places", kinds = { "place" } },
}
M.PROFESSIONS = {
  "alchemy", "blacksmithing", "cooking", "enchanting", "engineering", "first_aid",
  "fishing", "herbalism", "leatherworking", "mining", "skinning", "tailoring",
}

local function say(text)
  DEFAULT_CHAT_FRAME:AddMessage("|cff33aaffMGA Waypoints:|r " .. text)
end
M.Say = say

function M.Settings()
  MGAWaypointsSettings = MGAWaypointsSettings or {}
  for key, value in pairs(M.DEFAULTS) do
    if MGAWaypointsSettings[key] == nil then MGAWaypointsSettings[key] = value end
  end
  return MGAWaypointsSettings
end

-- Where things are ------------------------------------------------------------------

-- The world spot of a point on a zone map (x and y in percent); nil for a map we don't know.
function M.WorldSpot(map, x, y)
  local zone = Data.zones[map]
  if not zone then return nil end
  return { c = zone[1], wx = zone[3] - (y / 100) * (zone[3] - zone[2]), wy = zone[5] - (x / 100) * (zone[5] - zone[4]) }
end

-- Where a spot falls on a zone's own map, 0-1 from the top left; nil when it is on another continent.
function M.MapPoint(spot, map)
  local zone = Data.zones[map]
  if not (zone and spot and zone[1] == spot.c) then return nil end
  return (zone[5] - spot.wy) / (zone[5] - zone[4]), (zone[3] - spot.wx) / (zone[3] - zone[2])
end

function M.CurrentMap()
  if C_Map and C_Map.GetBestMapForUnit then return C_Map.GetBestMapForUnit("player") end
  return nil
end

-- Where you stand in world yards; nil inside an instance or when the client won't say. UnitPosition
-- first, then the map position (percent) of the zone you are in turned into yards.
function M.PlayerSpot()
  if UnitPosition then
    local wx, wy, _, continent = UnitPosition("player")
    if wx and CONTINENT_MAPS[continent] then return { c = continent, wx = wx, wy = wy } end
    if wx then return nil end
  end
  local map = M.CurrentMap()
  if not (map and C_Map.GetPlayerMapPosition and Data.zones[map]) then return nil end
  local position = C_Map.GetPlayerMapPosition(map, "player")
  if not position then return nil end
  local x, y = position:GetXY()
  if not (x and y) or (x == 0 and y == 0) then return nil end
  return M.WorldSpot(map, x * 100, y * 100)
end

-- Which way you face, in radians turned counter-clockwise from north (0 when the client doesn't say).
function M.Facing()
  return (GetPlayerFacing and GetPlayerFacing()) or 0
end

function M.Yards(a, b)
  if a.c ~= b.c then return math.huge end
  return math.sqrt((a.wx - b.wx) ^ 2 + (a.wy - b.wy) ^ 2)
end

-- The direction from one spot to another, in radians counter-clockwise from north.
function M.Bearing(from, to)
  return atan2(to.wy - from.wy, to.wx - from.wx)
end

-- A bearing as seen from where you face: 0 = straight ahead, positive = to your left; -pi..pi.
function M.Relative(bearing, facing)
  local turn = (bearing - facing) % TWO_PI
  if turn > math.pi then turn = turn - TWO_PI end
  return turn
end

function M.Compass(bearing)
  local degrees = math.deg(bearing)
  return COMPASS[math.floor((degrees + 22.5) / 45) % 8 + 1]
end

function M.YardsText(yards)
  if yards == math.huge then return "other continent" end
  if yards >= 1000 then return string.format("%.1fk yd", yards / 1000) end
  return string.format("%d yd", math.floor(yards + 0.5))
end

-- The minimap's width in yards at a zoom level (0 is widest); indoors it covers less.
local OUTDOOR_YARDS = { [0] = 466.67, 400, 333.33, 266.67, 200, 133.33 }
local INDOOR_YARDS = { [0] = 300, 250, 200, 150, 100, 50 }
function M.MinimapYards(zoom, indoors)
  local table_ = indoors and INDOOR_YARDS or OUTDOOR_YARDS
  return table_[zoom] or table_[0]
end

-- Where a spot goes on the minimap: pixels right of and above its centre. `yards` is the minimap's
-- width in yards, `half` its half width in pixels; `rotate` is the minimap turning with you. A spot
-- past the edge is pulled onto it and `edge` is true. A square minimap clips at its sides, a round one at a circle.
function M.MinimapOffset(me, spot, facing, rotate, yards, half, square)
  local north, west = spot.wx - me.wx, spot.wy - me.wy
  local right, up = -west, north
  if rotate then
    right = -(-north * math.sin(facing) + west * math.cos(facing))
    up = north * math.cos(facing) + west * math.sin(facing)
  end
  local scale = half / (yards / 2)
  local x, y = right * scale, up * scale
  local reach = square and math.max(math.abs(x), math.abs(y)) or math.sqrt(x * x + y * y)
  if reach <= half then return x, y, false end
  return x * half / reach, y * half / reach, true
end

-- The places ------------------------------------------------------------------------

local places = nil

-- Every place as a table, built once from Data.lua's rows.
function M.Places()
  if places then return places end
  places = {}
  for _, row in ipairs(Data.places) do
    local zone = Data.zones[row[4]]
    local spot = M.WorldSpot(row[4], row[5], row[6])
    if zone and spot then
      table.insert(places, {
        kind = row[1], name = row[2], title = row[3], map = row[4], x = row[5], y = row[6],
        side = row[7], tag = row[8], sub = row[9], zone = zone[6], spot = spot,
      })
    end
  end
  return places
end

function M.PlayerSide()
  local faction = UnitFactionGroup and UnitFactionGroup("player")
  if faction == "Alliance" then return "A" end
  if faction == "Horde" then return "H" end
  return nil
end

local function playerClass()
  local _, token = UnitClass("player")
  return token and token:lower() or nil
end

local function categoryById(id)
  for _, category in ipairs(M.CATEGORIES) do
    if category.id == id then return category end
  end
end
M.Category = categoryById

local function inCategory(place, category, opts)
  local listed = false
  for _, kind in ipairs(category.kinds) do
    if place.kind == kind then listed = true end
  end
  if not listed then return false end
  if category.own then
    local class = playerClass()
    if place.kind == "class" then return place.tag == class end
    if place.kind == "pet" then return class == "hunter" end
    if place.kind == "demon" then return class == "warlock" end
  end
  if category.id == "prof" and opts.profession and opts.profession ~= "all" then return place.tag == opts.profession end
  return true
end

local function matchesQuery(place, words)
  local haystack = (place.name .. " " .. place.title .. " " .. place.zone .. " " .. place.sub .. " " .. tostring(place.tag)):lower()
  for _, word in ipairs(words) do
    if not haystack:find(word, 1, true) then return false end
  end
  return true
end

local function words(query)
  local list = {}
  for word in (query or ""):lower():gmatch("%S+") do table.insert(list, word) end
  return list
end

local function inScope(place, scope, me, map)
  if scope == "all" then return true end
  if scope == "zone" and map and Data.zones[map] then return place.map == map end
  if not me then return true end
  return place.spot.c == me.c
end

-- The places to list, nearest first. opts: category (id), query, scope, otherSide, profession.
-- Typing a search looks at every kind of place, everywhere, and skips the category and your class.
function M.Search(opts)
  local me = M.PlayerSpot()
  local side = M.PlayerSide()
  local category = categoryById(opts.category) or M.CATEGORIES[1]
  local terms = words(opts.query)
  local searching = #terms > 0
  local map = M.CurrentMap()
  local found = {}
  for _, place in ipairs(M.Places()) do
    local listed
    if searching then
      listed = matchesQuery(place, terms)
    else
      listed = inCategory(place, category, opts) and inScope(place, opts.scope or "continent", me, map)
    end
    if listed and (opts.otherSide or not side or place.side == "N" or place.side == side) then
      place.yards = me and M.Yards(me, place.spot) or nil
      table.insert(found, place)
    end
  end
  table.sort(found, function(a, b)
    local ay, by = a.yards or math.huge, b.yards or math.huge
    if ay ~= by then return ay < by end
    if a.name ~= b.name then return a.name < b.name end
    return a.map < b.map
  end)
  return found
end

-- The target and the step towards it -------------------------------------------------

local listeners = {}

function M.OnChange(fn)
  table.insert(listeners, fn)
end

local function changed()
  for _, fn in ipairs(listeners) do fn() end
end

-- The place being guided to: { name, kind, map, x, y, zone }, kept between sessions; nil for none.
function M.Target()
  local saved = M.Settings().target
  if not saved then return nil end
  local spot = M.WorldSpot(saved.map, saved.x, saved.y)
  if not spot then return nil end
  return { name = saved.name, kind = saved.kind, map = saved.map, x = saved.x, y = saved.y, zone = saved.zone, spot = spot }
end

function M.SetTarget(place)
  M.Settings().target = { name = place.name, kind = place.kind, map = place.map, x = place.x, y = place.y, zone = place.zone }
  changed()
end

function M.Clear()
  M.Settings().target = nil
  changed()
end

local function continentName(c)
  local zone = Data.zones[CONTINENT_MAPS[c]]
  return zone and zone[6] or "another continent"
end

-- The boat, zeppelin or tram stop nearest you that reaches the target's continent, and where it lands.
local function ride(me, target, side)
  local best
  for _, candidate in ipairs(Data.rides) do
    if candidate.side == "N" or not side or candidate.side == side then
      for _, from in ipairs(candidate.stops) do
        if from.c == me.c then
          for _, to in ipairs(candidate.stops) do
            if to.c == target.spot.c then
              local spot = { c = from.c, wx = from.wx, wy = from.wy }
              local yards = M.Yards(me, spot)
              if not best or yards < best.yards then
                best = { spot = spot, yards = yards, from = from.label, to = to.label, vehicle = candidate.vehicle, map = from.map, x = from.x, y = from.y }
              end
            end
          end
        end
      end
    end
  end
  return best
end

-- What to point at: { spot, final, hint, map, x, y } or { text } when there is nothing to point at.
-- On your continent that is the target itself. On another it is the boat or zeppelin stop that gets you
-- there; with none, no arrow, only where the place is.
function M.Step(me, target)
  if not me then return { text = "Your position isn't available here." } end
  if me.c == target.spot.c then
    return { spot = target.spot, final = true, map = target.map, x = target.x, y = target.y }
  end
  local boarding = ride(me, target, M.PlayerSide())
  if not boarding then
    return { text = target.name .. " is in " .. target.zone .. " on " .. continentName(target.spot.c) .. "." }
  end
  return {
    spot = boarding.spot,
    final = false,
    map = boarding.map, x = boarding.x, y = boarding.y,
    hint = string.format("Take the %s from %s to %s", boarding.vehicle, boarding.from, boarding.to),
  }
end

-- Sets the nearest place of a category as the target; false when there is none.
function M.GoNearest(categoryId)
  local found = M.Search({ category = categoryId, scope = "all", otherSide = false, query = "" })
  local place = found[1]
  if not place then return false end
  M.SetTarget(place)
  say("Guiding you to " .. place.name .. " in " .. place.zone .. ".")
  return true
end
