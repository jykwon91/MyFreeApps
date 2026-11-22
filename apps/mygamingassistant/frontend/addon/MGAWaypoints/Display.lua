-- MGA Waypoints, what you see: the arrow on screen, the pin on the minimap and the pins on the World Map.
-- Everything redraws from M.Update(), run about 20 times a second while there is a target.

local M = MGAWaypoints

local UPDATE_SECONDS = 0.05
local ARROW_TEXTURE = "Interface\\Minimap\\ROTATING-MINIMAPARROW"
local PIN_TEXTURE = "Interface\\TargetingFrame\\UI-RaidTargetingIcon_1"
local STEP_TEXTURE = "Interface\\TargetingFrame\\UI-RaidTargetingIcon_6"
local ARROW_SIZE = 56
local PIN_SIZE = 18
local DEFAULT_ARROW_POINT = { "CENTER", "CENTER", 0, 160 }
local EDGE_ALPHA = 0.55

local arrow, minimapPin, mapPins = nil, nil, {}

-- The arrow ----------------------------------------------------------------------------

local function saveArrowPlace(frame)
  if not frame.GetPoint then return end
  local point, _, relative, x, y = frame:GetPoint()
  if point then M.Settings().arrowAt = { point, relative, x, y } end
end

local function placeArrow()
  local at = M.Settings().arrowAt or DEFAULT_ARROW_POINT
  arrow:ClearAllPoints()
  arrow:SetPoint(at[1], UIParent, at[2], at[3], at[4])
end

function M.ResetArrowPlace()
  M.Settings().arrowAt = nil
  if arrow then placeArrow() end
end

local function buildArrow()
  arrow = CreateFrame("Frame", "MGAWaypointsArrow", UIParent)
  arrow:SetSize(ARROW_SIZE + 80, ARROW_SIZE + 44)
  arrow:SetFrameStrata("MEDIUM")
  arrow:SetMovable(true)
  arrow:EnableMouse(true)
  arrow:SetClampedToScreen(true)
  arrow:RegisterForDrag("LeftButton")
  arrow:SetScript("OnDragStart", function(self) self:StartMoving() end)
  arrow:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    saveArrowPlace(self)
  end)
  arrow:SetScript("OnMouseUp", function(_, button)
    if button == "RightButton" then M.Clear() end
  end)
  arrow.texture = arrow:CreateTexture(nil, "ARTWORK")
  arrow.texture:SetSize(ARROW_SIZE, ARROW_SIZE)
  arrow.texture:SetPoint("TOP", arrow, "TOP", 0, 0)
  arrow.texture:SetTexture(ARROW_TEXTURE)
  arrow.name = arrow:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  arrow.name:SetPoint("TOP", arrow.texture, "BOTTOM", 0, -2)
  arrow.distance = arrow:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  arrow.distance:SetPoint("TOP", arrow.name, "BOTTOM", 0, -1)
  arrow.hint = arrow:CreateFontString(nil, "OVERLAY", "GameFontDisableSmall")
  arrow.hint:SetPoint("TOP", arrow.distance, "BOTTOM", 0, -1)
  placeArrow()
  arrow:Hide()
end

-- Turns the arrow to `turn` radians (counter-clockwise); a client that can't rotate a texture still gets the compass letter.
local function turnArrow(turn)
  if arrow.texture.SetRotation then arrow.texture:SetRotation(turn) end
end

local function showArrow(target, step, me)
  if not arrow then buildArrow() end
  arrow.name:SetText(target.name)
  if step.spot and me then
    local bearing = M.Bearing(me, step.spot)
    turnArrow(M.Relative(bearing, M.Facing()))
    arrow.texture:Show()
    arrow.distance:SetText(M.YardsText(M.Yards(me, step.spot)) .. " " .. M.Compass(bearing))
    arrow.hint:SetText(step.hint or "")
  else
    arrow.texture:Hide()
    arrow.distance:SetText(step.text or "")
    arrow.hint:SetText("")
  end
  arrow:Show()
end

-- The minimap pin ------------------------------------------------------------------------

local function minimapIndoors()
  return IsIndoors and IsIndoors() and true or false
end

local function buildMinimapPin()
  minimapPin = CreateFrame("Frame", "MGAWaypointsMinimapPin", Minimap)
  minimapPin:SetSize(PIN_SIZE, PIN_SIZE)
  minimapPin:SetFrameStrata("MEDIUM")
  minimapPin:SetFrameLevel(Minimap:GetFrameLevel() + 5)
  minimapPin.texture = minimapPin:CreateTexture(nil, "OVERLAY")
  minimapPin.texture:SetAllPoints()
  minimapPin.texture:SetTexture(PIN_TEXTURE)
  minimapPin:Hide()
end

