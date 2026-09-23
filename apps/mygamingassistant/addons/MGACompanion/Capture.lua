-- MGA Companion — record where things really are in WoW Forever.
--
-- The World Map's positions come from Classic and may be out of date. While
-- this addon is on it quietly notes, OUT OF COMBAT only:
--
--   * NPCs with a title ("<Warlock Trainer>") that you target or mouse over
--     within ~10 yards, plus what they offer when you talk to them (trainer,
--     flight paths, bank, auction house, stable, repairs);
--   * quest givers (NPCs and objects such as wanted posters) and the quests
--     they offer when you open their quest dialog;
--   * dungeon and raid entrances — where you stood when you walked in.
--
-- Everything goes into SavedVariables (MGACompanionDB). WoW writes that file
-- when you log out or type /reload; upload it on the World Map page.
-- Positions are YOUR position, which is why NPCs are only noted up close.

local _, ns = ...

local DB_VERSION = 1
-- Don't rewrite the same record more often than this (seconds).
local REFRESH_SECONDS = 30
-- An entrance counts only if you were moving this recently before the loading screen.
local ENTRANCE_SAMPLE_MAX_AGE = 3
-- CheckInteractDistance index 2 = trade distance (~11 yards).
local NEAR_INDEX = 2
local REACTION_HOSTILE_MAX = 3
local REACTION_NEUTRAL = 4
local MAP_TYPE_ZONE = (Enum and Enum.UIMapType and Enum.UIMapType.Zone) or 3

local db -- MGACompanionDB.captures once ADDON_LOADED fires

local function inCombat()
  return InCombatLockdown() or UnitAffectingCombat("player")
end

local function playerFaction()
  local group = UnitFactionGroup("player")
  if group == "Alliance" then
    return "A"
  elseif group == "Horde" then
    return "H"
  end
  return "N"
end

-- The zone-level map you're on (walks up from micro/dungeon maps) and your
-- position on it in map percent. nil inside instances or when unknown.
local function playerSpot()
  if not (C_Map and C_Map.GetBestMapForUnit and C_Map.GetPlayerMapPosition) then
    return nil
  end
  local mapId = C_Map.GetBestMapForUnit("player")
  local info = mapId and C_Map.GetMapInfo(mapId)
  while info and info.mapType and info.mapType > MAP_TYPE_ZONE and info.parentMapID and info.parentMapID ~= 0 do
    mapId = info.parentMapID
    info = C_Map.GetMapInfo(mapId)
  end
  if not info then
    return nil
  end
  local pos = C_Map.GetPlayerMapPosition(mapId, "player")
  if not pos then
    return nil
  end
  local x, y = pos:GetXY()
  if not x or x <= 0 or y <= 0 or x >= 1 or y >= 1 then
    return nil
  end
  return {
    map = mapId,
    zone = info.name or "",
    subzone = GetSubZoneText() or "",
    x = math.floor(x * 1000 + 0.5) / 10,
    y = math.floor(y * 1000 + 0.5) / 10,
  }
end

-- "Creature-0-4372-0-17-906-00004BB2E1" -> "npc", 906
local function unitIdentity(unit)
  local guid = UnitGUID(unit)
  if not guid then
    return nil
  end
  local unitType, _, _, _, _, id = strsplit("-", guid)
  id = tonumber(id)
  if not id then
    return nil
  end
  if unitType == "Creature" then
    return "npc", id
  elseif unitType == "GameObject" then
    return "object", id
  end
  return nil
end

local scanTip
local function unitTitle(unit)
  if not scanTip then
    scanTip = CreateFrame("GameTooltip", "MGACompanionScanTooltip", nil, "GameTooltipTemplate")
  end
  scanTip:SetOwner(WorldFrame, "ANCHOR_NONE")
  scanTip:ClearLines()
  scanTip:SetUnit(unit)
  local line = _G["MGACompanionScanTooltipTextLeft2"]
  local text = line and line:GetText()
  scanTip:Hide()
  -- Untitled NPCs show "Level 12 Humanoid" on line 2.
  if not text or text == "" or (LEVEL and text:find(LEVEL, 1, true)) then
    return ""
  end
  return text
end

