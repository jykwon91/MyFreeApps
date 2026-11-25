-- MGA PvP Log, the window: a filter across the top (All / Killed me / I killed), the newest encounters first
-- (two lines each: who, then where / when / what happened), and a Clear log button that asks again in the
-- window. Drag it to move it; the wheel scrolls.

local M = MGAPvPLog
local UI = MGAHub.UI

local WIDTH, HEIGHT = 600, 470
local ROW_HEIGHT, VISIBLE_ROWS = 34, 10
local CLEAR_TEXT, CONFIRM_TEXT = "Clear log", "Click again to clear"

local frame
local state = { filter = "all", offset = 0, confirming = false }
local filterButtons, rows, lines = {}, {}, {}

local function drawRows()
  state.offset = math.min(state.offset, math.max(0, #lines - VISIBLE_ROWS))
  for i, row in ipairs(rows) do
    local line = lines[state.offset + i]
    if line then
      row.head:SetText(line.head)
      row.detail:SetText(line.detail)
      row:Show()
    else
      row:Hide()
    end
  end
  if #lines == 0 then frame.empty:Show() else frame.empty:Hide() end
end

local function refresh()
  if not frame then return end
  for i, button in ipairs(filterButtons) do
    local f = M.FILTERS[i]
    button:SetText(f.id == state.filter and ("[" .. f.label .. "]") or f.label)
  end
  frame.clear:SetText(state.confirming and CONFIRM_TEXT or CLEAR_TEXT)
  lines = M.Rows(state.filter)
  drawRows()
end

local function buildRow(i)
  local row = CreateFrame("Frame", "MGAPvPLogRow" .. i, frame)
  row:SetSize(WIDTH - 32, ROW_HEIGHT)
  row:SetPoint("TOPLEFT", frame, "TOPLEFT", 16, -76 - (i - 1) * ROW_HEIGHT)
  row.head = row:CreateFontString("MGAPvPLogRow" .. i .. "Head", "ARTWORK", "GameFontNormal")
  row.head:SetPoint("TOPLEFT", row, "TOPLEFT", 0, 0)
  row.head:SetJustifyH("LEFT")
  row.detail = row:CreateFontString("MGAPvPLogRow" .. i .. "Detail", "ARTWORK", "GameFontHighlightSmall")
  row.detail:SetPoint("TOPLEFT", row.head, "BOTTOMLEFT", 0, -2)
  row.detail:SetJustifyH("LEFT")
  rows[i] = row
end

local function build()
  frame = CreateFrame("Frame", "MGAPvPLogWindow", UIParent)
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
    state.offset = math.max(0, state.offset - delta * 2)
    drawRows()
  end)
  frame:SetScript("OnHide", function()
    state.confirming = false
    refresh()
  end)
  frame.background = frame:CreateTexture(nil, "BACKGROUND")
  frame.background:SetAllPoints(frame)
  frame.background:SetColorTexture(0, 0, 0, 0.9)
  table.insert(UISpecialFrames, "MGAPvPLogWindow")

  frame.title = frame:CreateFontString("MGAPvPLogTitle", "ARTWORK", "GameFontNormalLarge")
  frame.title:SetPoint("TOPLEFT", frame, "TOPLEFT", 16, -12)
  frame.title:SetText("MGA PvP Log")
  local close = CreateFrame("Button", "MGAPvPLogClose", frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -2, -2)

  for i, f in ipairs(M.FILTERS) do
    local button = UI.Button(frame, "MGAPvPLogFilter" .. i, f.label, 110, function()
      state.filter, state.offset = f.id, 0
      refresh()
    end)
    button:SetPoint("TOPLEFT", frame, "TOPLEFT", 16 + (i - 1) * 116, -40)
    filterButtons[i] = button
  end

  for i = 1, VISIBLE_ROWS do buildRow(i) end

  frame.empty = frame:CreateFontString("MGAPvPLogEmpty", "ARTWORK", "GameFontDisable")
  frame.empty:SetPoint("TOP", frame, "TOP", 0, -120)
  frame.empty:SetText("Nothing logged yet. Enemy players who fight or kill you show up here.")

  frame.clear = UI.Button(frame, "MGAPvPLogClear", CLEAR_TEXT, 160, function()
    if state.confirming then
      state.confirming = false
      M.Clear()
    else
      state.confirming = true
    end
    refresh()
  end)
  frame.clear:SetPoint("BOTTOMRIGHT", frame, "BOTTOMRIGHT", -16, 12)
  frame:Hide()
end

function M.Toggle()
  if not frame then build() end
  if frame:IsShown() then return frame:Hide() end
  state.offset = 0
  frame:Show()
  refresh()
end

function M.Refresh()
  if frame and frame:IsShown() then refresh() end
end
