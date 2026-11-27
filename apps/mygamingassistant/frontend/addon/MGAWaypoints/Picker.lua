-- MGA Waypoints, the "Go to..." window: pick a kind of place (or type a name), pick a row, and the arrow
-- and pins point you there. Rows are the nearest first; the wheel scrolls.

local M = MGAWaypoints
local UI = MGAHub.UI

local WIDTH, ROW_HEIGHT, VISIBLE_ROWS = 464, 24, 10
local ROW_WIDTH = WIDTH - 56
local CATEGORY_COLUMNS, CATEGORY_WIDTH = 4, 100
local NOTE = "Distances are straight lines. Places come from Classic data and may sit elsewhere in Forever."
local PROFESSION_NAMES = {
  all = "All professions", alchemy = "Alchemy", blacksmithing = "Blacksmithing", cooking = "Cooking", enchanting = "Enchanting",
  engineering = "Engineering", first_aid = "First Aid", fishing = "Fishing", herbalism = "Herbalism",
  leatherworking = "Leatherworking", mining = "Mining", skinning = "Skinning", tailoring = "Tailoring",
}

local picker
local state = { category = "class", query = "", offset = 0, profession = "all" }
local results = {}
local categoryButtons, rows = {}, {}
local scrollList

local function rowText(place)
  local where = place.sub ~= "" and (place.zone .. ", " .. place.sub) or place.zone
  local detail = place.title ~= "" and (place.title .. " - " .. where) or where
  local yards = place.yards and M.YardsText(place.yards) or ""
  return place.name, detail, yards
end