local function showMinimapPin(step, me)
  if not minimapPin then buildMinimapPin() end
  local zoom = Minimap.GetZoom and Minimap:GetZoom() or 0
  local rotate = GetCVar and GetCVar("rotateMinimap") == "1"
  local square = GetMinimapShape and GetMinimapShape() == "SQUARE"
  local yards = M.MinimapYards(zoom, minimapIndoors())
  local x, y, edge = M.MinimapOffset(me, step.spot, M.Facing(), rotate, yards, Minimap:GetWidth() / 2, square)
  minimapPin:ClearAllPoints()
  minimapPin:SetPoint("CENTER", Minimap, "CENTER", x, y)
  minimapPin:SetAlpha(edge and EDGE_ALPHA or 1)
  minimapPin:Show()
end

-- World Map pins ------------------------------------------------------------------------

local function mapCanvas()
  if not WorldMapFrame then return nil end
  if WorldMapFrame.GetCanvas then return WorldMapFrame:GetCanvas() end
  return WorldMapFrame.ScrollContainer and WorldMapFrame.ScrollContainer.Child
end

local function newMapPin(i, canvas)
  local pin = CreateFrame("Button", "MGAWaypointsMapPin" .. i, canvas)
  pin:SetSize(PIN_SIZE + 4, PIN_SIZE + 4)
  if WorldMapFrame.GetFrameStrata then pin:SetFrameStrata(WorldMapFrame:GetFrameStrata()) end
  pin:SetFrameLevel(canvas:GetFrameLevel() + 100)
  pin.texture = pin:CreateTexture(nil, "OVERLAY")
  pin.texture:SetAllPoints()
  pin:RegisterForClicks("RightButtonUp")
  pin:SetScript("OnEnter", function(self)
    if not GameTooltip then return end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:AddLine(self.label)
    GameTooltip:AddLine("Right-click to clear.", 0.4, 0.73, 1)
    GameTooltip:Show()
  end)
  pin:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  pin:SetScript("OnClick", function() M.Clear() end)
  return pin
end

-- Puts the destination (and the boat or zeppelin stop on the way) on the map being shown.
function M.DrawMapPins()
  for _, pin in ipairs(mapPins) do pin:Hide() end
  local canvas = mapCanvas()
  local target = M.Target()
  if not (canvas and target and M.Settings().mapPin and WorldMapFrame:IsShown()) then return end
  local mapId = WorldMapFrame.GetMapID and WorldMapFrame:GetMapID()
  if not mapId then return end
  local step = M.Step(M.PlayerSpot(), target)
  local wanted = { { spot = target.spot, texture = PIN_TEXTURE, label = target.name } }
  if step.spot and not step.final then
    table.insert(wanted, { spot = step.spot, texture = STEP_TEXTURE, label = step.hint })
  end
  local used = 0
  for _, want in ipairs(wanted) do
    local x, y = M.MapPoint(want.spot, mapId)
    if x and x >= 0 and x <= 1 and y >= 0 and y <= 1 then
      used = used + 1
      mapPins[used] = mapPins[used] or newMapPin(used, canvas)
      local pin = mapPins[used]
      pin.label = want.label
      pin.texture:SetTexture(want.texture)
      pin:ClearAllPoints()
      pin:SetPoint("CENTER", canvas, "TOPLEFT", x * canvas:GetWidth(), -y * canvas:GetHeight())
      pin:Show()
    end
  end
end

local mapHooked = false

local function hookWorldMap()
  if mapHooked or not WorldMapFrame then return end
  mapHooked = true
  if WorldMapFrame.HookScript then WorldMapFrame:HookScript("OnShow", M.DrawMapPins) end
  if not hooksecurefunc then return end
  if WorldMapFrame.OnMapChanged then hooksecurefunc(WorldMapFrame, "OnMapChanged", M.DrawMapPins)
  elseif WorldMapFrame.SetMapID then hooksecurefunc(WorldMapFrame, "SetMapID", M.DrawMapPins) end
end
M.HookWorldMap = hookWorldMap

-- Updating -----------------------------------------------------------------------------

local function hideAll()
  if arrow then arrow:Hide() end
  if minimapPin then minimapPin:Hide() end
end

-- Draws the arrow and minimap pin for where you are now; arrival clears the target.
function M.Update()
  local target = M.Target()
  local settings = M.Settings()
  if not target then return hideAll() end
  local me = M.PlayerSpot()
  local step = M.Step(me, target)
  if step.final and M.Yards(me, step.spot) <= settings.arrival then
    M.Say("You have arrived at " .. target.name .. ".")
    return M.Clear()
  end
  if settings.arrow then showArrow(target, step, me) elseif arrow then arrow:Hide() end
  if settings.minimapPin and step.spot and me then showMinimapPin(step, me) elseif minimapPin then minimapPin:Hide() end
end

-- Runs M.Update() on a timer; the frame's OnUpdate only ticks while there is a target.
local driver = CreateFrame("Frame", "MGAWaypointsDriver", UIParent)
local waited = 0
local function tick(_, elapsed)
  waited = waited + elapsed
  if waited < UPDATE_SECONDS then return end
  waited = 0
  M.Update()
end

M.OnChange(function()
  driver:SetScript("OnUpdate", M.Target() and tick or nil)
  M.Update()
  M.DrawMapPins()
end)

function M.Resume()
  hookWorldMap()
  driver:SetScript("OnUpdate", M.Target() and tick or nil)
  M.Update()
end
