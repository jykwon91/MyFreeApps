-- MGA PvP Log, the log itself: which enemy players hit you or got hit by you, how each fight ended, and
-- what the window shows. No frames here; MGAPvPLog.lua feeds it combat log events and Window.lua draws it.
--
-- Saved per character in MGAPvPLogDB = { version, settings = { chat }, log = { entry... }, enemies = { [guid] = enemy } }.
--   enemy: name, race, class, classFile, level, guild (only what the game told us), firstSeen, lastSeen,
--          taken / dealt (damage they did to you / you did to them), killedYou, youKilled, fights.
--   entry: guid, outcome ("killedMe" | "iKilled" | "fought"), spell, zone, time, taken, dealt.
-- The log keeps the last MAX_LOG entries; an enemy with no entry left in it is forgotten, totals included.

MGAPvPLog = MGAPvPLog or {}
local M = MGAPvPLog

M.MAX_LOG = 200
M.FIGHT_WINDOW = 60 -- seconds without a hit before a fight counts as over
M.KILL_WINDOW = 10 -- a death is blamed on whoever hit you in the last this many seconds

local TYPE_PLAYER = COMBATLOG_OBJECT_TYPE_PLAYER or 0x400
local REACTION_HOSTILE = COMBATLOG_OBJECT_REACTION_HOSTILE or 0x40
local DAMAGE_SPELL_EVENTS = {
  SPELL_DAMAGE = true, RANGE_DAMAGE = true, SPELL_PERIODIC_DAMAGE = true, DAMAGE_SHIELD = true, DAMAGE_SPLIT = true,
}

local pending = {} -- guid -> the fight in progress: first, last, taken, dealt, zone, spell, lastSpellDealt, lastHitMe

local function hasFlag(flags, bit)
  return flags ~= nil and math.floor(flags / bit) % 2 == 1
end

local function hostilePlayer(flags)
  return hasFlag(flags, TYPE_PLAYER) and hasFlag(flags, REACTION_HOSTILE)
end

function M.DB()
  MGAPvPLogDB = MGAPvPLogDB or {}
  local d = MGAPvPLogDB
  d.version = d.version or 1
  d.settings = d.settings or {}
  if d.settings.chat == nil then d.settings.chat = true end
  d.log = d.log or {}
  d.enemies = d.enemies or {}
  return d
end

local function ownRealm()
  if GetNormalizedRealmName then return GetNormalizedRealmName() end
  return (GetRealmName():gsub("[%s%-]", ""))
end

-- "Name-Realm" is "Name" on your own realm.
local function cleanName(name)
  local base, realm = (name or "Unknown"):match("^(.-)%-(.+)$")
  if base and realm == ownRealm() then return base end
  return name or "Unknown"
end

local function currentZone()
  local zone, sub = GetRealZoneText() or "", GetSubZoneText() or ""
  if zone == "" then return sub ~= "" and sub or nil end
  if sub ~= "" and sub ~= zone then return zone .. " - " .. sub end
  return zone
end

