import { WOW_HUB_FRAME_STUBS, WOW_HUB_HELPERS } from "@/test/addonLua/wowHubStubs.lua";

/**
 * Just enough of the WoW Forever client API for the MGA PvP Log addon to run under fengari. Forever hides the
 * combat log from addons, so there is none here: CombatLogGetCurrentEventInfo throws, as the client's block does.
 *
 * Tests move `clock` (what `time()` says), set `people[guid]` (what GetPlayerInfoByGUID knows), `zone` /
 * `subzone`, then show the addon players with `sight(token, spec)` (spec: guid, name, realm, level, guild,
 * combat, targetsMe, enemy = false for a friend, player = false for an NPC, dead) or `fighter(token, guid,
 * name, extra)` (a hostile player in combat with you), give it a death recap with `recap(source, spell,
 * event)` and `PLAYER_DEAD` with `fire`. `secretValues[v] = true` makes `issecretvalue(v)` true, as the client
 * does for values it hides. `tick()` runs the addon's one-second timer. Chat lines go into `out` as "chat: ...".
 */
export const WOW_PVPLOG_STUBS = `
out = {}
${WOW_HUB_FRAME_STUBS}
${WOW_HUB_HELPERS}
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(out, "chat: " .. (tostring(m):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))) end }
SlashCmdList = {}
clock = 1000
function time() return clock end
me = "Player-1-ME"
units = {}
people = {}
playerCombat, playerDead = false, false
secretValues = {}
function issecretvalue(v) return v ~= nil and secretValues[v] == true end
zone, subzone = "Stranglethorn Vale", "Booty Bay"
local function guidOf(token)
  if token == "player" then return me end
  if units[token] then return units[token].guid end
  local owner = token:match("^(.-)target$")
  if owner and owner ~= "" then return units[owner] and units[owner].targetsMe and me or nil end
  return units[token] and units[token].guid or nil
end
function UnitGUID(unit) return guidOf(unit) end
function UnitExists(unit) return units[unit] ~= nil end
function UnitName(unit) return units[unit] and units[unit].name or nil, units[unit] and units[unit].realm or nil end
function UnitIsPlayer(unit) return units[unit] ~= nil and units[unit].player ~= false end
function UnitIsEnemy(_, unit) return units[unit] ~= nil and units[unit].enemy ~= false end
function UnitIsDeadOrGhost() return playerDead end
function UnitIsDead(unit) return units[unit] ~= nil and units[unit].dead == true end
function UnitAffectingCombat(unit)
  if unit == "player" then return playerCombat end
  return units[unit] ~= nil and units[unit].combat == true
end
function UnitIsUnit(a, b)
  local x, y = guidOf(a), guidOf(b)
  return x ~= nil and x == y
end
groupSize, inRaid = 0, false
function GetNumGroupMembers() return groupSize end
function IsInRaid() return inRaid end
sounds = 0
function PlaySound() sounds = sounds + 1 end
-- Where you stand: set mapId = nil for a client with no map position; mapX / mapY are 0-1.
mapId, mapX, mapY = 1434, 0.41, 0.62
C_Map = {
  GetBestMapForUnit = function() return mapId end,
  GetPlayerMapPosition = function() return { GetXY = function() return mapX, mapY end } end,
}
function UnitLevel(unit) return units[unit] and units[unit].level or -1 end
function GetGuildInfo(unit) return units[unit] and units[unit].guild or nil end
function GetPlayerInfoByGUID(guid)
  local p = people[guid]
  if not p then return end
  return p.class, p.classFile, p.race, "Race", 2, p.name, ""
end
function GetRealZoneText() return zone end
function GetSubZoneText() return subzone end
function GetNormalizedRealmName() return "Faerlina" end
RAID_CLASS_COLORS = { WARRIOR = { r = 0.78, g = 0.61, b = 0.43 }, ROGUE = { r = 1, g = 0.96, b = 0.41 } }
-- Forever blocks addons from the combat log; the secure-only call errors for anything not Blizzard's.
function CombatLogGetCurrentEventInfo() error("blocked: CombatLogGetCurrentEventInfo is secure-only") end

-- The death recap: nil = the game has none (yet). Each recap() is a new killing blow.
recapEvents = nil
local recapCount = 0
C_DeathRecap = {
  HasRecapEvents = function() return recapEvents ~= nil end,
  GetRecapEvents = function() return recapEvents end,
}
function recap(source, spell, event, extra)
  recapCount = recapCount + 1
  local blow = { event = event or "SPELL_DAMAGE", spellId = 100 + recapCount, spellName = spell, sourceName = source, amount = 100, timestamp = clock, hideCaster = false }
  for k, v in pairs(extra or {}) do blow[k] = v end
  recapEvents = { blow }
end

-- A player shows up on a unit token, and the event the game fires for it.
function sight(token, spec)
  units[token] = spec
  if token == "target" then fire("PLAYER_TARGET_CHANGED")
  elseif token == "mouseover" then fire("UPDATE_MOUSEOVER_UNIT")
  else fire("NAME_PLATE_UNIT_ADDED", token) end
end
-- A hostile player in combat with you, targeting you.
function fighter(token, guid, name, extra)
  playerCombat = true
  local spec = { guid = guid, name = name, combat = true, targetsMe = true }
  for k, v in pairs(extra or {}) do spec[k] = v end
  sight(token, spec)
end
-- The addon's one-second timer.
function tick() MGAPvPLogEvents.scripts.OnUpdate(MGAPvPLogEvents, 1) end
function rows(filter)
  local list = {}
  for _, r in ipairs(MGAPvPLog.Rows(filter)) do table.insert(list, r.head .. " | " .. r.detail) end
  return list
end
`;
