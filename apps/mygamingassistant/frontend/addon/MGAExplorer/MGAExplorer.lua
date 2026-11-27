-- MGA Explorer: the Legacy "Explorer" challenge (Explore Azeroth = Explore Eastern Kingdoms + Explore Kalimdor)
-- in game. A window lists every zone it counts with what's explored, and "Next unexplored" points MGA Waypoints'
-- arrow at the nearest area still to find; when you discover it, the arrow moves on to the next one.
--
-- Open it from the MGA menu (the minimap button's left-click). The settings are in the MGA settings window.
-- The slash command is a shortcut:
--
--   /mgaexplore           open the window
--   /mgaexplore next      guide to the nearest unexplored area
--   /mgaexplore stop      stop guiding

local M = MGAExplorer
local UI = MGAHub.UI

-- Progress is re-read at most this often: achievement criteria events fire for every criteria in the game.
local REFRESH_SECONDS = 0.5
-- Events that may mean an area was discovered or you moved to another zone. One the client doesn't know is skipped.
local EVENTS = {
  "PLAYER_LOGIN", "PLAYER_ENTERING_WORLD", "ZONE_CHANGED", "ZONE_CHANGED_INDOORS", "ZONE_CHANGED_NEW_AREA",
  "CRITERIA_UPDATE", "ACHIEVEMENT_EARNED", "MAP_EXPLORATION_UPDATED",
}

function M.SetMapPins(on)
  M.Settings().mapPins = on
  M.DrawMapPins()
  M.RefreshWindow()
end

local function setting(key)
  return function(on)
    M.Settings()[key] = on
    M.DrawMapPins()
  end
end

local function stopMenuText()
  local area = M.guiding
  return area and ("Stop exploring (" .. area.name .. ")") or "Stop exploring"
end

local function buildOptions(section, top)
  local pins = UI.Check(section, "MGAExplorerOptions_mapPins", "Pins on the World Map", "On a zone, every area it still needs; on a continent, how many each zone has left. Click to be guided.", top, -10, setting("mapPins"))
  local outlines = UI.Check(section, "MGAExplorerOptions_outlines", "Box each area on the map", "A faint box over the patch of map each area covers.", pins, -14, setting("outlines"))
  local auto = UI.Check(section, "MGAExplorerOptions_autoNext", "Move on by itself", "When you discover the area you are guided to, guide to the next one.", outlines, -14, setting("autoNext"))
  function section.refresh()
    local settings = M.Settings()
    pins:SetChecked(settings.mapPins)
    outlines:SetChecked(settings.outlines)
    auto:SetChecked(settings.autoNext)
  end
  section.refresh()
  return 130
end

MGAHub.Register({
  name = "Explorer",
  order = 16,
  menu = {
    { text = "Explorer", func = function() M.Toggle() end },
    { text = "Next unexplored area", func = function() M.GuideNext() end },
    { text = stopMenuText, func = function() M.Stop() end },
  },
  settings = buildOptions,
})

SLASH_MGAEXPLORER1 = "/mgaexplore"
SlashCmdList["MGAEXPLORER"] = function(message)
  local text = (message or ""):match("^%s*(.-)%s*$"):lower()
  if text == "next" then return M.GuideNext() end
  if text == "stop" then return M.Stop() end
  M.Open()
end

-- Re-reads progress, announces discoveries, moves the arrow on, and redraws.
function M.Update()
  M.AfterRefresh(M.Refresh())
  M.RefreshWindow()
  M.DrawMapPins()
end

MGAWaypoints.OnChange(function()
  M.OnWaypointsChange()
  M.RefreshWindow()
end)

local events = CreateFrame("Frame", "MGAExplorerEvents")
for _, event in ipairs(EVENTS) do pcall(events.RegisterEvent, events, event) end

local dirty, waited = false, 0
events:SetScript("OnUpdate", function(_, elapsed)
  if not dirty then return end
  waited = waited + elapsed
  if waited < REFRESH_SECONDS then return end
  dirty, waited = false, 0
  M.Update()
end)

events:SetScript("OnEvent", function(_, event)
  if event == "PLAYER_LOGIN" then
    M.HookWorldMap()
    M.Refresh()
    M.Restore()
    return M.DrawMapPins()
  end
  dirty = true
end)