-- Race and class from the guid; asked again until the game answers (it can't for a player never seen).
local function readPlayerInfo(guid, enemy)
  if enemy.race and enemy.class then return end
  local ok, class, classFile, race = pcall(GetPlayerInfoByGUID, guid)
  if ok and class then
    enemy.class, enemy.classFile, enemy.race = class, classFile, race
  end
end

-- Level and guild from a unit we are looking at, only for an enemy already logged.
function M.LearnUnit(unit)
  local guid = UnitGUID(unit)
  local enemy = guid and M.DB().enemies[guid]
  if not enemy then return end
  local level = UnitLevel(unit)
  if level and level > 0 then enemy.level = level end -- -1 is "??": unknown, not a level
  local guild = GetGuildInfo(unit)
  if guild then enemy.guild = guild end
end

local function noteEnemy(guid, name, now)
  local enemies = M.DB().enemies
  local enemy = enemies[guid]
  if not enemy then
    enemy = { name = cleanName(name), firstSeen = now, taken = 0, dealt = 0, killedYou = 0, youKilled = 0, fights = 0 }
    enemies[guid] = enemy
  end
  enemy.lastSeen = now
  readPlayerInfo(guid, enemy)
  return enemy
end

local function changed()
  if M.Refresh then M.Refresh() end
end

-- Forgets enemies no entry (or fight in progress) refers to.
local function prune(d)
  local keep = {}
  for _, entry in ipairs(d.log) do keep[entry.guid] = true end
  for guid in pairs(pending) do keep[guid] = true end
  for guid in pairs(d.enemies) do
    if not keep[guid] then d.enemies[guid] = nil end
  end
end

local function commit(guid, outcome, spell)
  local d = M.DB()
  local p = pending[guid]
  pending[guid] = nil
  local enemy = d.enemies[guid]
  local entry = {
    guid = guid, outcome = outcome, spell = spell, zone = p.zone, time = p.last, taken = p.taken, dealt = p.dealt,
  }
  table.insert(d.log, entry)
  enemy.fights = enemy.fights + 1
  if outcome == "killedMe" then enemy.killedYou = enemy.killedYou + 1 end
  if outcome == "iKilled" then enemy.youKilled = enemy.youKilled + 1 end
  while #d.log > M.MAX_LOG do table.remove(d.log, 1) end
  prune(d)
  changed()
  return entry, enemy
end

-- The fight with this enemy so far, started if this is its first hit.
local function fightWith(guid, name, now)
  M.Flush(now)
  local enemy = noteEnemy(guid, name, now)
  local p = pending[guid]
  if not p then
    p = { first = now, taken = 0, dealt = 0 }
    pending[guid] = p
  end
  p.last, p.zone = now, currentZone()
  if not enemy.level then
    M.LearnUnit("target")
    M.LearnUnit("mouseover")
  end
  return p, enemy
end

-- Ends the fights nothing has happened in for FIGHT_WINDOW seconds (all of them with `everything`) as "fought".
function M.Flush(now, everything)
  for guid, p in pairs(pending) do
    if everything or now - p.last > M.FIGHT_WINDOW then commit(guid, "fought", p.spell) end
  end
end

function M.TookHit(guid, name, spell, amount, now)
  local p, enemy = fightWith(guid, name, now)
  p.taken = p.taken + (amount or 0)
  enemy.taken = enemy.taken + (amount or 0)
  p.spell, p.lastHitMe = spell, now
end

function M.DealtHit(guid, name, spell, amount, now)
  local p, enemy = fightWith(guid, name, now)
  p.dealt = p.dealt + (amount or 0)
  enemy.dealt = enemy.dealt + (amount or 0)
  p.lastSpellDealt = spell
end

function M.IKilled(guid, name, now)
  local p = fightWith(guid, name, now)
  commit(guid, "iKilled", p.lastSpellDealt)
end

-- "Orc Warrior 60": whatever of race, class and level is known.
function M.Who(enemy)
  local parts = {}
  if enemy.race then table.insert(parts, enemy.race) end
  if enemy.class then table.insert(parts, enemy.class) end
  if enemy.level then table.insert(parts, tostring(enemy.level)) end
  return table.concat(parts, " ")
end

local PREFIX = "|cff33aaffMGA PvP Log:|r "

local function deathLine(enemy, entry)
  local who = M.Who(enemy)
  local line = "Killed by " .. enemy.name .. (who ~= "" and (" (" .. who .. ")") or "")
  if entry.spell then line = line .. " with " .. entry.spell end
  if entry.zone then line = line .. " in " .. entry.zone end
  return line
end

-- You died: blames whoever hit you last within KILL_WINDOW seconds, logs it and says so (if the chat line is on).
function M.Died(now)
  M.Flush(now)
  local killer
  for guid, p in pairs(pending) do
    if p.lastHitMe and now - p.lastHitMe <= M.KILL_WINDOW and (not killer or p.lastHitMe > pending[killer].lastHitMe) then
      killer = guid
    end
  end
  if not killer then return end
  local spell = pending[killer].spell
  for _, p in pairs(pending) do p.lastHitMe = nil end -- a second death event must not blame anyone again
  local entry, enemy = commit(killer, "killedMe", spell)
  if M.DB().settings.chat then DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. deathLine(enemy, entry)) end
