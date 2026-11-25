-- MGA PvP Log, the log itself: which enemy players fought you or killed you, and what the window shows. No
-- frames here; MGAPvPLog.lua feeds it what you can see and Window.lua draws it.
--
-- WoW Forever hides the combat log from addons (see MGAPvPLog.lua), so nothing here knows who hit you. It works
-- from what the client does hand over:
--   * a sighting: a hostile player you target, mouse over or see on a nameplate (name, level, guild, class, race);
--   * a fight: a sighting of a hostile player who is in combat while you are, and is your target or is targeting you;
--   * your killer: the game's death recap names whoever landed the killing blow. When the recap can't be read, the
--     hostile player you saw fighting you last is named instead, and always as "probably".
--
-- Saved per character in MGAPvPLogDB = { version, settings = { chat }, log = { entry... }, enemies = { [guid] = enemy } }.
--   enemy: name, race, class, classFile, level, guild (only what the game told us), firstSeen, lastSeen,
--          killedYou, youKilled, fights.
--   entry: guid, outcome ("killedMe" | "iKilled" | "fought"), spell (the killing blow, from the recap), probable
--          (true when the killer is a guess), zone, time.
-- The log keeps the last MAX_LOG entries; an enemy with no entry left in it is forgotten, totals included.

MGAPvPLog = MGAPvPLog or {}
local M = MGAPvPLog

M.MAX_LOG = 200
M.FIGHT_WINDOW = 60 -- seconds without a sighting before a fight counts as over
M.KILL_WINDOW = 10 -- with no readable recap, a death is blamed on whoever was fighting you in the last this many seconds
M.RECAP_WAIT = 3 -- seconds to wait for the death recap before guessing
M.SEEN_KEEP = 600 -- seconds a sighted player is remembered, for matching the recap's killer by name
local DEATH_DEBOUNCE = 5 -- a second death event this close to the first is the same death

local sighted = {} -- guid -> { guid, name, level, guild, race, class, classFile, first, last, seq, engagedAt }
local pending = {} -- guid -> the fight in progress: first, last, zone
local seq = 0
local awaiting -- { at } while a death waits for its recap
local resolvedAt, lastRecapSig

-- A value the client hides from addons is "secret": it can't be compared, stored or joined. Every value the client
-- hands over that it may hide goes through here first; a secret one comes back as nil.
local function open(value)
  if issecretvalue and issecretvalue(value) then return nil end
  return value
end

M.Open = open

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

M.CleanName = cleanName

local function currentZone()
  local zone, sub = GetRealZoneText() or "", GetSubZoneText() or ""
  if zone == "" then return sub ~= "" and sub or nil end
  if sub ~= "" and sub ~= zone then return zone .. " - " .. sub end
  return zone
end

-- Who a player unit is: guid and name ("Name", or "Name-Realm" from another realm). Nil for anything that is not
-- a player, or when the client keeps the identity back.
local function identity(unit)
  if open(UnitExists(unit)) ~= true or open(UnitIsPlayer(unit)) ~= true then return nil end
  local guid = open(UnitGUID(unit))
  local name, realm = UnitName(unit)
  name, realm = open(name), open(realm)
  if type(guid) ~= "string" or type(name) ~= "string" or name == "" then return nil end
  if type(realm) == "string" and realm ~= "" then name = name .. "-" .. realm end
  return guid, cleanName(name)
end

function M.PlayerName(unit)
  local _, name = identity(unit)
  return name
end

-- You in combat and the player in combat, and the fight is with you: they are your target, or you are theirs.
local function fightingMe(unit)
  if open(UnitAffectingCombat("player")) ~= true or open(UnitAffectingCombat(unit)) ~= true then return false end
  return open(UnitIsUnit(unit, "target")) == true or open(UnitIsUnit(unit .. "target", "player")) == true
end

local function fightWith(guid, now)
  local p = pending[guid]
  if not p then
    p = { first = now }
    pending[guid] = p
  end
  p.last, p.zone = now, currentZone()
end