local function unitFaction(unit)
  local reaction = UnitReaction("player", unit)
  if not reaction or reaction <= REACTION_HOSTILE_MAX then
    return nil -- hostile: never shown on the map
  end
  if reaction == REACTION_NEUTRAL then
    return "N"
  end
  return playerFaction()
end

local function store(key, fields, announce)
  local now = time()
  local existing = db[key]
  local record = existing or {}
  local isNew = existing == nil
  for field, value in pairs(fields) do
    record[field] = value
  end
  record.at = now
  record.playerLevel = UnitLevel("player")
  record.playerFaction = playerFaction()
  db[key] = record
  if isNew and announce then
    ns.say("noted " .. announce .. " — /reload, then upload on the World Map.")
  end
  return record
end

local function recent(key)
  local record = db and db[key]
  return record and record.at and (time() - record.at) < REFRESH_SECONDS
end

-- A titled NPC you're next to. `offer` names what it just offered (trainer, taxi, ...).
local function noteNpc(unit, offer)
  if not db or inCombat() or not UnitExists(unit) or UnitIsPlayer(unit) then
    return
  end
  local kind, id = unitIdentity(unit)
  if kind ~= "npc" then
    return
  end
  local key = "npc:" .. id
  if not offer and recent(key) then
    return
  end
  local faction = unitFaction(unit)
  local title = unitTitle(unit)
  if not faction or (title == "" and not offer) then
    return
  end
  -- Interaction units ("npc") are always in reach; others must be close.
  if unit ~= "npc" and not CheckInteractDistance(unit, NEAR_INDEX) then
    return
  end
  local spot = playerSpot()
  if not spot then
    return
  end
  local name = UnitName(unit) or ""
  local record = store(key, {
    kind = "npc",
    id = id,
    name = name,
    title = title,
    faction = faction,
    map = spot.map,
    zone = spot.zone,
    subzone = spot.subzone,
    x = spot.x,
    y = spot.y,
  }, title ~= "" and (name .. " <" .. title .. ">") or name)
  if offer then
    record.offers = record.offers or {}
    record.offers[offer] = true
  end
end