end

-- One combat log event (the values CombatLogGetCurrentEventInfo returns).
function M.Combat(_, subevent, _, sourceGuid, sourceName, sourceFlags, _, destGuid, destName, destFlags, _, a12, a13, _, a15)
  local me = UnitGUID("player")
  if subevent == "PARTY_KILL" then
    if sourceGuid == me and hostilePlayer(destFlags) then M.IKilled(destGuid, destName, time()) end
    return
  end
  local spell, amount
  if subevent == "SWING_DAMAGE" then
    spell, amount = "Melee", a12
  elseif DAMAGE_SPELL_EVENTS[subevent] then
    spell, amount = a13, a15
  else
    return
  end
  if destGuid == me and hostilePlayer(sourceFlags) then
    M.TookHit(sourceGuid, sourceName, spell, amount, time())
  elseif sourceGuid == me and hostilePlayer(destFlags) then
    M.DealtHit(destGuid, destName, spell, amount, time())
  end
end

-- What the window shows -----------------------------------------------------------------------

M.FILTERS = {
  { id = "all", label = "All" },
  { id = "killedMe", label = "Killed me" },
  { id = "iKilled", label = "I killed" },
}

function M.Ago(seconds)
  if seconds < 60 then return "just now" end
  if seconds < 3600 then return math.floor(seconds / 60) .. " min ago" end
  if seconds < 86400 then return math.floor(seconds / 3600) .. " h ago" end
  return math.floor(seconds / 86400) .. " d ago"
end

function M.ClassColor(classFile)
  local c = classFile and RAID_CLASS_COLORS and RAID_CLASS_COLORS[classFile]
  if not c then return "|cffffffff" end
  return string.format("|cff%02x%02x%02x", math.floor(c.r * 255 + 0.5), math.floor(c.g * 255 + 0.5), math.floor(c.b * 255 + 0.5))
end

local WHAT = { killedMe = "Killed you", iKilled = "You killed them", fought = "Fought" }

-- Newest first: { head = "Name  Orc Warrior 60  <Guild>", detail = "Zone · 5 min ago · Killed you with X · killed you ×2" }.
function M.Rows(filter)
  local d, now = M.DB(), time()
  local entries = {}
  for i, entry in ipairs(d.log) do
    if filter == nil or filter == "all" or entry.outcome == filter then table.insert(entries, { entry = entry, index = i }) end
  end
  table.sort(entries, function(a, b)
    if a.entry.time ~= b.entry.time then return a.entry.time > b.entry.time end
    return a.index > b.index
  end)
  local rows = {}
  for _, item in ipairs(entries) do
    local entry = item.entry
    local enemy = d.enemies[entry.guid]
    local head = M.ClassColor(enemy.classFile) .. enemy.name .. "|r"
    local who = M.Who(enemy)
    if who ~= "" then head = head .. "  " .. who end
    if enemy.guild then head = head .. "  <" .. enemy.guild .. ">" end
    local parts = {}
    if entry.zone then table.insert(parts, entry.zone) end
    table.insert(parts, M.Ago(now - entry.time))
    local what = WHAT[entry.outcome]
    if entry.spell then what = what .. (entry.outcome == "fought" and ", last hit with " or " with ") .. entry.spell end
    table.insert(parts, what)
    if entry.taken > 0 or entry.dealt > 0 then table.insert(parts, "you took " .. entry.taken .. ", dealt " .. entry.dealt) end
    if enemy.killedYou > 0 then table.insert(parts, "killed you ×" .. enemy.killedYou) end
    if enemy.youKilled > 0 then table.insert(parts, "you killed ×" .. enemy.youKilled) end
    table.insert(rows, { head = head, detail = table.concat(parts, " · ") })
  end
  return rows
end

function M.Clear()
  local d = M.DB()
  d.log, d.enemies = {}, {}
  for guid in pairs(pending) do pending[guid] = nil end
  changed()
end
