import { WOW_WAYPOINT_STUBS } from "@/test/addonLua/wowWaypointStubs.lua";

/**
 * The MGA Waypoints stubs plus the two ways the client tells MGA Explorer what you've explored. Load them
 * after MGAExplorerData exists; the stubs read the zones from it.
 *
 * The achievement API answers from `discovered` (criteria id -> true). `otherCharacter[achievement] = true` says
 * another character earned that zone, and `criteriaReturns` picks what GetAchievementCriteriaInfo fills in:
 * "full" (criteria id and asset), "asset" (no criteria id) or "name" (neither).
 * The map answers from `uncovered` (criteria id -> true), through each area's texture offset.
 * Set `GetAchievementInfo = nil` or `C_MapExplorationInfo = nil` to take one away.
 * `tick(seconds)` runs MGA Explorer's frame updates.
 */
export const WOW_EXPLORER_STUBS = `
${WOW_WAYPOINT_STUBS}
discovered, uncovered, otherCharacter = {}, {}, {}
criteriaReturns = "full"

local function zoneOf(achievement)
  for _, continent in ipairs(MGAExplorerData.continents) do
    for _, zone in ipairs(continent.zones) do
      if zone.achievement == achievement then return zone end
    end
  end
end

function GetAchievementInfo(id)
  local zone = zoneOf(id)
  if not zone then return id, "", 10, false end
  if otherCharacter[id] then return id, zone.name, 10, true, 1, 1, 26, "", 0, "", "", false, false end
  local all = true
  for _, a in ipairs(zone.areas) do if not discovered[a[1]] then all = false end end
  return id, zone.name, 10, all, 1, 1, 26, "", 0, "", "", false, all
end

function GetAchievementNumCriteria(id)
  local zone = zoneOf(id)
  return zone and #zone.areas or 0
end

function GetAchievementCriteriaInfo(id, i)
  local a = zoneOf(id).areas[i]
  local done = discovered[a[1]] == true
  if criteriaReturns == "name" then return a[3], 43, done, 0, 1, "", 0, nil, "", nil end
  if criteriaReturns == "asset" then return a[3], 43, done, 0, 1, "", 0, a[2], "", nil end
  return a[3], 43, done, done and 1 or 0, 1, "", 0, a[2], "", a[1]
end

C_MapExplorationInfo = {
  GetExploredMapTextures = function(map)
    local list = {}
    for _, continent in ipairs(MGAExplorerData.continents) do
      for _, zone in ipairs(continent.zones) do
        if zone.map == map then
          for _, a in ipairs(zone.areas) do
            if uncovered[a[1]] and a[6] then table.insert(list, { offsetX = a[6], offsetY = a[7], textureWidth = 256, textureHeight = 256 }) end
          end
        end
      end
    end
    return list
  end,
}

function tick(seconds)
  MGAExplorerEvents.scripts.OnUpdate(MGAExplorerEvents, seconds)
end
`;
