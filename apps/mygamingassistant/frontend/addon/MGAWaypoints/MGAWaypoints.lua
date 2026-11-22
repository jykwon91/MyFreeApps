-- MGA Waypoints: pick a place from the MGA menu and an arrow, a minimap pin and a World Map pin lead you
-- there. Trainers, flight masters, repair vendors, innkeepers, banks, dungeon doors and named places all
-- come from the site's World Map data (Data.lua).
--
-- Everything is in the MGA menu (the minimap button's left-click) and the MGA settings window (right-click).
-- The slash command is a shortcut:
--
--   /mgawp                 open the "Go to..." window
--   /mgawp <name>          guide to the nearest place matching that name
--   /mgawp clear           stop guiding

local M = MGAWaypoints
local UI = MGAHub.UI

local function setting(key)
  return function(on)
    M.Settings()[key] = on
    M.Update()
    M.DrawMapPins()
  end
end

local function clearMenuText()
  local target = M.Target()
  return target and ("Clear waypoint (" .. target.name .. ")") or "Clear waypoint"
end

local function clearTarget()
  if not M.Target() then return M.Say("Nothing to clear.") end
  M.Clear()
  M.Say("Waypoint cleared.")
end

local function goNearest(categoryId, noun)
  return function()
    if not M.GoNearest(categoryId) then M.Say("No " .. noun .. " found for your faction.") end
  end
end

local function goByName(query)
  local found = M.Search({ category = "place", query = query, scope = "all", otherSide = false })
  local place = found[1]
  if not place then return M.Say("Nothing called \"" .. query .. "\" found. Open /mgawp to browse.") end
  M.SetTarget(place)
  M.Say("Guiding you to " .. place.name .. " in " .. place.zone .. ".")
end

local function buildOptions(section, top)
  local arrow = UI.Check(section, "MGAWaypointsOptions_arrow", "Show the arrow", "Drag it where you like; right-click it to clear.", top, -10, setting("arrow"))
  local mapPin = UI.Check(section, "MGAWaypointsOptions_mapPin", "Pin on the World Map", nil, arrow, -14, setting("mapPin"))
  local minimapPin = UI.Check(section, "MGAWaypointsOptions_minimapPin", "Pin on the minimap", nil, mapPin, -4, setting("minimapPin"))
  local arrivalLabel = UI.Label(section, "Arrived when within", "GameFontHighlight", minimapPin, -14)
  local arrival = UI.Dropdown(section, "MGAWaypointsOptions_arrival", 100, function()
    local choices = {}
    for _, yards in ipairs(M.ARRIVALS) do table.insert(choices, { value = yards, text = yards .. " yd" }) end
    return choices
  end, function() return M.Settings().arrival end, function(value) M.Settings().arrival = value end)
  arrival:SetPoint("LEFT", arrivalLabel, "RIGHT", 12, 0)
  local clear = UI.Button(section, "MGAWaypointsOptions_clear", "Clear waypoint", 130, clearTarget)
  clear:SetPoint("TOPLEFT", arrivalLabel, "BOTTOMLEFT", 0, -14)
  local reset = UI.Button(section, "MGAWaypointsOptions_reset", "Reset arrow position", 150, M.ResetArrowPlace)
  reset:SetPoint("LEFT", clear, "RIGHT", 8, 0)
  function section.refresh()
    local settings = M.Settings()
    arrow:SetChecked(settings.arrow)
    mapPin:SetChecked(settings.mapPin)
    minimapPin:SetChecked(settings.minimapPin)
    arrival.refresh()
  end
  section.refresh()
  return 190
end

MGAHub.Register({
  name = "Waypoints",
  order = 15,
  menu = {
    { text = "Go to...", func = M.OpenPicker },
    { text = "Nearest class trainer", func = goNearest("class", "class trainer") },
    { text = "Nearest flight master", func = goNearest("flight", "flight master") },
    { text = "Nearest repair vendor", func = goNearest("repair", "repair vendor") },
    { text = clearMenuText, func = clearTarget },
  },
  settings = buildOptions,
})

SLASH_MGAWAYPOINTS1 = "/mgawp"
SlashCmdList["MGAWAYPOINTS"] = function(message)
  local text = (message or ""):match("^%s*(.-)%s*$")
  if text == "" then return M.OpenPicker() end
  if text:lower() == "clear" then return clearTarget() end
  goByName(text)
end

local events = CreateFrame("Frame", "MGAWaypointsEvents")
events:RegisterEvent("PLAYER_LOGIN")
events:RegisterEvent("PLAYER_ENTERING_WORLD")
events:RegisterEvent("ZONE_CHANGED_NEW_AREA")
events:SetScript("OnEvent", function() M.Resume() end)
