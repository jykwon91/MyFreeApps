-- MGA Dungeon Quests: for each dungeon, every quest to pick up for its quests, in order, with who
-- gives each and where, ticked with the quests the game says you've done (or have in your log).
-- The quest lines come from Data.lua (MyGamingAssistant's "Before you go"). Every client API is
-- feature-checked: Forever's are undocumented.

MGADungeonQuests = {}
local M = MGADungeonQuests

local PREFIX = "|cff66bbffMGA Dungeon Quests|r: "
local ICON_DONE = "|TInterface\\RaidFrame\\ReadyCheck-Ready:14|t"
local ICON_LOG = "|TInterface\\RaidFrame\\ReadyCheck-Waiting:14|t"
local ICON_TODO = "|TInterface\\Buttons\\UI-CheckBox-Up:14|t"
local GREY, WHITE, GOLD, GREEN, RED, BLUE = "|cff9d9d9d", "|cffffffff", "|cffffd100", "|cff40ff40", "|cffff4040", "|cff66bbff"
local FRAME_WIDTH, FRAME_HEIGHT, TEXT_WIDTH = 480, 540, 420

local function say(text)
  if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. text) else print(PREFIX .. text) end
end

-- The game's record of the quests you've turned in.
function M.QuestDone(id)
  if C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted then return C_QuestLog.IsQuestFlaggedCompleted(id) and true or false end
  if IsQuestFlaggedCompleted then return IsQuestFlaggedCompleted(id) and true or false end
  return false
end

-- One quest asked by id, so a quest under a collapsed header in your log still counts; nil when the
-- client can't answer by id (the log scan below then decides).
local function askInLog(id)
  local onQuest
  if C_QuestLog and C_QuestLog.IsOnQuest then
    onQuest = C_QuestLog.IsOnQuest(id) and true or false
  elseif GetQuestLogIndexByID then
    onQuest = (GetQuestLogIndexByID(id) or 0) > 0
  else
    return nil
  end
  if not onQuest then return false end
  local complete = C_QuestLog and C_QuestLog.IsComplete and C_QuestLog.IsComplete(id)
  if complete == nil and IsQuestComplete then complete = IsQuestComplete(id) end
  return complete and "complete" or true
end

-- The quests in your quest log: id -> "complete" (ready to turn in), true, or false (not in it).
function M.QuestsInLog()
  local scanned = {}
  local numEntries = (C_QuestLog and C_QuestLog.GetNumQuestLogEntries) or GetNumQuestLogEntries
  local count = numEntries and numEntries() or 0
  for i = 1, count do
    local id, complete
    if C_QuestLog and C_QuestLog.GetInfo then
      local info = C_QuestLog.GetInfo(i)
      if info and not info.isHeader then
        id = info.questID
        complete = C_QuestLog.IsComplete and C_QuestLog.IsComplete(id)
      end
    elseif GetQuestLogTitle then
      local _, _, _, isHeader, _, isComplete, _, questId = GetQuestLogTitle(i)
      if not isHeader then id, complete = questId, isComplete == 1 end
    end
    if id and id > 0 then scanned[id] = complete and "complete" or true end
  end
  return setmetatable({}, { __index = function(t, id)
    local state = askInLog(id)
    if state == nil then state = scanned[id] or false end
    rawset(t, id, state)
    return state
  end })
end

local function playerFaction()
  local group = UnitFactionGroup and UnitFactionGroup("player")
  return group and group:lower() or nil
end

local function playerClass()
  local _, class = UnitClass("player")
  return class and class:lower() or nil
end

local function forYourClass(line, class)
  if not line.classes then return true end
  for _, c in ipairs(line.classes) do
    if c == class then return true end
  end
  return false
end

