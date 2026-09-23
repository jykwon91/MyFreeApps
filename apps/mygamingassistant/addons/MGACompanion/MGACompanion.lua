-- MGA Companion — in-game waypoints for the MyGamingAssistant World Map.
--
--   /mga way <uiMapID> <x> <y> [label]     e.g. /mga way 1429 44.4 66.2 Maximillian Crowe
--   /mga way <zone name> <x> <y> [label]   e.g. /mga way Elwynn Forest 44.4 66.2
--   /mga clear                             remove the pin
--   /mga                                   help
--
-- Uses the client's own map pin: C_Map.SetUserWaypoint + C_SuperTrack.
-- Coordinates are map percent (0-100), the same numbers the site shows.

local ADDON = "MGA Companion"
local PREFIX = "|cff33aaff" .. ADDON .. ":|r "
local MAX_MAP_ID = 5000 -- WoW Forever map ids stay well below this

local function say(message)
  DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. message)
end

local function trim(text)
  return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

local mapIdsByName -- built on first zone-name lookup

local function findMapByName(name)
  if not (C_Map and C_Map.GetMapInfo) then
    return nil
  end
  if not mapIdsByName then
    mapIdsByName = {}
    for id = 1, MAX_MAP_ID do
      local info = C_Map.GetMapInfo(id)
      local key = info and info.name and info.name:lower()
      -- The first id wins: the client lists the playable map before its copies.
      if key and not mapIdsByName[key] then
        mapIdsByName[key] = id
      end
    end
  end
  return mapIdsByName[name:lower()]
end

local function parseWay(args)
  -- "<id or zone name> <x> <y> [label]" — x and y are the first two numbers after the zone.
  local zone, x, y, label = args:match("^(.-)%s+(%d+%.?%d*)[%s,]+(%d+%.?%d*)%s*(.*)$")
  if not zone or zone == "" then
    return nil
  end
  local mapId = tonumber(zone) or findMapByName(trim(zone))
  return mapId, tonumber(x), tonumber(y), trim(label or ""), zone
end

local function setWaypoint(args)
  local mapId, x, y, label, zoneText = parseWay(args)
  if not x then
    say("Usage: /mga way <map id or zone name> <x> <y> [label]")
    return
  end
  if not mapId then
    say("I don't know the zone \"" .. trim(zoneText) .. "\". Copy the command from the site — it uses the map id.")
    return
  end
  if x < 0 or x > 100 or y < 0 or y > 100 then
    say("Coordinates must be between 0 and 100.")
    return
  end
  if not (C_Map and C_Map.SetUserWaypoint and C_Map.CanSetUserWaypointOnMap and UiMapPoint) then
    say("This game client has no map pins. Use a coordinate addon such as TomTom with /way instead.")
    return
  end
  if not C_Map.CanSetUserWaypointOnMap(mapId) then
    local info = C_Map.GetMapInfo(mapId)
    local name = (info and info.name) or ("map " .. mapId)
    say("Can't place a pin on " .. name .. " (cities and some zones don't allow it). Try the zone around it, or use TomTom's /way.")
    return
  end
  C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(mapId, x / 100, y / 100))
  if C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then
    C_SuperTrack.SetSuperTrackedUserWaypoint(true)
  end
  local link = C_Map.GetUserWaypointHyperlink and C_Map.GetUserWaypointHyperlink()
  local where = string.format("%.1f, %.1f", x, y)
  if label ~= "" then
    where = label .. " (" .. where .. ")"
  end
  say("Pin set: " .. where .. (link and (" " .. link) or ""))
end

local function clearWaypoint()
  if C_Map and C_Map.ClearUserWaypoint then
    C_Map.ClearUserWaypoint()
    say("Pin removed.")
  end
end

local function help()
  say("/mga way <map id or zone> <x> <y> [label] — pin a spot on your map")
  say("/mga clear — remove the pin")
  say("Copy ready-made commands from the World Map on mygamingassistant.myfreeapps.org")
end

SLASH_MGACOMPANION1 = "/mga"
SlashCmdList.MGACOMPANION = function(input)
  local command, rest = trim(input or ""):match("^(%S*)%s*(.*)$")
  command = (command or ""):lower()
  if command == "way" then
    setWaypoint(rest or "")
  elseif command == "clear" then
    clearWaypoint()
  else
    help()
  end
end