-- Class and race from the guid, asked again until the game answers (it can't for a player never seen).
local function readClassAndRace(guid, s)
  if s.race and s.class then return end
  local ok, class, classFile, race = pcall(GetPlayerInfoByGUID, guid)
  if ok then
    class, classFile, race = open(class), open(classFile), open(race)
    if type(class) == "string" and type(race) == "string" then s.class, s.classFile, s.race = class, classFile, race end
  end
end

-- A unit token (target, mouseover, nameplateN): remembers a hostile player you can see, and logs the fight when they
-- are fighting you. Nothing happens while you are dead (the dead look at everything).
function M.Sight(unit)
  if open(UnitIsDeadOrGhost("player")) == true then return end
  local guid, name = identity(unit)
  if not guid or open(UnitIsEnemy("player", unit)) ~= true then return end
  local now = time()
  seq = seq + 1
  local s = sighted[guid]
  if not s then
    s = { guid = guid, first = now }
    sighted[guid] = s
  end
  s.name, s.last, s.seq = name, now, seq
  local level = open(UnitLevel(unit))
  if type(level) == "number" and level > 0 then s.level = level end -- -1 is "??": unknown, not a level
  local guild = open((GetGuildInfo(unit)))
  if type(guild) == "string" and guild ~= "" then s.guild = guild end
  readClassAndRace(guid, s)
  if fightingMe(unit) then
    s.engagedAt = now
    M.Flush(now)
    fightWith(guid, now)
  end
end

-- The enemy record for a sighted (or already logged) player, made on first need and brought up to date.
local function noteEnemy(guid, now)
  local enemies = M.DB().enemies
  local s = sighted[guid]
  local enemy = enemies[guid]
  if not enemy then
    enemy = { name = cleanName(s and s.name), firstSeen = s and s.first or now, killedYou = 0, youKilled = 0, fights = 0 }
    enemies[guid] = enemy
  end
  enemy.lastSeen = now
  if s then
    enemy.name = s.name
    enemy.level, enemy.guild = s.level or enemy.level, s.guild or enemy.guild
    if s.race and s.class then enemy.race, enemy.class, enemy.classFile = s.race, s.class, s.classFile end
  end
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

local function commit(guid, outcome, now, spell, probable)
  local d = M.DB()
  local p = pending[guid]
  pending[guid] = nil
  local enemy = noteEnemy(guid, now)
  local entry = {
    guid = guid, outcome = outcome, spell = spell, probable = probable or nil,
    zone = p and p.zone or currentZone(), time = (outcome == "fought" and p) and p.last or now,
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

-- Ends the fights nothing has been seen of for FIGHT_WINDOW seconds (all of them with `everything`) as "fought", and
-- forgets players not seen for SEEN_KEEP seconds.
function M.Flush(now, everything)
  for guid, p in pairs(pending) do
    if everything or now - p.last > M.FIGHT_WINDOW then commit(guid, "fought", now) end
  end
  for guid, s in pairs(sighted) do
    if now - s.last > M.SEEN_KEEP and not pending[guid] then sighted[guid] = nil end
  end
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
  local line = (entry.probable and "Probably killed by " or "Killed by ") .. enemy.name .. (who ~= "" and (" (" .. who .. ")") or "")
  if entry.spell then line = line .. " with " .. entry.spell end
  if entry.zone then line = line .. " in " .. entry.zone end
  return line
end

-- The death recap's killing blow (its first event): the killer's name and the spell. Returns
--   name, spell  the recap names who landed it;
--   false        the recap is readable but names nobody (the environment, or a hidden source);
--   nil          nothing readable yet: no recap, a secret one, or the previous death's still showing.
local function recapKiller()
  if not (C_DeathRecap and C_DeathRecap.HasRecapEvents and C_DeathRecap.GetRecapEvents) then return nil end
  local ok, has = pcall(C_DeathRecap.HasRecapEvents)
  if not ok or open(has) ~= true then return nil end
  local got, events = pcall(C_DeathRecap.GetRecapEvents)
  events = got and open(events) or nil
  local blow = type(events) == "table" and events[1] or nil
  if type(blow) ~= "table" then return nil end
  if issecretvalue and issecretvalue(blow.sourceName) then return nil end
  local signature = table.concat({ tostring(open(blow.timestamp)), tostring(open(blow.spellId)), tostring(blow.sourceName), tostring(open(blow.amount)) }, "|")
  if signature == lastRecapSig then return nil end
  lastRecapSig = signature
  local name = blow.sourceName
  if open(blow.hideCaster) == true or type(name) ~= "string" or name == "" then return false end
  local event, spell = open(blow.event), open(blow.spellName)
  if event == "SWING_DAMAGE" then spell = "Melee" end
  return cleanName(name), type(spell) == "string" and spell or nil
end

-- The sighted (else already logged) player with this name.
local function guidNamed(name)
  local wanted, best, bestSeq = name:lower(), nil, -1
  for guid, s in pairs(sighted) do
    if s.name:lower() == wanted and s.seq > bestSeq then best, bestSeq = guid, s.seq end
  end
  if best then return best end
  for guid, enemy in pairs(M.DB().enemies) do
    if enemy.name:lower() == wanted then return guid end
  end
  return nil
end

-- With no readable recap: the hostile player who was fighting you most recently, within KILL_WINDOW seconds of the
-- death; failing that, the hostile player seen most recently in that time.
local function probableKiller(at)
  local best, bestFighting, bestSeq
  for guid, s in pairs(sighted) do
    if s.last <= at and at - s.last <= M.KILL_WINDOW then
      local fighting = s.engagedAt ~= nil and at - s.engagedAt <= M.KILL_WINDOW
      if not best or (fighting and not bestFighting) or (fighting == bestFighting and s.seq > bestSeq) then
        best, bestFighting, bestSeq = guid, fighting, s.seq
      end
    end
  end
  return best
end

local function finishDeath(guid, spell, probable, at)
  local entry, enemy = commit(guid, "killedMe", at, spell, probable)
  if not probable and M.AutoTrack then M.AutoTrack(enemy) end -- a guess never goes on the kill-on-sight list
  if M.DB().settings.chat then DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. deathLine(enemy, entry)) end
end

-- You died: the recap may take a moment to fill in, so ResolveDeath is asked again until it does (or RECAP_WAIT passes).
function M.Died(now)
  if awaiting or (resolvedAt and now - resolvedAt < DEATH_DEBOUNCE) then return end
  M.Flush(now)
  awaiting = { at = now }
  M.ResolveDeath(now)
end

-- Names the killer once the recap can be read. A recap that names someone nobody saw is not blamed on a player: it
-- could as well be a creature. Without a readable recap the guess is made after RECAP_WAIT seconds.
function M.ResolveDeath(now)
  if not awaiting then return end
  local at = awaiting.at
  local killer, spell = recapKiller()
  if killer == nil and now - at < M.RECAP_WAIT then return end
  awaiting, resolvedAt = nil, at
  if killer then
    local guid = guidNamed(killer)
    if guid then finishDeath(guid, spell, false, at) end
  elseif killer == nil then
    local guid = probableKiller(at)
    if guid then finishDeath(guid, nil, true, at) end
  end
end

-- Your kill: PARTY_KILL with you as the attacker and a hostile player you have seen as the target. A secret
-- attacker is never counted (a group member's kill would look the same); a secret target means the dead hostile
-- player you are looking at.
function M.PartyKill(attackerGuid, targetGuid)
  local me = open(UnitGUID("player"))
  local attacker, target = open(attackerGuid), open(targetGuid)
  if not attacker or attacker ~= me then return end
  if not target and open(UnitIsDead("target")) == true then
    M.Sight("target")
    target = open(UnitGUID("target"))
  end
  if type(target) ~= "string" or not (sighted[target] or M.DB().enemies[target]) then return end
  M.Flush(time())
  commit(target, "iKilled", time())
end

-- What the window shows -----------------------------------------------------------------------

M.FILTERS = {
  { id = "all", label = "All" },
  { id = "killedMe", label = "Killed me" },
  { id = "iKilled", label = "I killed" },
  { id = "tracked", label = "Tracked" },
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

-- Newest first: { head = "Name  Orc Warrior 60  <Guild>", detail = "Zone · 5 min ago · Killed you with X · killed you ×2", name, tracked }.
-- The "tracked" filter lists the kill-on-sight list instead (Track.lua).
function M.Rows(filter)
  if filter == "tracked" then return M.TrackedRows() end
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
    if entry.probable then what = "Probably killed you" end
    if entry.spell then what = what .. " with " .. entry.spell end
    table.insert(parts, what)
    if enemy.killedYou > 0 then table.insert(parts, "killed you ×" .. enemy.killedYou) end
    if enemy.youKilled > 0 then table.insert(parts, "you killed ×" .. enemy.youKilled) end
    table.insert(rows, { head = head, detail = table.concat(parts, " · "), name = enemy.name, tracked = M.IsTracked(enemy.name) })
  end
  return rows
end

function M.Clear()
  local d = M.DB()
  d.log, d.enemies = {}, {}
  for guid in pairs(pending) do pending[guid] = nil end
  for guid in pairs(sighted) do sighted[guid] = nil end
  awaiting, resolvedAt, lastRecapSig = nil, nil, nil
  changed()
end