-- Your faction's quest lines for a dungeon that your class gets.
function M.LinesFor(dungeon)
  local out, class = {}, playerClass()
  for _, line in ipairs(dungeon[playerFaction() or ""] or {}) do
    if forYourClass(line, class) then out[#out + 1] = line end
  end
  return out
end

-- Each step done: done in the game, or implied by a later step done or in your log (you can't have
-- step 3 without 1 and 2; the dungeon quests at the end of a line stand side by side, so one doesn't
-- imply another).
function M.DoneSteps(line, inLog)
  local before = #line.steps - #line.titles
  local done = {}
  for i, step in ipairs(line.steps) do
    local turnedIn = M.QuestDone(step.id)
    if turnedIn then done[i] = true end
    if turnedIn or inLog[step.id] then
      for j = 1, math.min(i - 1, before) do done[j] = true end
    end
  end
  return done
end

-- How many steps of a dungeon's lines you still have to pick up (not done, not in your log).
function M.ToPickUp(dungeon, inLog)
  local left = 0
  for _, line in ipairs(M.LinesFor(dungeon)) do
    local done = M.DoneSteps(line, inLog)
    for i, step in ipairs(line.steps) do
      if not done[i] and not inLog[step.id] then left = left + 1 end
    end
  end
  return left
end

local function levels(d)
  return d.levelMin == d.levelMax and ("level " .. d.levelMin) or ("levels " .. d.levelMin .. "-" .. d.levelMax)
end

local function giverText(step)
  if not step.giver then return nil end
  local from = step.item and ("from the item " .. step.giver) or ("from " .. step.giver)
  return step.where and (from .. ", " .. step.where) or from
end

local function stepLines(step, state, level, isNext)
  local out = {}
  local tag = step.dungeon and (BLUE .. "  (done in the dungeon)|r") or ""
  if state == "done" then
    out[1] = ICON_DONE .. " " .. GREY .. step.title .. "|r" .. tag
    return out
  end
  local icon = state and ICON_LOG or ICON_TODO
  local colour = isNext and WHITE or "|cffd0d0d0"
  local note = ""
  if state == "complete" then note = GREEN .. "  ready to turn in|r"
  elseif state then note = GOLD .. "  in your quest log|r"
  elseif step.minLevel > level then note = RED .. "  needs level " .. step.minLevel .. "|r" end
  out[1] = icon .. " " .. colour .. step.title .. "|r " .. GREY .. "(" .. step.level .. ")|r" .. tag .. note
  local from = not state and giverText(step)
  if from then out[2] = "      " .. GREY .. from .. "|r" end
  return out
end

-- The checklist for one dungeon, as the window's lines.
function M.ChecklistLines(dungeon)
  local inLog, level = M.QuestsInLog(), UnitLevel("player") or 1
  local out = { GOLD .. dungeon.name .. "|r  " .. GREY .. levels(dungeon) .. "|r", "" }
  local lines = M.LinesFor(dungeon)
  if #lines == 0 then
    out[#out + 1] = "No quests to pick up for this dungeon for your faction and class."
    return out
  end
  for n, line in ipairs(lines) do
    local done = M.DoneSteps(line, inLog)
    local doneCount, nextIndex = 0, nil
    for i in ipairs(line.steps) do
      if done[i] then doneCount = doneCount + 1 elseif not nextIndex then nextIndex = i end
    end
    local status = nextIndex and (doneCount .. " of " .. #line.steps .. " done") or (GREEN .. "all done|r")
    out[#out + 1] = WHITE .. n .. ". " .. table.concat(line.titles, " / ") .. "|r  " .. GREY .. status .. "|r"
    for i, step in ipairs(line.steps) do
      local state = done[i] and "done" or inLog[step.id]
      for _, text in ipairs(stepLines(step, state, level, i == nextIndex)) do out[#out + 1] = text end
    end
    out[#out + 1] = ""
  end
  out[#out + 1] = GREY .. "Quest lines are Classic's; Forever may differ. Quests you turn in tick when the game records them.|r"
  return out
end

-- The dungeon list: every dungeon with quests for you, lowest level first.
function M.ListRows()
  local rows, inLog, level = {}, M.QuestsInLog(), UnitLevel("player") or 1
  for _, d in ipairs(MGADungeonQuestsData) do
    if #M.LinesFor(d) > 0 then
      local left = M.ToPickUp(d, inLog)
      local colour = left == 0 and GREY or (level >= d.levelMin - 3 and level <= d.levelMax and GREEN or WHITE)
      local status = left == 0 and "all picked up" or (left == 1 and "1 quest to pick up" or (left .. " quests to pick up"))
      rows[#rows + 1] = { dungeon = d, text = colour .. d.name .. "|r  " .. GREY .. "(" .. levels(d) .. ") " .. status .. "|r" }
    end
  end
  return rows
end

-- A dungeon by instance id, key or part of its name.
function M.Find(query)
  if type(query) == "number" then
    for _, d in ipairs(MGADungeonQuestsData) do
      if d.instanceId == query then return d end
    end
    return nil
  end
  local q = query:lower()
  for _, d in ipairs(MGADungeonQuestsData) do
    if d.key == q or d.name:lower() == q then return d end
    for _, alias in ipairs(d.aliases or {}) do
      if alias:lower() == q then return d end
    end
  end
  for _, d in ipairs(MGADungeonQuestsData) do
    if d.name:lower():find(q, 1, true) or d.key:find(q, 1, true) then return d end
  end
  return nil
end

local function currentDungeon()
  if not GetInstanceInfo then return nil end
  local _, instanceType, _, _, _, _, _, instanceId = GetInstanceInfo()
  if instanceType ~= "party" and instanceType ~= "raid" then return nil end
  return instanceId and M.Find(instanceId) or nil
end

-- The window ---------------------------------------------------------------------------------

local frame, scroll, child, text, back, rowButtons = nil, nil, nil, nil, nil, {}
local shown = nil -- the dungeon on screen; nil = the list

local function newFrame()
  local ok, f = pcall(CreateFrame, "Frame", "MGADungeonQuestsFrame", UIParent, "BasicFrameTemplateWithInset")
  if not ok or not f then
    f = CreateFrame("Frame", "MGADungeonQuestsFrame", UIParent)
    local bg = f:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    bg:SetColorTexture(0, 0, 0, 0.85)
  end
  f:SetSize(FRAME_WIDTH, FRAME_HEIGHT)
  f:SetPoint("CENTER")
  f:SetFrameStrata("HIGH")
  f:SetMovable(true)
  f:EnableMouse(true)
  f:RegisterForDrag("LeftButton")
  f:SetScript("OnDragStart", f.StartMoving)
  f:SetScript("OnDragStop", f.StopMovingOrSizing)
  f:Hide()
  if f.TitleText then f.TitleText:SetText("MGA Dungeon Quests") end
  if UISpecialFrames then table.insert(UISpecialFrames, "MGADungeonQuestsFrame") end -- Escape closes it

  back = CreateFrame("Button", nil, f, "UIPanelButtonTemplate")
  back:SetSize(120, 22)
  back:SetPoint("TOPLEFT", 12, -30)
  back:SetText("All dungeons")
  back:SetScript("OnClick", function() M.Show(nil) end)

  scroll = CreateFrame("ScrollFrame", "MGADungeonQuestsScroll", f, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 12, -58)
  scroll:SetPoint("BOTTOMRIGHT", -32, 12)
  child = CreateFrame("Frame", nil, scroll)
  child:SetSize(TEXT_WIDTH, 10)
  scroll:SetScrollChild(child)

  text = child:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  text:SetPoint("TOPLEFT", 4, -4)
  text:SetWidth(TEXT_WIDTH - 8)
  text:SetJustifyH("LEFT")
  text:SetSpacing(3)
  return f
end

local function rowButton(i)
  if rowButtons[i] then return rowButtons[i] end
  local b = CreateFrame("Button", nil, child)
  b:SetSize(TEXT_WIDTH - 8, 24)
  b:SetPoint("TOPLEFT", 4, -4 - (i - 1) * 24)
  b:SetHighlightTexture("Interface\\QuestFrame\\UI-QuestTitleHighlight", "ADD")
  local label = b:CreateFontString(nil, "OVERLAY", "GameFontHighlight")
  label:SetPoint("LEFT", 4, 0)
  label:SetJustifyH("LEFT")
  b.label = label
  rowButtons[i] = b
  return b
end

local function render()
  for _, b in ipairs(rowButtons) do b:Hide() end
  if shown then
    back:Show()
    text:SetText(table.concat(M.ChecklistLines(shown), "\n"))
    text:Show()
    child:SetHeight(text:GetStringHeight() + 12)
    return
  end
  back:Hide()
  local rows = M.ListRows()
  if #rows == 0 then
    text:SetText("No dungeon quests for your faction.")
    text:Show()
    child:SetHeight(40)
    return
  end
  text:Hide()
  for i, row in ipairs(rows) do
    local b = rowButton(i)
    b.label:SetText(row.text)
    b:SetScript("OnClick", function() M.Show(row.dungeon) end)
    b:Show()
  end
  child:SetHeight(#rows * 24 + 8)
end

-- Opens the window on a dungeon's checklist (nil = the dungeon list).
function M.Show(dungeon)
  frame = frame or newFrame()
  shown = dungeon
  render()
  if scroll.SetVerticalScroll then scroll:SetVerticalScroll(0) end
  frame:Show()
end

-- Slash command and events -------------------------------------------------------------------

local function remindersOn()
  return not (MGADungeonQuestsSettings and MGADungeonQuestsSettings.remind == false)
end

local reminded = nil -- the dungeon last reminded about; cleared once you're out, so each visit reminds once

local function remind()
  local d = currentDungeon()
  if not d then reminded = nil return end
  if not remindersOn() or d == reminded or #M.LinesFor(d) == 0 then return end
  reminded = d
  local left = M.ToPickUp(d, M.QuestsInLog())
  if left > 0 then
    say(d.name .. ": " .. left .. (left == 1 and " quest" or " quests") .. " for it you haven't picked up. /mgadq to see them.")
  end
end

SLASH_MGADUNGEONQUESTS1 = "/mgadq"
SLASH_MGADUNGEONQUESTS2 = "/mgadungeonquests"
SlashCmdList.MGADUNGEONQUESTS = function(msg)
  msg = (msg or ""):match("^%s*(.-)%s*$")
  local word, rest = msg:match("^(%S+)%s*(.*)$")
  word = word and word:lower()
  if word == "help" then
    say("/mgadq opens the dungeon you're in, else the list. /mgadq <dungeon> (deadmines, sfk, vc...) opens one. /mgadq list. /mgadq remind on|off.")
  elseif word == "list" then
    M.Show(nil)
  elseif word == "remind" then
    MGADungeonQuestsSettings = MGADungeonQuestsSettings or {}
    MGADungeonQuestsSettings.remind = rest:lower() ~= "off"
    say("reminder on entering a dungeon " .. (MGADungeonQuestsSettings.remind and "on." or "off."))
  elseif msg == "" then
    M.Show(currentDungeon())
  else
    local d = M.Find(msg)
    if d then M.Show(d) else say("no dungeon matches \"" .. msg .. "\". /mgadq list shows them all.") end
  end
end

local events = CreateFrame("Frame")
for _, e in ipairs({ "PLAYER_ENTERING_WORLD", "QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "QUEST_LOG_UPDATE", "PLAYER_LEVEL_UP" }) do
  events:RegisterEvent(e)
end
events:SetScript("OnEvent", function(_, event, _, isReloadingUi)
  if event == "PLAYER_ENTERING_WORLD" then
    if isReloadingUi then return end
    -- The quest log and completed quests may not be filled in yet as the loading screen ends.
    if C_Timer and C_Timer.After then C_Timer.After(3, remind) else remind() end
  elseif frame and frame:IsShown() then
    render()
  end
end)
