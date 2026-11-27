-- MGA Explorer, the window: the Explore Azeroth summary, Next unexplored / Stop buttons, then every zone the
-- challenge counts (your continent and your zone first). Click a zone to open its unexplored areas; click
-- an area to be guided there. Drag the title to move it; the wheel scrolls.

local M = MGAExplorer
local UI = MGAHub.UI

local WIDTH, HEIGHT = 460, 540
local ROW_HEIGHT, VISIBLE_ROWS = 18, 20
local TEXT_WIDTH = WIDTH - 36

local frame
local state = { offset = 0, expanded = {}, seeded = false }
local rows, lines = {}, {}

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
  if not state.seeded then
    local here = M.CurrentZone()
    if here then state.expanded[here.map] = true end
    state.seeded = true
  end
  frame.summary:SetText(M.Summary())
  frame.source:SetText(M.SOURCE_TEXT[M.Source()])
  local area = M.guiding
  frame.guiding:SetText(area and ("Guiding you to " .. area.name .. " in " .. area.zone.name .. ".") or "Not guiding anywhere.")
  frame.mapPins:SetChecked(M.Settings().mapPins)
  lines = M.Lines(state.expanded)
  drawRows()
end

local function clickLine(line)
  if not line then return end
  if line.kind == "zone" then
    state.expanded[line.zone.map] = not state.expanded[line.zone.map] or nil
    refresh()
  elseif line.kind == "area" then
    M.Guide(line.area)
    refresh()
  end
end

local function buildRow(i)
  local row = CreateFrame("Button", "MGAExplorerRow" .. i, frame)
  row:SetSize(TEXT_WIDTH, ROW_HEIGHT)
  row:SetPoint("TOPLEFT", frame.listTop, "BOTTOMLEFT", 0, -(i - 1) * ROW_HEIGHT)
  row.highlight = row:CreateTexture(nil, "BACKGROUND")
  row.highlight:SetAllPoints(row)
  row.highlight:SetColorTexture(1, 1, 1, 0.15)
  row.highlight:Hide()
  row.text = row:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  row.text:SetPoint("LEFT", row, "LEFT", 2, 0)
  row.text:SetJustifyH("LEFT")
  row:SetScript("OnEnter", function(self)
    if self.line and (self.line.kind == "zone" or self.line.kind == "area") then self.highlight:Show() end
  end)
  row:SetScript("OnLeave", function(self) self.highlight:Hide() end)
  row:SetScript("OnClick", function(self) clickLine(self.line) end)
  rows[i] = row
end

local function build()
  frame = CreateFrame("Frame", "MGAExplorerWindow", UIParent)
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
  table.insert(UISpecialFrames, "MGAExplorerWindow")

  frame.title = frame:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
  frame.title:SetPoint("TOPLEFT", frame, "TOPLEFT", 16, -12)
  frame.title:SetText("MGA Explorer")
  local close = CreateFrame("Button", "MGAExplorerClose", frame, "UIPanelCloseButton")
  close:SetPoint("TOPRIGHT", frame, "TOPRIGHT", -2, -2)

  frame.summary = UI.Label(frame, "", "GameFontHighlight", frame.title, -8)
  frame.source = UI.Label(frame, "", "GameFontDisableSmall", frame.summary, -4)
  frame.source:SetWidth(TEXT_WIDTH)

  local nextButton = UI.Button(frame, "MGAExplorerNext", "Next unexplored", 130, function()
    M.GuideNext()
    refresh()
  end)
  nextButton:SetPoint("TOPLEFT", frame.source, "BOTTOMLEFT", 0, -8)
  local stopButton = UI.Button(frame, "MGAExplorerStop", "Stop guiding", 110, function()
    M.Stop()
    refresh()
  end)
  stopButton:SetPoint("LEFT", nextButton, "RIGHT", 8, 0)
  frame.mapPins = CreateFrame("CheckButton", "MGAExplorerMapPinsCheck", frame, "UICheckButtonTemplate")
  frame.mapPins:SetPoint("LEFT", stopButton, "RIGHT", 8, 0)
  frame.mapPins.text = frame.mapPins:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  frame.mapPins.text:SetPoint("LEFT", frame.mapPins, "RIGHT", 2, 0)
  frame.mapPins.text:SetText("World Map pins")
  frame.mapPins:SetScript("OnClick", function(self) M.SetMapPins(self:GetChecked() and true or false) end)

  frame.guiding = UI.Label(frame, "", "GameFontNormalSmall", nextButton, -8)
  frame.listTop = UI.Label(frame, "Every zone below counts toward " .. MGAExplorerData.name .. ". Click a zone to see what's left.", "GameFontDisableSmall", frame.guiding, -6)

  for i = 1, VISIBLE_ROWS do buildRow(i) end
  frame:Hide()
end

function M.Toggle()
  if not frame then build() end
  if frame:IsShown() then return frame:Hide() end
  state.offset = 0
  frame:Show()
  refresh()
end

function M.Open()
  if not frame then build() end
  frame:Show()
  refresh()
end

function M.RefreshWindow()
  if frame and frame:IsShown() then refresh() end
end
