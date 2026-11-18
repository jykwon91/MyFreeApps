-- MGA Dungeon Quests: a dungeon journal. Every dungeon on a grid; open one for its bosses, what they
-- drop, and every quest to pick up for it, in order, with who gives each and where, ticked with the
-- quests the game says you've done (or have in your log). The data comes from Data.lua
-- (MyGamingAssistant's dungeon pages). Every client API is feature-checked: Forever's are undocumented.

MGADungeonQuests = {}
local M = MGADungeonQuests

local PREFIX = "|cff66bbffMGA Dungeon Quests|r: "
local ICON_DONE = "|TInterface\\RaidFrame\\ReadyCheck-Ready:14|t"
local ICON_LOG = "|TInterface\\RaidFrame\\ReadyCheck-Waiting:14|t"
local ICON_TODO = "|TInterface\\Buttons\\UI-CheckBox-Up:14|t"
-- Ink for the journal's parchment page.
local GREY, WHITE, SOFT, GOLD, GREEN, RED, BLUE = "|cff5f4b36", "|cff2a1708", "|cff46331f", "|cff7a4300", "|cff1d6b1d", "|cffa01414", "|cff1d4a8c"
local FRAME_WIDTH, FRAME_HEIGHT, TEXT_WIDTH = 800, 496, 316

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

-- Your skill in each profession you have, by its enUS name (the Skills tab), or nil when that can't
-- be read in full -- no GetSkillLineInfo, a non-English client, a collapsed header (its rows aren't
-- listed) or a list not filled in yet -- which then hides no profession quest.
local function playerSkills()
  if not GetNumSkillLines or not GetSkillLineInfo then return nil end
  local locale = GetLocale and GetLocale() or "enUS"
  if locale ~= "enUS" and locale ~= "enGB" then return nil end
  local out, rows = {}, 0
  for i = 1, GetNumSkillLines() do
    local name, isHeader, isExpanded, rank = GetSkillLineInfo(i)
    if isHeader and not isExpanded then return nil end
    if name and not isHeader then
      out[name] = rank or 0
      rows = rows + 1
    end
  end
  return rows > 0 and out or nil
end

-- A line that needs a profession you don't have never comes: its giver won't offer it.
local function forYourProfessions(line, skills)
  return not line.skill or not skills or skills[line.skill.name] ~= nil
end

-- "Needs Leatherworking 225 (you have 200)" when your skill is still too low, else nil.
function M.SkillNote(line, skills)
  if not line.skill or not skills then return nil end
  local rank = skills[line.skill.name]
  if not rank or rank >= line.skill.level then return nil end
  return "Needs " .. line.skill.name .. " " .. line.skill.level .. " (you have " .. rank .. ")"
end

-- Your faction's quest lines for a dungeon that your class and professions get.
function M.LinesFor(dungeon)
  local out, class, skills = {}, playerClass(), playerSkills()
  for _, line in ipairs(dungeon[playerFaction() or ""] or {}) do
    if forYourClass(line, class) and forYourProfessions(line, skills) then out[#out + 1] = line end
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
  local colour = isNext and WHITE or SOFT
  local note = ""
  if state == "complete" then note = GREEN .. "  ready to turn in|r"
  elseif state then note = GOLD .. "  in your quest log|r"
  elseif step.minLevel > level then note = RED .. "  needs level " .. step.minLevel .. "|r" end
  out[1] = icon .. " " .. colour .. step.title .. "|r " .. GREY .. "(" .. step.level .. ")|r" .. tag .. note
  local from = not state and giverText(step)
  if from then out[2] = "      " .. GREY .. from .. "|r" end
  return out
end

-- What to do next for a step: get it (from whom, where, at what level), finish it (its objectives), or
-- turn it in (to whom). state = nil (not picked up), true (in your log) or "complete".
function M.NextText(step, state, level)
  local title = '"' .. step.title .. '"'
  local turnIn = step.turnIn and (" to " .. step.turnIn) or ""
  if state == "complete" then return "Turn in " .. title .. turnIn .. "." end
  if state then
    local todo = step.objectives and (": " .. table.concat(step.objectives, ", ")) or " (its goals are in your quest log)"
    local inside = step.dungeon and " in the dungeon" or ""
    return "Finish " .. title .. inside .. todo .. ". Then turn it in" .. turnIn .. "."
  end
  local when = step.minLevel > level and ("At level " .. step.minLevel .. ", get ") or "Get "
  if not step.giver then return when .. title .. ". Who gives it isn't in our data." end
  return when .. title .. " " .. giverText(step) .. "."
end

-- A step's giver can be pinned on the World Map: we know where, and the client has user waypoints.
function M.CanPin(step)
  return step.map ~= nil and C_Map ~= nil and C_Map.SetUserWaypoint ~= nil
    and UiMapPoint ~= nil and UiMapPoint.CreateFromCoordinates ~= nil
end

-- Puts a World Map pin (and the on-screen arrow, where the client has one) on a step's giver.
function M.Pin(step)
  if C_Map.CanSetUserWaypointOnMap and not C_Map.CanSetUserWaypointOnMap(step.map) then
    say("the map can't take a pin there. " .. step.giver .. " is at " .. step.where .. ".")
    return
  end
  C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(step.map, step.x / 100, step.y / 100))
  if C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then C_SuperTrack.SetSuperTrackedUserWaypoint(true) end
  say("map pin on " .. step.giver .. ", " .. step.where .. ". Open your map (M) to see it.")
end

-- One quest line's block: its heading and "Next:" line (top), the steps (body), and the step to pin.
local function lineBlock(n, line, inLog, level)
  local done = M.DoneSteps(line, inLog)
  local doneCount, nextIndex = 0, nil
  for i in ipairs(line.steps) do
    if done[i] then doneCount = doneCount + 1 elseif not nextIndex then nextIndex = i end
  end
  local status = nextIndex and (doneCount .. " of " .. #line.steps .. " done") or (GREEN .. "all done|r")
  local top = WHITE .. n .. ". " .. table.concat(line.titles, " / ") .. "|r  " .. GREY .. status .. "|r"
  local skillNote = M.SkillNote(line, playerSkills())
  if skillNote then top = top .. "\n" .. RED .. skillNote .. "|r" end
  local pin = nil
  if nextIndex then
    local step = line.steps[nextIndex]
    local state = inLog[step.id]
    top = top .. "\n" .. GOLD .. "Next:|r " .. M.NextText(step, state, level)
    if not state and M.CanPin(step) then pin = step end
  end
  local body = {}
  for i, step in ipairs(line.steps) do
    local state = done[i] and "done" or inLog[step.id]
    for _, text in ipairs(stepLines(step, state, level, i == nextIndex)) do body[#body + 1] = text end
  end
  return { top = top, body = table.concat(body, "\n"), pin = pin }
end

-- The checklist for one dungeon: its title, a block per quest line, and a footnote.
function M.Checklist(dungeon)
  local inLog, level = M.QuestsInLog(), UnitLevel("player") or 1
  local out = { title = GOLD .. dungeon.name .. "|r  " .. GREY .. levels(dungeon) .. "|r", blocks = {} }
  local lines = M.LinesFor(dungeon)
  if #lines == 0 then
    out.footer = "No quests to pick up for this dungeon for your faction and class."
    return out
  end
  for n, line in ipairs(lines) do out.blocks[n] = lineBlock(n, line, inLog, level) end
  out.footer = GREY .. "Quest lines are Classic's; Forever may differ. Quests you turn in tick when the game records them.|r"
  return out
end

-- The journal's grid: every dungeon, lowest level first, with how many of its quests you still need.
function M.ListRows()
  local rows, inLog, level = {}, M.QuestsInLog(), UnitLevel("player") or 1
  for _, d in ipairs(MGADungeonQuestsData) do
    local left, status = M.ToPickUp(d, inLog), ""
    if #M.LinesFor(d) > 0 then
      status = left == 0 and "all picked up" or (left == 1 and "1 quest to pick up" or (left .. " quests to pick up"))
    end
    rows[#rows + 1] = { dungeon = d, name = d.name, range = levels(d), status = status, inRange = level >= d.levelMin - 3 and level <= d.levelMax }
  end
  return rows
end

-- The Overview tab's facts about a dungeon.
function M.Overview(dungeon)
  local facts = { (levels(dungeon):gsub("^%l", string.upper)) }
  if dungeon.players then facts[#facts + 1] = "Up to " .. dungeon.players .. " players" end
  local bosses = #(dungeon.bosses or {})
  if bosses > 0 then facts[#facts + 1] = bosses .. (bosses == 1 and " boss" or " bosses") end
  if #M.LinesFor(dungeon) > 0 then
    local left = M.ToPickUp(dungeon, M.QuestsInLog())
    facts[#facts + 1] = left == 0 and "All its quests picked up" or (left .. (left == 1 and " quest" or " quests") .. " to pick up")
  end
  if dungeon.isNew then facts[#facts + 1] = "New in WoW Forever" end
  return facts
end

local function chanceText(chance)
  return string.format(chance >= 10 and "%.0f%%" or "%.1f%%", chance)
end

-- The Loot tab's rows: one boss's drops, or the whole dungeon's boss by boss.
function M.LootRows(dungeon, boss)
  local rows = {}
  for _, b in ipairs(boss and { boss } or dungeon.bosses or {}) do
    for _, item in ipairs(b.loot or {}) do
      local kind = item.kind and item.slot and (item.slot .. ", " .. item.kind) or item.slot or item.kind or ""
      local sub = boss and kind or (kind == "" and b.name or (kind .. " - " .. b.name))
      rows[#rows + 1] = { id = item.id, name = item.name, sub = sub, chance = chanceText(item.chance) }
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
-- The Dungeon Journal's layout, drawn with the game's own journal art (by file id, so no path can miss).

local ART = { BOOK = 521750, ATLAS = 522972, HOME = 605327, BUTTON = 521746, LORE = 521743, BOSS = 521744 }
-- left, right, top, bottom in the journal's texture sheet
local SHEET = {
  dungeonUp = { 0.00195313, 0.34179688, 0.42871094, 0.52246094 },
  dungeonDown = { 0.00195313, 0.34179688, 0.33300781, 0.42675781 },
  dungeonLit = { 0.34570313, 0.68554688, 0.33300781, 0.42675781 },
  bossUp = { 0.00195313, 0.63671875, 0.21386719, 0.26757813 },
  bossDown = { 0.00195313, 0.63671875, 0.10253906, 0.15625000 },
  bossLit = { 0.00195313, 0.63671875, 0.15820313, 0.21191406 },
  tabOff = { 0.25585938, 0.37890625, 0.90332031, 0.95898438 },
  tabOn = { 0.12890625, 0.25195313, 0.90332031, 0.95898438 },
  tabLit = { 0.00195313, 0.12500000, 0.90332031, 0.95898438 },
  skullOff = { 0.85546875, 0.94921875, 0.52441406, 0.56640625 },
  skullOn = { 0.90234375, 0.99609375, 0.26953125, 0.31152344 },
  chestOff = { 0.73046875, 0.82421875, 0.61816406, 0.66015625 },
  chestOn = { 0.63281250, 0.72656250, 0.61816406, 0.66015625 },
  lootRow = { 0.00195313, 0.62890625, 0.61816406, 0.66210938 },
  nameBar = { 0.34570313, 0.84570313, 0.42871094, 0.49121094 },
  pageHeader = { 0, 0.755859375, 0.9599609375, 1 },
}
local TABS = {
  { key = "quests", tip = "Quests", file = "Interface\\GossipFrame\\AvailableQuestIcon" },
  { key = "overview", tip = "Overview", off = SHEET.skullOff, on = SHEET.skullOn },
  { key = "loot", tip = "Loot", off = SHEET.chestOff, on = SHEET.chestOn },
}
local NO_ICON = "Interface\\Icons\\INV_Misc_QuestionMark"
local PIN_WIDTH, GAP, LORE_HEIGHT, LOOT_HEIGHT = 64, 6, 250, 47

local frame, scroll, child, grid, gridChild, book, bossChild, lorePicture, loreBar, loreTitle
local crumbs, tabs = {}, {}
local dungeonButtons, bossButtons, lootButtons = {}, {}, {}
local texts, pins = {}, {} -- pooled font strings and Pin buttons for the right-hand page
local shown, shownBoss, shownTab = nil, nil, "quests" -- the dungeon on screen (nil = the grid), its boss, its tab
local render

local function fromSheet(parent, layer, coords)
  local t = parent:CreateTexture(nil, layer)
  t:SetTexture(ART.ATLAS)
  t:SetTexCoord(coords[1], coords[2], coords[3], coords[4])
  return t
end

-- A button drawn with three pieces of the sheet: up, pressed and lit.
local function skin(button, up, down, lit)
  local normal, pushed, highlight = fromSheet(button, "ARTWORK", up), fromSheet(button, "ARTWORK", down), fromSheet(button, "HIGHLIGHT", lit)
  normal:SetAllPoints()
  pushed:SetAllPoints()
  highlight:SetAllPoints()
  button:SetNormalTexture(normal)
  button:SetPushedTexture(pushed)
  button:SetHighlightTexture(highlight)
end

local function resetScroll()
  if scroll.SetVerticalScroll then scroll:SetVerticalScroll(0) end
end

local function openTab(key)
  shownTab = key
  if key ~= "loot" then shownBoss = nil end
  render()
  resetScroll()
end

local function newCrumb(name, width, x, onClick)
  local b = CreateFrame("Button", name, frame, "UIPanelButtonTemplate")
  b:SetSize(width, 22)
  b:SetPoint("TOPLEFT", x, -30)
  b:SetScript("OnClick", onClick)
  return b
end

local function newTab(i, tab)
  local b = CreateFrame("Button", "MGADungeonQuestsTab" .. i, book)
  b:SetSize(63, 57)
  b:SetPoint("TOPLEFT", book, "TOPRIGHT", -12, -35 - (i - 1) * 55)
  b:SetFrameLevel(book:GetFrameLevel() + 5)
  b.back = fromSheet(b, "BACKGROUND", SHEET.tabOff)
  b.back:SetAllPoints()
  local lit = fromSheet(b, "HIGHLIGHT", SHEET.tabLit)
  lit:SetAllPoints()
  lit:SetBlendMode("ADD")
  b.icon = b:CreateTexture(nil, "OVERLAY")
  if tab.file then
    b.icon:SetTexture(tab.file)
    b.icon:SetSize(24, 24)
    b.icon:SetPoint("RIGHT", -18, 0)
  else
    b.icon:SetTexture(ART.ATLAS)
    b.icon:SetSize(48, 43)
    b.icon:SetPoint("RIGHT", -6, 0)
  end
  b:SetScript("OnClick", function() openTab(tab.key) end)
  b:SetScript("OnEnter", function(self)
    if not GameTooltip then return end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetText(tab.tip)
    GameTooltip:Show()
  end)
  b:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  return b
end

local function newScroll(name, parent)
  local s = CreateFrame("ScrollFrame", name, parent, "UIPanelScrollFrameTemplate")
  local c = CreateFrame("Frame", nil, s)
  s:SetScrollChild(c)
  return s, c
end

local function newGrid()
  grid = CreateFrame("Frame", nil, frame)
  grid:SetSize(785, 425)
  grid:SetPoint("TOPLEFT", 6, -58)
  local back = grid:CreateTexture(nil, "BACKGROUND")
  back:SetTexture(ART.HOME)
  back:SetAllPoints()
  local s, c = newScroll("MGADungeonQuestsGridScroll", grid)
  s:SetPoint("TOPLEFT", 14, -12)
  s:SetPoint("BOTTOMRIGHT", -30, 10)
  c:SetSize(738, 10)
  gridChild = c
end

local function newBook()
  book = CreateFrame("Frame", nil, frame)
  book:SetSize(785, 425)
  book:SetPoint("TOPLEFT", 6, -58)
  local page = book:CreateTexture(nil, "BACKGROUND")
  page:SetTexture(ART.BOOK)
  page:SetTexCoord(0, 0.766601562, 0, 0.830078125)
  page:SetAllPoints()
  local header = fromSheet(book, "BORDER", SHEET.pageHeader)
  header:SetSize(386, 39)
  header:SetPoint("TOPLEFT", 0, -11)
  local title = book:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", 24, -22)
  title:SetTextColor(0.902, 0.788, 0.671)
  title:SetText("Bosses")

  local bossScroll
  bossScroll, bossChild = newScroll("MGADungeonQuestsBossScroll", book)
  bossScroll:SetPoint("TOPLEFT", 10, -50)
  bossScroll:SetSize(338, 362)
  bossChild:SetSize(330, 10)

  scroll, child = newScroll("MGADungeonQuestsScroll", book)
  scroll:SetPoint("TOPLEFT", 398, -18)
  scroll:SetSize(336, 392)
  child:SetSize(TEXT_WIDTH + 8, 10)

  lorePicture = child:CreateTexture(nil, "BACKGROUND")
  lorePicture:SetSize(TEXT_WIDTH, LORE_HEIGHT)
  lorePicture:SetPoint("TOPLEFT", 4, -4)
  lorePicture:SetTexCoord(0, 0.7617187, 0, 0.65625)
  loreBar = fromSheet(child, "ARTWORK", SHEET.nameBar)
  loreBar:SetSize(256, 64)
  loreBar:SetPoint("TOP", lorePicture, "TOP", 0, -24)
  loreTitle = child:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  loreTitle:SetWidth(230)
  loreTitle:SetPoint("CENTER", loreBar, "CENTER", 0, 0)

  for i, tab in ipairs(TABS) do tabs[i] = newTab(i, tab) end
end

local function newFrame()
  local ok, f = pcall(CreateFrame, "Frame", "MGADungeonQuestsFrame", UIParent, "BasicFrameTemplateWithInset")
  if not ok or not f then
    f = CreateFrame("Frame", "MGADungeonQuestsFrame", UIParent)
    local bg = f:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    bg:SetColorTexture(0, 0, 0, 0.85)
  end
  frame = f
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

  crumbs.home = newCrumb("MGADungeonQuestsHome", 70, 12, function() M.Show(nil) end)
  crumbs.home:SetText("Home")
  crumbs.dungeon = newCrumb("MGADungeonQuestsCrumbDungeon", 190, 84, function()
    shownBoss = nil
    openTab(shownTab)
  end)
  crumbs.boss = newCrumb("MGADungeonQuestsCrumbBoss", 210, 276, function() end)
  newGrid()
  newBook()
  return f
end

-- The i-th pooled font string on the right-hand page, placed at y and width wide.
local function textAt(i, y, width)
  local t = texts[i]
  if not t then
    t = child:CreateFontString(nil, "OVERLAY", "GameFontBlack")
    t:SetJustifyH("LEFT")
    t:SetSpacing(3)
    texts[i] = t
  end
  t:ClearAllPoints()
  t:SetPoint("TOPLEFT", 4, y)
  t:SetWidth(width)
  t:Show()
  return t
end

local function pinButton(i)
  if pins[i] then return pins[i] end
  local b = CreateFrame("Button", "MGADungeonQuestsPin" .. i, child, "UIPanelButtonTemplate")
  b:SetSize(PIN_WIDTH, 22)
  b:SetText("Pin")
  pins[i] = b
  return b
end

local function dungeonButton(i)
  if dungeonButtons[i] then return dungeonButtons[i] end
  local b = CreateFrame("Button", "MGADungeonQuestsDungeon" .. i, gridChild)
  b:SetSize(174, 96)
  b:SetPoint("TOPLEFT", (i - 1) % 4 * 188, -math.floor((i - 1) / 4) * 108)
  b.art = b:CreateTexture(nil, "BACKGROUND")
  b.art:SetAllPoints()
  b.art:SetTexCoord(0, 0.68359375, 0, 0.7421875)
  skin(b, SHEET.dungeonUp, SHEET.dungeonDown, SHEET.dungeonLit)
  b.title = b:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  b.title:SetWidth(150)
  b.title:SetPoint("TOP", 0, -15)
  b.status = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  b.status:SetPoint("BOTTOMLEFT", 8, 21)
  b.range = b:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  b.range:SetPoint("BOTTOMLEFT", 8, 8)
  dungeonButtons[i] = b
  return b
end

local function bossButton(i)
  if bossButtons[i] then return bossButtons[i] end
  local b = CreateFrame("Button", "MGADungeonQuestsBoss" .. i, bossChild)
  b:SetSize(325, 55)
  b:SetPoint("TOPLEFT", 4, -14 - (i - 1) * 57)
  skin(b, SHEET.bossUp, SHEET.bossDown, SHEET.bossLit)
  b.portrait = b:CreateTexture(nil, "OVERLAY")
  b.portrait:SetSize(128, 64)
  b.portrait:SetPoint("TOPLEFT", -4, 13)
  b.label = b:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  b.label:SetSize(205, 40)
  b.label:SetPoint("LEFT", 105, -3)
  b.label:SetJustifyH("LEFT")
  b.label:SetTextColor(0.827, 0.659, 0.463)
  bossButtons[i] = b
  return b
end

local function itemIcon(id)
  local icon = C_Item and C_Item.GetItemIconByID and C_Item.GetItemIconByID(id)
  if not icon and GetItemIcon then icon = GetItemIcon(id) end
  return icon or NO_ICON
end

-- What the client knows of an item, under whichever name this client has it.
local function itemInfo(id)
  local get = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  if get then return get(id) end
end

-- The colour code of the item's quality, once the client has the item.
local function itemColour(id)
  local quality = select(3, itemInfo(id))
  local colour = quality and ITEM_QUALITY_COLORS and ITEM_QUALITY_COLORS[quality]
  return colour and colour.hex or nil
end

local function linkItem(id)
  local link = select(2, itemInfo(id))
  if link and IsShiftKeyDown and IsShiftKeyDown() and ChatEdit_InsertLink then ChatEdit_InsertLink(link) end
end

local function lootButton(i)
  if lootButtons[i] then return lootButtons[i] end
  local b = CreateFrame("Button", "MGADungeonQuestsLoot" .. i, child)
  b:SetSize(TEXT_WIDTH, 45)
  b.icon = b:CreateTexture(nil, "BACKGROUND")
  b.icon:SetSize(42, 42)
  b.icon:SetPoint("TOPLEFT", 2, -2)
  local bar = fromSheet(b, "BORDER", SHEET.lootRow)
  bar:SetAllPoints()
  b.label = b:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  b.label:SetSize(215, 14)
  b.label:SetPoint("TOPLEFT", 51, -7)
  b.label:SetJustifyH("LEFT")
  b.sub = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  b.sub:SetSize(215, 12)
  b.sub:SetPoint("BOTTOMLEFT", 51, 7)
  b.sub:SetJustifyH("LEFT")
  b.sub:SetTextColor(0.902, 0.788, 0.671)
  b.chance = b:CreateFontString(nil, "OVERLAY", "GameFontBlack")
  b.chance:SetPoint("RIGHT", -6, 0)
  b:SetScript("OnEnter", function(self)
    if not GameTooltip then return end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetHyperlink("item:" .. self.itemId)
    GameTooltip:Show()
  end)
  b:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  b:SetScript("OnClick", function(self) linkItem(self.itemId) end)
  lootButtons[i] = b
  return b
end

local function hideAll()
  for _, pool in ipairs({ dungeonButtons, bossButtons, lootButtons, texts, pins }) do
    for _, item in pairs(pool) do item:Hide() end -- pairs: a line with no Pin button leaves a gap
  end
  lorePicture:Hide()
  loreBar:Hide()
  loreTitle:Hide()
end

-- A writer that stacks text down the right-hand page from y.
local function pageWriter(y)
  local page = { y = y, used = 0 }
  function page.put(text, width)
    page.used = page.used + 1
    local t = textAt(page.used, page.y, width or TEXT_WIDTH)
    t:SetText(text)
    page.y = page.y - t:GetStringHeight() - GAP
  end
  return page
end

-- Stacks the checklist's title, each line's heading + "Next:" (a Pin button beside it) and its steps.
local function renderChecklist(list)
  local page = pageWriter(-4)
  page.put(list.title)
  for n, block in ipairs(list.blocks) do
    page.y = page.y - GAP
    local topY = page.y
    page.put(block.top, block.pin and (TEXT_WIDTH - PIN_WIDTH - GAP) or TEXT_WIDTH)
    if block.pin then
      local b, step = pinButton(n), block.pin
      b:ClearAllPoints()
      b:SetPoint("TOPRIGHT", child, "TOPRIGHT", -4, topY)
      b:SetScript("OnClick", function() M.Pin(step) end)
      b:Show()
    end
    page.put(block.body)
  end
  page.y = page.y - GAP
  page.put(list.footer)
  child:SetHeight(-page.y + 8)
end

local function renderOverview(dungeon)
  lorePicture:SetTexture(dungeon.art and dungeon.art.lore or ART.LORE)
  lorePicture:Show()
  loreBar:Show()
  loreTitle:SetText(dungeon.name)
  loreTitle:Show()
  local page = pageWriter(-LORE_HEIGHT - 12)
  for _, fact in ipairs(M.Overview(dungeon)) do page.put(WHITE .. fact .. "|r") end
  child:SetHeight(-page.y + 8)
end

local function renderLoot(dungeon, boss)
  local page = pageWriter(-4)
  page.put(GOLD .. (boss and boss.name or (dungeon.name .. " loot")) .. "|r")
  local rows = M.LootRows(dungeon, boss)
  for i, row in ipairs(rows) do
    local b = lootButton(i)
    b:ClearAllPoints()
    b:SetPoint("TOPLEFT", 4, page.y)
    b.itemId = row.id
    b.icon:SetTexture(itemIcon(row.id))
    local colour = itemColour(row.id)
    b.label:SetText(colour and (colour .. row.name .. "|r") or row.name)
    b.sub:SetText(row.sub)
    b.chance:SetText(row.chance)
    b:Show()
    page.y = page.y - LOOT_HEIGHT
  end
  page.y = page.y - GAP
  page.put(GREY .. (#rows == 0 and "No loot listed here." or "Drop chances are Classic's; Forever may differ.") .. "|r")
  child:SetHeight(-page.y + 8)
end

local function renderGrid()
  local rows = M.ListRows()
  for i, row in ipairs(rows) do
    local b = dungeonButton(i)
    local art = row.dungeon.art
    b.art:SetTexture(art and art.button or ART.BUTTON)
    b.title:SetText(row.name)
    b.status:SetText(row.status)
    b.range:SetText(row.range)
    if row.inRange then b.range:SetTextColor(0.25, 1, 0.25) else b.range:SetTextColor(1, 0.82, 0) end
    b:SetScript("OnClick", function() M.Show(row.dungeon) end)
    b:Show()
  end
  gridChild:SetHeight(math.ceil(#rows / 4) * 108)
end

local function renderBosses(dungeon)
  local list = dungeon.bosses or {}
  for i, boss in ipairs(list) do
    local b = bossButton(i)
    b.portrait:SetTexture(boss.portrait or ART.BOSS)
    b.label:SetText(boss.name)
    if boss == shownBoss then b:LockHighlight() else b:UnlockHighlight() end
    b:SetScript("OnClick", function()
      shownBoss = boss
      openTab("loot")
    end)
    b:Show()
  end
  bossChild:SetHeight(#list * 57 + 20)
end

local function renderTabs()
  for i, tab in ipairs(TABS) do
    local on, b = tab.key == shownTab, tabs[i]
    local back = on and SHEET.tabOn or SHEET.tabOff
    b.back:SetTexCoord(back[1], back[2], back[3], back[4])
    if tab.file then
      b.icon:SetAlpha(on and 1 or 0.6)
    else
      local c = on and tab.on or tab.off
      b.icon:SetTexCoord(c[1], c[2], c[3], c[4])
    end
  end
end

local function renderCrumbs()
  if shown then
    crumbs.dungeon:SetText(shown.name)
    crumbs.dungeon:Show()
  else
    crumbs.dungeon:Hide()
  end
  if shown and shownBoss then
    crumbs.boss:SetText(shownBoss.name)
    crumbs.boss:Show()
  else
    crumbs.boss:Hide()
  end
end

render = function()
  hideAll()
  renderCrumbs()
  if not shown then
    book:Hide()
    grid:Show()
    renderGrid()
    return
  end
  grid:Hide()
  book:Show()
  renderBosses(shown)
  renderTabs()
  if shownTab == "overview" then
    renderOverview(shown)
  elseif shownTab == "loot" then
    renderLoot(shown, shownBoss)
  else
    renderChecklist(M.Checklist(shown))
  end
end

-- Opens the journal on a dungeon's quests (nil = the grid of dungeons).
function M.Show(dungeon)
  frame = frame or newFrame()
  shown, shownBoss, shownTab = dungeon, nil, "quests"
  render()
  resetScroll()
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
    say("/mgadq opens the dungeon you're in, else the journal. /mgadq <dungeon> (deadmines, sfk, vc...) opens one. /mgadq list. /mgadq remind on|off.")
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

-- Items arrive from the server one by one: redraw the Loot tab once for a batch of them.
local lootRedrawQueued = false
local function redrawLoot()
  lootRedrawQueued = false
  if frame and frame:IsShown() and shown and shownTab == "loot" then render() end
end

local function itemArrived()
  if not (C_Timer and C_Timer.After) then return redrawLoot() end
  if lootRedrawQueued then return end
  lootRedrawQueued = true
  C_Timer.After(0.2, redrawLoot)
end

local events = CreateFrame("Frame")
for _, e in ipairs({ "PLAYER_ENTERING_WORLD", "QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "QUEST_LOG_UPDATE", "PLAYER_LEVEL_UP", "GET_ITEM_INFO_RECEIVED" }) do
  events:RegisterEvent(e)
end
events:SetScript("OnEvent", function(_, event, _, isReloadingUi)
  if event == "PLAYER_ENTERING_WORLD" then
    if isReloadingUi then return end
    -- The quest log and completed quests may not be filled in yet as the loading screen ends.
    if C_Timer and C_Timer.After then C_Timer.After(3, remind) else remind() end
  elseif event == "GET_ITEM_INFO_RECEIVED" then
    itemArrived()
  elseif frame and frame:IsShown() then
    render()
  end
end)
