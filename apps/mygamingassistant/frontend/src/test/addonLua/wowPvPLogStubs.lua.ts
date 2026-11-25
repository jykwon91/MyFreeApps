import { WOW_HUB_FRAME_STUBS, WOW_HUB_HELPERS } from "@/test/addonLua/wowHubStubs.lua";

/**
 * Just enough of the WoW client API for the MGA PvP Log addon to run under fengari. Tests move `clock`
 * (what `time()` says), set `people[guid]` (what GetPlayerInfoByGUID knows), `units[token]` (what a target /
 * mouseover is), `zone` / `subzone`, then feed combat log events with `enemyHits`, `youHit`, `youKill` and
 * call `fire(event)`. Chat lines go into `out` as "chat: ...".
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
zone, subzone = "Stranglethorn Vale", "Booty Bay"
function UnitGUID(unit)
  if unit == "player" then return me end
  return units[unit] and units[unit].guid or nil
end
function UnitLevel(unit) return units[unit] and units[unit].level or 60 end
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
COMBATLOG_OBJECT_TYPE_PLAYER = 0x400
COMBATLOG_OBJECT_REACTION_HOSTILE = 0x40
HOSTILE_PLAYER, FRIENDLY_PLAYER, NEUTRAL_PLAYER, HOSTILE_NPC = 0x548, 0x511, 0x528, 0xa48
local current = {}
function CombatLogGetCurrentEventInfo() return table.unpack(current) end
local function feed(...)
  current = { ... }
  fire("COMBAT_LOG_EVENT_UNFILTERED")
end
-- A source hits you: spell nil = a melee swing.
function enemyHits(guid, name, flags, spell, amount)
  if spell then
    feed(clock, "SPELL_DAMAGE", false, guid, name, flags, 0, me, "Me", FRIENDLY_PLAYER, 0, 133, spell, 4, amount or 100)
  else
    feed(clock, "SWING_DAMAGE", false, guid, name, flags, 0, me, "Me", FRIENDLY_PLAYER, 0, amount or 100, 0)
  end
end
function youHit(guid, name, flags, spell, amount)
  feed(clock, "SPELL_DAMAGE", false, me, "Me", FRIENDLY_PLAYER, 0, guid, name, flags, 0, 133, spell or "Hamstring", 1, amount or 50)
end
function youKill(guid, name, flags)
  feed(clock, "PARTY_KILL", false, me, "Me", FRIENDLY_PLAYER, 0, guid, name, flags, 0)
end
function rows(filter)
  local list = {}
  for _, r in ipairs(MGAPvPLog.Rows(filter)) do table.insert(list, r.head .. " | " .. r.detail) end
  return list
end
`;
