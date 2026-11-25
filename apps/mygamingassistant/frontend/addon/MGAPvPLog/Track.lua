-- MGA PvP Log, tracking: a kill-on-sight list. The game never tells an addon where an enemy player is, so this
-- only notices them when they come within your own sight: on a nameplate, as your target or mouseover, or as
-- the target of someone in your group. Each sighting remembers WHERE YOU WERE (zone, subzone
-- and your map position), never their exact spot, and warns you once (chat line, sound, banner).
--
-- Saved in MGAPvPLogDB.tracked = { [lowercase name] = { name, auto, seen, alerted } } and, in settings,
-- autoTrack (whoever kills you is added) and alertFx (sound + banner; the chat line always shows).
--   seen = { time, zone, subzone, map, x, y }  (x, y = your position on map, percent)

local M = MGAPvPLog

M.ALERT_EVERY = 60 -- seconds between two warnings about the same player
M.LEFT_AFTER = 20 -- not seen for this long = they left; seeing them again warns at once
M.SCAN_UNITS = 40

local BANNER_SECONDS = 4

local function key(name)
  return (name or ""):lower()
end

local function tracked()
  local d = M.DB()
  d.tracked = d.tracked or {}
  return d.tracked
end

-- "Name", or "Name-Realm" for another realm (your own realm is dropped, as the log does).
local function plain(name)
  return M.CleanName(name)
end

-- The logged enemy with this name (for race, class, level and how often they killed you).
local function enemyNamed(name)
  for _, enemy in pairs(M.DB().enemies) do
    if key(enemy.name) == key(name) then return enemy end
  end
  return nil
end

-- What we knew of the player when last logged, kept on the list so it outlives the log's 200 entries.
local function remember(entry)
  local enemy = enemyNamed(entry.name)
  if enemy then
    entry.info = { race = enemy.race, class = enemy.class, classFile = enemy.classFile, level = enemy.level, killedYou = enemy.killedYou }
  end
end

function M.IsTracked(name)
  return tracked()[key(plain(name))] ~= nil
end

function M.SetTracked(name, on, auto)
  local k = key(plain(name))
  if k == "" then return end
  local list = tracked()
  if on and not list[k] then
    list[k] = { name = plain(name), auto = auto and true or nil }
    remember(list[k])
  elseif not on then
    list[k] = nil
  end
  if M.Refresh then M.Refresh() end
  return list[k]
end

function M.ToggleTracked(name)
  M.SetTracked(name, not M.IsTracked(name))
end

-- Where you stand: zone, subzone and your position on the zone map (percent), whatever the client will say.
local function whereIAm()
  local at = { zone = GetRealZoneText() or "", subzone = GetSubZoneText() or "" }
  if C_Map and C_Map.GetBestMapForUnit then
    local map = C_Map.GetBestMapForUnit("player")
    local position = map and C_Map.GetPlayerMapPosition and C_Map.GetPlayerMapPosition(map, "player")
    local x, y
    if position then x, y = position:GetXY() end
    if map and x and y and not (x == 0 and y == 0) then at.map, at.x, at.y = map, x * 100, y * 100 end
  end
  return at
end

-- "Stranglethorn Vale - Booty Bay (41, 62)".
local function placeText(at)
  local text = at.zone
  if at.subzone ~= "" and at.subzone ~= at.zone then text = (text ~= "" and (text .. " - ") or "") .. at.subzone end
  if at.x then text = text .. string.format(" (%d, %d)", math.floor(at.x + 0.5), math.floor(at.y + 0.5)) end
  return text
end

local function describe(entry)
  local enemy = enemyNamed(entry.name) or entry.info
  local facts = {}
  if enemy then
    local who = M.Who(enemy)
    if who ~= "" then table.insert(facts, who) end
    if enemy.killedYou > 0 then table.insert(facts, "killed you ×" .. enemy.killedYou) end
  end
  if #facts == 0 then return entry.name end
  return entry.name .. " (" .. table.concat(facts, ", ") .. ")"
end

-- The brief on-screen banner -----------------------------------------------------------------

local banner, bannerLeft = nil, 0

