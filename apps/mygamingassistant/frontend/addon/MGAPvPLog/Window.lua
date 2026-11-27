-- MGA PvP Log, the window: a filter across the top (All / Killed me / I killed), the newest encounters first
-- (two lines each: who, then where / when / what happened), and a Clear log button that asks again in the
-- window. Drag it to move it; the wheel scrolls. Each row has a Track / Untrack button; the Tracked tab lists
-- the kill-on-sight list with where you last saw each one, and "Go to last seen" when MGA Waypoints is installed.

local M = MGAPvPLog
local UI = MGAHub.UI

local WIDTH, HEIGHT = 724, 460
local TEXT_WIDTH = 470
local ROW_WIDTH = WIDTH - 56
local ROW_HEIGHT, VISIBLE_ROWS = 34, 10
local CLEAR_TEXT, CONFIRM_TEXT = "Clear log", "Click again to clear"
local EMPTY_LOG = "Nothing logged yet. Enemy players who fight or kill you show up here."
local EMPTY_TRACKED = "Nobody tracked yet. Press Track on a row, or type /mgapvp track <name>."

local frame
local state = { filter = "all", offset = 0, confirming = false }
local filterButtons, rows, lines = {}, {}, {}
local scrollList

local function drawRows()
  state.offset = math.min(state.offset, math.max(0, #lines - VISIBLE_ROWS))
  scrollList.Sync(#lines, state.offset)
  for i, row in ipairs(rows) do
    local line = lines[state.offset + i]
    if line then
      row.head:SetText(line.head)
      row.detail:SetText(line.detail)
      row.track:SetText(line.tracked and "Untrack" or "Track")
      if line.go then row.go:Show() else row.go:Hide() end
      row:Show()
    else
      row:Hide()
    end
  end
  frame.empty:SetText(state.filter == "tracked" and EMPTY_TRACKED or EMPTY_LOG)
  if #lines == 0 then frame.empty:Show() else frame.empty:Hide() end
end

local function refresh()
  if not frame then return end
  for i, button in ipairs(filterButtons) do
    local f = M.FILTERS[i]
    button.select(f.id == state.filter)
  end
  frame.clear:SetText(state.confirming and CONFIRM_TEXT or CLEAR_TEXT)
  lines = M.Rows(state.filter)
  drawRows()
end

local function buildRow(i)
  local row = CreateFrame("Frame", "MGAPvPLogRow" .. i, frame)
  row:SetSize(ROW_WIDTH, ROW_HEIGHT)
  row:SetPoint("TOPLEFT", frame, "TOPLEFT", 16, -70 - (i - 1) * ROW_HEIGHT)
  row.head = row:CreateFontString("MGAPvPLogRow" .. i .. "Head", "ARTWORK", "GameFontNormal")
  row.head:SetPoint("TOPLEFT", row, "TOPLEFT", 0, 0)
  row.head:SetJustifyH("LEFT")
  row.head:SetWidth(TEXT_WIDTH)
  row.head:SetWordWrap(false)
  row.detail = row:CreateFontString("MGAPvPLogRow" .. i .. "Detail", "ARTWORK", "GameFontHighlightSmall")
  row.detail:SetPoint("TOPLEFT", row.head, "BOTTOMLEFT", 0, -2)
  row.detail:SetJustifyH("LEFT")
  row.detail:SetWidth(TEXT_WIDTH)
  row.detail:SetWordWrap(false)
  row.track = UI.Button(row, "MGAPvPLogRow" .. i .. "Track", "Track", 80, function()
    local line = lines[state.offset + i]
    if line then M.ToggleTracked(line.name) end
  end)
  row.track:SetPoint("TOPRIGHT", row, "TOPRIGHT", 0, 0)
  row.go = UI.Button(row, "MGAPvPLogRow" .. i .. "Go", "Go to last seen", 110, function()
    local line = lines[state.offset + i]
    if line and line.go and MGAWaypoints and MGAWaypoints.SetTarget then MGAWaypoints.SetTarget(line.go) end
  end)
  row.go:SetPoint("TOPRIGHT", row, "TOPRIGHT", -84, 0)
  rows[i] = row
end

local function build()
  frame = UI.Window("MGAPvPLogWindow", "MGA PvP Log", WIDTH, HEIGHT)
  frame:SetScript("OnHide", function()
    state.confirming = false
    refresh()
  end)

  for i, f in ipairs(M.FILTERS) do
    local button = UI.Tab(frame, "MGAPvPLogFilter" .. i, f.label, 110, function()
      state.filter, state.offset = f.id, 0
      refresh()
    end)
    button:SetPoint("TOPLEFT", frame, "TOPLEFT", 16 + (i - 1) * 116, -34)
    filterButtons[i] = button
  end

  scrollList = UI.ScrollList(frame, "MGAPvPLogScroll", ROW_WIDTH, ROW_HEIGHT, VISIBLE_ROWS, function(offset)
    state.offset = offset
    drawRows()
  end)
  scrollList.scroll:SetPoint("TOPLEFT", frame, "TOPLEFT", 16, -70)
  for i = 1, VISIBLE_ROWS do buildRow(i) end

  frame.empty = frame:CreateFontString("MGAPvPLogEmpty", "ARTWORK", "GameFontDisable")
  frame.empty:SetPoint("TOP", frame, "TOP", 0, -130)
  frame.empty:SetText(EMPTY_LOG)

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