local function refresh()
  local settings = M.Settings()
  results = M.Search({
    category = state.category, query = state.query, scope = settings.scope,
    otherSide = settings.otherSide, profession = state.profession,
  })
  local overflow = math.max(0, #results - VISIBLE_ROWS)
  state.offset = math.min(state.offset, overflow)
  scrollList.Sync(#results, state.offset)
  for i, row in ipairs(rows) do
    local place = results[state.offset + i]
    row.place = place
    if place then
      local name, detail, yards = rowText(place)
      row.name:SetText(name)
      row.detail:SetText(detail)
      row.yards:SetText(yards)
      row:Show()
    else
      row:Hide()
    end
  end
  picker.empty:SetText(#results == 0 and "Nothing found. Try another scope, or type a name." or "")
  picker.scope:SetText(M.SCOPE_TEXT[settings.scope])
  picker.side:SetText(settings.otherSide and "Both factions" or "My faction")
  for _, button in ipairs(categoryButtons) do
    button.select(button.id == state.category and state.query == "")
  end
  if picker.profession then
    if state.category == "prof" and state.query == "" then picker.profession:Show() else picker.profession:Hide() end
    picker.profession.refresh()
  end
end

local function choose(place)
  M.SetTarget(place)
  M.Say("Guiding you to " .. place.name .. " in " .. place.zone .. ". Right-click the arrow to clear it.")
  picker:Hide()
end

local function nextScope()
  local settings = M.Settings()
  for i, scope in ipairs(M.SCOPES) do
    if scope == settings.scope then
      settings.scope = M.SCOPES[i % #M.SCOPES + 1]
      break
    end
  end
  state.offset = 0
  refresh()
end

local function buildRow(i)
  local row = CreateFrame("Button", "MGAWaypointsPickerRow" .. i, picker)
  row:SetSize(ROW_WIDTH, ROW_HEIGHT)
  row:SetPoint("TOPLEFT", picker.listTop, "BOTTOMLEFT", 0, -(i - 1) * ROW_HEIGHT)
  row.highlight = UI.Highlight(row)
  row.name = row:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
  row.name:SetPoint("TOPLEFT", row, "TOPLEFT", 4, -1)
  row.name:SetJustifyH("LEFT")
  row.detail = row:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  row.detail:SetPoint("BOTTOMLEFT", row, "BOTTOMLEFT", 4, 1)
  row.detail:SetJustifyH("LEFT")
  row.yards = row:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  row.yards:SetPoint("RIGHT", row, "RIGHT", -4, 0)
  row:SetScript("OnEnter", function(self) self.highlight:Show() end)
  row:SetScript("OnLeave", function(self) self.highlight:Hide() end)
  row:SetScript("OnClick", function(self) if self.place then choose(self.place) end end)
  rows[i] = row
end

local function build()
  picker = UI.Window("MGAWaypointsPicker", "Go to...", WIDTH, 120 + VISIBLE_ROWS * ROW_HEIGHT + 56)
  picker:SetPoint("CENTER", UIParent, "CENTER", 0, 40)

  local previous
  for i, category in ipairs(M.CATEGORIES) do
    local button = UI.Tab(picker, "MGAWaypointsCategory" .. category.id, category.label, CATEGORY_WIDTH, function()
      state.category, state.query, state.offset = category.id, "", 0
      picker.search:SetText("")
      refresh()
    end)
    button.id, button.label = category.id, category.label
    local column, line = (i - 1) % CATEGORY_COLUMNS, math.floor((i - 1) / CATEGORY_COLUMNS)
    button:SetPoint("TOPLEFT", picker, "TOPLEFT", 16 + column * (CATEGORY_WIDTH + 4), -34 - line * 28)
    table.insert(categoryButtons, button)
    previous = button
  end

  picker.search = CreateFrame("EditBox", "MGAWaypointsSearch", picker, "InputBoxTemplate")
  picker.search:SetSize(190, 22)
  picker.search:SetPoint("TOPLEFT", previous, "BOTTOMLEFT", 8 - (CATEGORY_COLUMNS - 1) * (CATEGORY_WIDTH + 4), -8)
  picker.search:SetAutoFocus(false)
  picker.search:SetScript("OnTextChanged", function(self)
    state.query, state.offset = self:GetText() or "", 0
    refresh()
  end)
  picker.search:SetScript("OnEscapePressed", function() picker:Hide() end)
  picker.searchHint = picker:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  picker.searchHint:SetPoint("LEFT", picker.search, "RIGHT", 6, 0)
  picker.searchHint:SetText("Search by name")

  picker.scope = UI.Button(picker, "MGAWaypointsScope", "", 120, nextScope)
  picker.scope:SetPoint("TOPLEFT", picker.search, "BOTTOMLEFT", -8, -6)
  picker.side = UI.Button(picker, "MGAWaypointsSide", "", 110, function()
    local settings = M.Settings()
    settings.otherSide = not settings.otherSide
    state.offset = 0
    refresh()
  end)
  picker.side:SetPoint("LEFT", picker.scope, "RIGHT", 4, 0)
  picker.profession = UI.Dropdown(picker, "MGAWaypointsProfession", 140, function()
    local choices = { { value = "all", text = PROFESSION_NAMES.all } }
    for _, key in ipairs(M.PROFESSIONS) do table.insert(choices, { value = key, text = PROFESSION_NAMES[key] }) end
    return choices
  end, function() return state.profession end, function(value)
    state.profession, state.offset = value, 0
    refresh()
  end)
  picker.profession:SetPoint("LEFT", picker.side, "RIGHT", 4, 0)

  picker.listTop = CreateFrame("Frame", nil, picker)
  picker.listTop:SetSize(1, 1)
  picker.listTop:SetPoint("TOPLEFT", picker.scope, "BOTTOMLEFT", 0, -8)
  scrollList = UI.ScrollList(picker, "MGAWaypointsScroll", ROW_WIDTH, ROW_HEIGHT, VISIBLE_ROWS, function(offset)
    state.offset = offset
    refresh()
  end)
  scrollList.scroll:SetPoint("TOPLEFT", picker.listTop, "BOTTOMLEFT", 0, 0)
  for i = 1, VISIBLE_ROWS do buildRow(i) end

  picker.empty = picker:CreateFontString(nil, "ARTWORK", "GameFontDisable")
  picker.empty:SetPoint("TOPLEFT", picker.listTop, "BOTTOMLEFT", 8, -8)

  picker.note = picker:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  picker.note:SetPoint("BOTTOMLEFT", picker, "BOTTOMLEFT", 16, 40)
  picker.note:SetWidth(WIDTH - 32)
  picker.note:SetJustifyH("LEFT")
  picker.note:SetText(NOTE)

  picker.clear = UI.Button(picker, "MGAWaypointsClear", "Clear waypoint", 120, function() M.Clear() end)
  picker.clear:SetPoint("BOTTOMLEFT", picker, "BOTTOMLEFT", 16, 12)
  picker.close = UI.Button(picker, "MGAWaypointsClose", "Close", 80, function() picker:Hide() end)
  picker.close:SetPoint("BOTTOMRIGHT", picker, "BOTTOMRIGHT", -16, 12)
end

function M.OpenPicker()
  if not picker then build() end
  state.offset = 0
  picker:Show()
  refresh()
end