local function showBanner(text)
  if not banner then
    banner = CreateFrame("Frame", "MGAPvPLogBanner", UIParent)
    banner:SetSize(520, 40)
    banner:SetPoint("TOP", UIParent, "TOP", 0, -160)
    banner:SetFrameStrata("HIGH")
    banner.text = banner:CreateFontString("MGAPvPLogBannerText", "OVERLAY", "GameFontNormalLarge")
    banner.text:SetPoint("CENTER", banner, "CENTER", 0, 0)
    banner:SetScript("OnUpdate", function(self, elapsed)
      bannerLeft = bannerLeft - elapsed
      if bannerLeft <= 0 then self:Hide() end
    end)
  end
  banner.text:SetText(text)
  bannerLeft = BANNER_SECONDS
  banner:Show()
end

local function alert(entry, at)
  local line = describe(entry) .. " is near you: " .. placeText(at)
  DEFAULT_CHAT_FRAME:AddMessage("|cffff4040MGA PvP Log:|r " .. line)
  if M.DB().settings.alertFx ~= false then
    if PlaySound then PlaySound((SOUNDKIT and SOUNDKIT.RAID_WARNING) or 8959) end
    showBanner("|cffff4040" .. entry.name .. " is near you|r")
  end
end

-- A tracked player showed up ---------------------------------------------------------------

function M.Sighted(name, now)
  local entry = name and tracked()[key(plain(name))]
  if not entry then return end
  local before = entry.seen
  if before and before.time == now and entry.alerted and now - entry.alerted < M.ALERT_EVERY then return end -- once a second is plenty
  remember(entry)
  local at = whereIAm()
  entry.seen = { time = now, zone = at.zone, subzone = at.subzone, map = at.map, x = at.x, y = at.y }
  local returned = before == nil or now - before.time >= M.LEFT_AFTER
  if returned or entry.alerted == nil or now - entry.alerted >= M.ALERT_EVERY then
    entry.alerted = now
    alert(entry, at)
  end
  if M.Refresh then M.Refresh() end
end

-- A unit token: nameplate, target, mouseover, or a group member's target. A name the client hides is skipped.
function M.TrackUnit(unit)
  if next(tracked()) == nil then return end
  local name = M.PlayerName(unit)
  if name then M.Sighted(name, time()) end
end

-- The targets of everyone in your group, looked at every few seconds while anyone is tracked.
function M.ScanGroup()
  if next(tracked()) == nil then return end
  local raid = IsInRaid and IsInRaid()
  local count = GetNumGroupMembers and GetNumGroupMembers() or 0
  for i = 1, math.min(raid and count or count - 1, M.SCAN_UNITS) do
    M.TrackUnit((raid and "raid" or "party") .. i .. "target")
  end
end

-- Whoever just killed you goes on the list (when that setting is on).
function M.AutoTrack(enemy)
  if M.DB().settings.autoTrack == false then return end
  if M.IsTracked(enemy.name) then return end
  local entry = M.SetTracked(enemy.name, true, true)
  local at = whereIAm()
  entry.seen = { time = time(), zone = at.zone, subzone = at.subzone, map = at.map, x = at.x, y = at.y }
end

-- What the Tracked tab shows -------------------------------------------------------------------

-- The waypoint for "Go to last seen": only with MGAWaypoints installed and a map position to give it.
local function waypointFor(entry)
  local seen = entry.seen
  if not (seen and seen.map and MGAWaypoints and MGAWaypoints.SetTarget) then return nil end
  return { name = "Where you saw " .. entry.name, kind = "pvp", map = seen.map, x = seen.x, y = seen.y, zone = seen.zone }
end

function M.TrackedRows()
  local now, rows = time(), {}
  for _, entry in pairs(tracked()) do
    local enemy = enemyNamed(entry.name) or entry.info
    local head = M.ClassColor(enemy and enemy.classFile) .. entry.name .. "|r"
    local who = enemy and M.Who(enemy) or ""
    if who ~= "" then head = head .. "  " .. who end
    if enemy and enemy.killedYou > 0 then head = head .. "  killed you ×" .. enemy.killedYou end
    local detail = "Not seen yet"
    if entry.seen then
      detail = "You were in " .. placeText(entry.seen) .. " · " .. M.Ago(now - entry.seen.time)
    end
    table.insert(rows, { head = head, detail = detail, name = entry.name, tracked = true, go = waypointFor(entry), seenAt = entry.seen and entry.seen.time or 0 })
  end
  table.sort(rows, function(a, b)
    if a.seenAt ~= b.seenAt then return a.seenAt > b.seenAt end
    return a.name < b.name
  end)
  return rows
end