local function availableQuests()
  local quests = {}
  if C_GossipInfo and C_GossipInfo.GetAvailableQuests then
    for _, q in ipairs(C_GossipInfo.GetAvailableQuests() or {}) do
      quests[#quests + 1] = { id = q.questID, title = q.title, level = q.questLevel }
    end
  end
  return quests
end

local function greetingQuests()
  local quests = {}
  for i = 1, (GetNumAvailableQuests and GetNumAvailableQuests() or 0) do
    quests[#quests + 1] = { title = GetAvailableTitle(i), level = GetAvailableLevel(i) }
  end
  return quests
end

local function detailQuest()
  local id = GetQuestID and GetQuestID()
  local title = GetTitleText and GetTitleText()
  if not title or title == "" then
    return {}
  end
  return { { id = (id and id > 0) and id or nil, title = title } }
end

-- Merge newly offered quests into the giver's list (by id, else by title).
local function mergeQuests(record, quests)
  record.quests = record.quests or {}
  for _, q in ipairs(quests) do
    local found
    for _, known in ipairs(record.quests) do
      if (q.id and known.id == q.id) or known.title == q.title then
        found = known
      end
    end
    if found then
      found.id = found.id or q.id
      found.level = found.level or q.level
    elseif q.title and q.title ~= "" then
      record.quests[#record.quests + 1] = q
    end
  end
end

local function noteQuestGiver(quests)
  if not db or inCombat() or #quests == 0 then
    return
  end
  local kind, id = unitIdentity("npc")
  if not kind then
    return
  end
  local faction = kind == "object" and "N" or unitFaction("npc")
  local spot = playerSpot()
  if not faction or not spot then
    return
  end
  local name = UnitName("npc") or ""
  local record = store("quest:" .. kind .. ":" .. id, {
    kind = "quest",
    type = kind,
    id = id,
    name = name,
    faction = faction,
    map = spot.map,
    zone = spot.zone,
    subzone = spot.subzone,
    x = spot.x,
    y = spot.y,
  }, "quest giver " .. name)
  mergeQuests(record, quests)
end

-- Dungeon entrances: keep sampling your outdoor position; when a loading
-- screen takes you into an instance and you were walking just before it,
-- the last sample is the entrance.
local lastOutdoor, lastOutdoorAt, entranceCandidate

local function sampleOutdoor()
  if IsInInstance() then
    return
  end
  local speed = GetUnitSpeed("player")
  if speed and speed > 0 then
    lastOutdoor = playerSpot()
    lastOutdoorAt = GetTime()
  end
end

local function noteEntrance()
  local candidate = entranceCandidate
  entranceCandidate = nil
  local inInstance, instanceType = IsInInstance()
  if not db or not candidate or not inInstance or (instanceType ~= "party" and instanceType ~= "raid") then
    return
  end
  local name, _, _, _, _, _, _, instanceId = GetInstanceInfo()
  if not name or name == "" or not instanceId then
    return
  end
  -- One record per instance and entrance spot: some instances have several
  -- entrances (Scarlet Monastery's wings, Dire Maul's gates).
  store(string.format("instance:%d:%d:%d", instanceId, candidate.map, math.floor(candidate.x) * 100 + math.floor(candidate.y)), {
    kind = "instance",
    type = instanceType == "raid" and "raid" or "dungeon",
    id = instanceId,
    name = name,
    faction = "N",
    map = candidate.map,
    zone = candidate.zone,
    subzone = candidate.subzone,
    x = candidate.x,
    y = candidate.y,
  }, "the entrance to " .. name)
end

function ns.captureCount()
  local count = 0
  for _ in pairs(db or {}) do
    count = count + 1
  end
  return count
end

local OFFER_EVENTS = {
  TRAINER_SHOW = "trainer",
  TAXIMAP_OPENED = "taxi",
  BANKFRAME_OPENED = "bank",
  AUCTION_HOUSE_SHOW = "auction",
  PET_STABLE_SHOW = "stable",
}

local frame = CreateFrame("Frame")
frame:RegisterEvent("ADDON_LOADED")
frame:RegisterEvent("PLAYER_TARGET_CHANGED")
frame:RegisterEvent("UPDATE_MOUSEOVER_UNIT")
frame:RegisterEvent("GOSSIP_SHOW")
frame:RegisterEvent("QUEST_GREETING")
frame:RegisterEvent("QUEST_DETAIL")
frame:RegisterEvent("MERCHANT_SHOW")
frame:RegisterEvent("LOADING_SCREEN_ENABLED")
frame:RegisterEvent("PLAYER_ENTERING_WORLD")
for event in pairs(OFFER_EVENTS) do
  frame:RegisterEvent(event)
end

frame:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" then
    if arg1 ~= "MGACompanion" then
      return
    end
    MGACompanionDB = MGACompanionDB or {}
    MGACompanionDB.version = DB_VERSION
    MGACompanionDB.captures = MGACompanionDB.captures or {}
    db = MGACompanionDB.captures
    C_Timer.NewTicker(1, sampleOutdoor)
  elseif event == "PLAYER_TARGET_CHANGED" then
    noteNpc("target")
  elseif event == "UPDATE_MOUSEOVER_UNIT" then
    noteNpc("mouseover")
  elseif event == "GOSSIP_SHOW" then
    noteNpc("npc")
    noteQuestGiver(availableQuests())
  elseif event == "QUEST_GREETING" then
    noteQuestGiver(greetingQuests())
  elseif event == "QUEST_DETAIL" then
    noteQuestGiver(detailQuest())
  elseif event == "MERCHANT_SHOW" then
    if CanMerchantRepair and CanMerchantRepair() then
      noteNpc("npc", "repair")
    end
  elseif event == "LOADING_SCREEN_ENABLED" then
    local fresh = lastOutdoorAt and (GetTime() - lastOutdoorAt) <= ENTRANCE_SAMPLE_MAX_AGE
    entranceCandidate = fresh and lastOutdoor or nil
  elseif event == "PLAYER_ENTERING_WORLD" then
    noteEntrance()
  elseif OFFER_EVENTS[event] then
    local offer = OFFER_EVENTS[event]
    if offer == "trainer" and IsTradeskillTrainer and IsTradeskillTrainer() then
      offer = "tradeskill"
    end
    noteNpc("npc", offer)
  end
end)
