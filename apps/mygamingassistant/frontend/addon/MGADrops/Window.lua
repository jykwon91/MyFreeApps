-- MGA Drops, the lookup window: type part of a creature's name, pick it, and see everything it drops with
-- Classic's chances (for your faction). Hover a drop for its item tooltip. Drag the title to move it; the
-- wheel scrolls. Built the first time it opens, never at load.

local M = MGADrops
local UI = MGAHub.UI

local WIDTH, HEIGHT = 444, 480
local ROW_HEIGHT, VISIBLE_ROWS = 18, 20
local TEXT_WIDTH = WIDTH - 60
local CHANCE_WIDTH = 120

local frame
local state = { offset = 0, query = "", mob = nil, fromSearch = false }
local rows, lines = {}, {}
local scrollList

local function drawRows()
  local overflow = math.max(0, #lines - VISIBLE_ROWS)
  state.offset = math.min(state.offset, overflow)
  scrollList.Sync(#lines, state.offset)
  for i, row in ipairs(rows) do
    local line = lines[state.offset + i]
    row.line = line
    if line then
      row.text:SetText(line.text)
      row.chance:SetText(line.chance or "")
      row:Show()
    else
      row:Hide()
    end
  end
end

-- What the window lists now: the creature's drops, or the creatures matching the search.
function M.CurrentLines()
  if state.mob then return M.WindowLines(state.mob, M.Faction()) end
  local mobs, total = M.Search(state.query)
  local out = {}
  for _, mob in ipairs(mobs) do table.insert(out, { kind = "mob", text = M.MobLabel(mob), mob = mob }) end
  if total and total > #mobs then
    table.insert(out, { kind = "note", text = "|cff9d9d9d" .. (total - #mobs) .. " more: type more of the name|r" })
  end
  if #out == 0 then
    local hint = state.query == "" and "Type part of a creature's name." or "No creature by that name has drop data."
    table.insert(out, { kind = "note", text = "|cff9d9d9d" .. hint .. "|r" })
  end
  return out
end

local function refresh()
  if not frame then return end
  if state.mob then
    frame.heading:SetText(M.MobLabel(state.mob))
  else
    frame.heading:SetText(state.query == "" and "Find a creature" or ("Creatures named \"" .. state.query .. "\""))
  end
  if state.mob and state.fromSearch then frame.back:Show() else frame.back:Hide() end
  lines = M.CurrentLines()
  drawRows()
end

local function showMob(mob, fromSearch)
  state.mob, state.fromSearch, state.offset = mob, fromSearch, 0
  refresh()
end

local function clickLine(line)
  if line and line.kind == "mob" then showMob(line.mob, true) end
end

local function buildRow(i)
  local row = CreateFrame("Button", "MGADropsRow" .. i, frame)
  row:SetSize(TEXT_WIDTH, ROW_HEIGHT)
  row:SetPoint("TOPLEFT", frame.listTop, "BOTTOMLEFT", 0, -(i - 1) * ROW_HEIGHT)
  row.highlight = UI.Highlight(row)
  row.text = row:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  row.text:SetPoint("LEFT", row, "LEFT", 2, 0)
  row.text:SetWidth(TEXT_WIDTH - CHANCE_WIDTH)
  row.text:SetJustifyH("LEFT")
  row.chance = row:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  row.chance:SetPoint("RIGHT", row, "RIGHT", -2, 0)
  row.chance:SetWidth(CHANCE_WIDTH)
  row.chance:SetJustifyH("RIGHT")
  row:SetScript("OnEnter", function(self)
    local line = self.line
    if not line then return end
    if line.kind == "mob" then self.highlight:Show() end
    if line.kind == "drop" and GameTooltip.SetItemByID then
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:SetItemByID(line.item)
      GameTooltip:Show()
    end
  end)
  row:SetScript("OnLeave", function(self)
    self.highlight:Hide()
    if GameTooltip:GetOwner() == self then GameTooltip:Hide() end
  end)
  row:SetScript("OnClick", function(self) clickLine(self.line) end)
  rows[i] = row
end

local function build()
  frame = UI.Window("MGADropsWindow", "MGA Drops", WIDTH, HEIGHT)
  frame.note = UI.Label(frame, M.HEADER_NOTE .. ".", "GameFontDisableSmall", frame.top, -2)

  frame.search = CreateFrame("EditBox", "MGADropsSearch", frame, "InputBoxTemplate")
  frame.search:SetSize(200, 22)
  frame.search:SetPoint("TOPLEFT", frame.note, "BOTTOMLEFT", 6, -8)
  frame.search:SetAutoFocus(false)
  frame.search:SetScript("OnTextChanged", function(self, typed)
    if typed == false then return end
    state.query, state.mob, state.offset = self:GetText() or "", nil, 0
    refresh()
  end)
  frame.search:SetScript("OnEscapePressed", function() frame:Hide() end)
  frame.searchHint = frame:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  frame.searchHint:SetPoint("LEFT", frame.search, "RIGHT", 6, 0)
  frame.searchHint:SetText("Search by name")

  frame.heading = frame:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
  frame.heading:SetPoint("TOPLEFT", frame.search, "BOTTOMLEFT", -6, -10)
  frame.heading:SetJustifyH("LEFT")
  frame.back = UI.Button(frame, "MGADropsBack", "Back to results", 130, function()
    showMob(nil, false)
  end)
  frame.back:SetPoint("TOP", frame.heading, "TOP", 0, 5)
  frame.back:SetPoint("RIGHT", frame, "RIGHT", -16, 0)

  frame.listTop = CreateFrame("Frame", nil, frame)
  frame.listTop:SetSize(1, 1)
  frame.listTop:SetPoint("TOPLEFT", frame.heading, "BOTTOMLEFT", 0, -6)
  scrollList = UI.ScrollList(frame, "MGADropsScroll", TEXT_WIDTH, ROW_HEIGHT, VISIBLE_ROWS, function(offset)
    state.offset = offset
    drawRows()
  end)
  scrollList.scroll:SetPoint("TOPLEFT", frame.listTop, "BOTTOMLEFT", 0, 0)
  for i = 1, VISIBLE_ROWS do buildRow(i) end
  frame:Hide()
end

local function show()
  if not frame then build() end
  frame:Show()
  refresh()
end

-- Opens on one creature's drops; with no creature (or one Classic has no drops for), on the search.
function M.OpenFor(npc)
  local mob = M.Mob(npc)
  if npc and not mob then M.Say("your target has " .. M.NO_DATA .. ". Search for a creature by name instead.") end
  state.mob, state.fromSearch, state.offset = mob, false, 0
  show()
end

-- Opens on a name search; a single match opens straight on its drops.
function M.OpenSearch(text)
  state.query, state.mob, state.offset = text, nil, 0
  if not frame then build() end
  frame.search:SetText(text)
  local mobs, total = M.Search(text)
  if total == 1 then
    frame:Show()
    return showMob(mobs[1], false)
  end
  show()
end

function M.WindowShown()
  return frame ~= nil and frame:IsShown()
end
