-- MGA Professions, the window: a list of professions on the left (yours first), tabs across the top, and
-- the lines Core.lua builds for the open profession and tab. A line with a place pins it when clicked.
-- Drag the title to move it; the wheel scrolls.

local M = MGAProfessions
local UI = MGAHub.UI

local WIDTH, HEIGHT = 640, 520
local LIST_WIDTH, ROW_HEIGHT, VISIBLE_ROWS = 130, 18, 21
local TEXT_WIDTH = WIDTH - LIST_WIDTH - 52

local frame
local state = { key = nil, tab = "route", offset = 0, full = false }
local listButtons, tabButtons, rows, lines = {}, {}, {}, {}

local function visibleTabs(key)
  local tabs = {}
  for _, tab in ipairs(M.TABS) do
    if tab.id ~= "where" or M.HasWhere(key) then table.insert(tabs, tab) end
  end
  return tabs
end

local function drawRows()
  local overflow = math.max(0, #lines - VISIBLE_ROWS)
  state.offset = math.min(state.offset, overflow)
  for i, row in ipairs(rows) do
    local line = lines[state.offset + i]
    row.line = line
    if line then
      row.text:SetText(line.text)
      row:Show()
    else
      row:Hide()
    end
  end
end

local function refresh()
  if not frame then return end
  local key = state.key
  local prof = M.Profession(key)
  frame.title:SetText("MGA Professions: " .. prof.label)
  local order, ownCount = M.ProfessionOrder()
  for i, button in ipairs(listButtons) do
    local k = order[i]
    button.key = k
    button:SetText((k == key and "[" or "") .. M.Profession(k).label .. (k == key and "]" or ""))
    button.own = i <= ownCount
  end
  local tabs = visibleTabs(key)
  if not M.HasWhere(key) and state.tab == "where" then state.tab = "route" end
  for i, button in ipairs(tabButtons) do
    local tab = tabs[i]
    if tab then
      button.tab = tab.id
      button:SetText(tab.id == state.tab and ("[" .. tab.label .. "]") or tab.label)
      button:Show()
    else
      button:Hide()
    end
  end
  local _, from = M.Skill(key)
  frame.skillBox:SetText(from == "game" and "" or tostring(M.Settings().skills[key] or ""))
  frame.skillNote:SetText(from == "game" and "Skill read from the game" or "Skill (type it in; the game gave none)")
  frame.full:SetChecked(state.full)
  if state.tab == "route" then frame.full:Show() else frame.full:Hide() end
  lines = M.Lines(key, state.tab, state.full)
  drawRows()
end

local function buildRow(i)
  local row = CreateFrame("Button", "MGAProfessionsRow" .. i, frame)
  row:SetSize(TEXT_WIDTH, ROW_HEIGHT)
  row:SetPoint("TOPLEFT", frame.listTop, "BOTTOMLEFT", 0, -(i - 1) * ROW_HEIGHT)
  row.highlight = row:CreateTexture(nil, "BACKGROUND")
  row.highlight:SetAllPoints(row)
  row.highlight:SetColorTexture(1, 1, 1, 0.15)
  row.highlight:Hide()
  row.text = row:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  row.text:SetPoint("LEFT", row, "LEFT", 2, 0)
  row.text:SetJustifyH("LEFT")
  row:SetScript("OnEnter", function(self) if self.line and self.line.place then self.highlight:Show() end end)
  row:SetScript("OnLeave", function(self) self.highlight:Hide() end)
  row:SetScript("OnClick", function(self) if self.line and self.line.place then M.Pin(self.line.place) end end)
  rows[i] = row
end

local function build()
  frame = CreateFrame("Frame", "MGAProfessionsWindow", UIParent)
  frame:SetSize(WIDTH, HEIGHT)
  frame:SetPoint("CENTER", UIParent, "CENTER", 0, 20)
  frame:SetFrameStrata("DIALOG")
  frame:SetMovable(true)
  frame:EnableMouse(true)
  frame:SetClampedToScreen(true)
  frame:RegisterForDrag("LeftButton")
  frame:SetScript("OnDragStart", function(self) self:StartMoving() end)
  frame:SetScript("OnDragStop", function(self) self:StopMovingOrSizing() end)
  frame:EnableMouseWheel(true)
  frame:SetScript("OnMouseWheel", function(_, delta)
    state.offset = math.max(0, state.offset - delta * 3)
    drawRows()
  end)
  frame.background = frame:CreateTexture(nil, "BACKGROUND")
  frame.background:SetAllPoints(frame)
  frame.background:SetColorTexture(0, 0, 0, 0.9)
  table.insert(UISpecialFrames, "MGAProfessionsWindow")

  frame.title = frame:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
  frame.title:SetPoint("TOPLEFT", frame, "TOPLEFT", 16, -12)
  local close = CreateFrame("Button", "MGAProfessionsClose", frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -2, -2)

  for i = 1, #MGAProfessionsData.order do
    local button = UI.Button(frame, "MGAProfessionsList" .. i, "", LIST_WIDTH, function(self)
      state.key, state.offset = self.key, 0
      refresh()
    end)
    button:SetPoint("TOPLEFT", frame, "TOPLEFT", 12, -40 - (i - 1) * 26)
    listButtons[i] = button
  end

  for i = 1, #M.TABS do
    local button = UI.Button(frame, "MGAProfessionsTab" .. i, "", 90, function(self)
      state.tab, state.offset = self.tab, 0
      refresh()
    end)
    button:SetPoint("TOPLEFT", frame, "TOPLEFT", LIST_WIDTH + 24 + (i - 1) * 94, -40)
    tabButtons[i] = button
  end

  frame.listTop = frame:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  frame.listTop:SetPoint("TOPLEFT", frame, "TOPLEFT", LIST_WIDTH + 28, -72)

  frame.full = CreateFrame("CheckButton", "MGAProfessionsFull", frame, "UICheckButtonTemplate")
  frame.full:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -110, -38)
  frame.full.text = frame.full:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  frame.full.text:SetPoint("LEFT", frame.full, "RIGHT", 2, 0)
  frame.full.text:SetText("Full route")
  frame.full:SetScript("OnClick", function(self)
    state.full, state.offset = self:GetChecked() and true or false, 0
    refresh()
  end)

  for i = 1, VISIBLE_ROWS do buildRow(i) end

  frame.skillNote = frame:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  frame.skillNote:SetPoint("BOTTOMLEFT", frame, "BOTTOMLEFT", LIST_WIDTH + 28, 14)
  frame.skillBox = CreateFrame("EditBox", "MGAProfessionsSkillBox", frame, "InputBoxTemplate")
  frame.skillBox:SetSize(44, 20)
  frame.skillBox:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -20, 10)
  frame.skillBox:SetAutoFocus(false)
  frame.skillBox:SetNumeric(true)
  frame.skillBox:SetMaxLetters(3)
  frame.skillBox:SetScript("OnEnterPressed", function(self)
    local value = tonumber(self:GetText())
    if value and value >= 1 and value <= 300 then M.SetSkill(state.key, value) end
    self:ClearFocus()
    refresh()
  end)
  frame.skillBox:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  frame:Hide()
end

-- Opens the window on a profession (default: yours, else the first); calling it on the open window closes it.
function M.Toggle(key)
  if not frame then build() end
  if frame:IsShown() and (key == nil or key == state.key) then return frame:Hide() end
  state.key = key or state.key or M.DefaultKey()
  state.offset = 0
  frame:Show()
  refresh()
end

function M.Open(key)
  if not frame then build() end
  state.key = key or state.key or M.DefaultKey()
  state.offset = 0
  frame:Show()
  refresh()
end

function M.Refresh()
  if frame and frame:IsShown() then refresh() end
end
