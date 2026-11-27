-- MGA Explorer on the World Map (setting mapPins, on by default): the map shows where to go to discover.
--   * A zone map: a gold dot on every area the zone still needs (setting areaBoxes, off by default, adds a
--     faint box over the patch of map the area covers). Hover names it; a click guides you there.
--   * A continent map: a round badge on every zone with areas left, showing how many, at the middle of those areas.
--     Hover names the zone; a click guides you to its nearest area.
-- Guiding is MGA Waypoints' arrow, so its own target pin sits on top of these.

local M = MGAExplorer
local W = MGAWaypoints

-- A gold dot, big enough to spot among quest marks. It grows on hover. In the Forever client this texture draws
-- (it was visible, only too small, at 12); the raid "circle" icon UI-RaidTargetingIcon_2 drew nothing on the map.
local PIN_TEXTURE = "Interface\\COMMON\\Indicator-Yellow"
local PIN_SIZE, PIN_HOVER_SIZE = 20, 26
local BADGE_TEXTURE = "Interface\\Minimap\\UI-Minimap-Background"
local BADGE_SIZE = 22
-- Gold, the World Map's own colour for names; the box is faint so the map reads through it.
local BOX_R, BOX_G, BOX_B, BOX_FILL_ALPHA, BOX_EDGE_ALPHA = 1, 0.82, 0, 0.10, 0.55
local BADGE_ALPHA = 0.8
local EDGE = 1.5
local LEVEL_BOX, LEVEL_PIN = 80, 90

local pins, boxes, badges = {}, {}, {}

local function tooltip(owner, title, hint)
  if not GameTooltip then return end
  GameTooltip:SetOwner(owner, "ANCHOR_RIGHT")
  GameTooltip:AddLine(title)
  GameTooltip:AddLine(hint, 0.4, 0.73, 1)
  GameTooltip:Show()
end

local function hideTooltip() if GameTooltip then GameTooltip:Hide() end end

local function onCanvas(kind, name, canvas, level)
  local f = CreateFrame(kind, name, canvas)
  if WorldMapFrame.GetFrameStrata then f:SetFrameStrata(WorldMapFrame:GetFrameStrata()) end
  f:SetFrameLevel(canvas:GetFrameLevel() + level)
  return f
end

local function newPin(i, canvas)
  local pin = onCanvas("Button", "MGAExplorerMapPin" .. i, canvas, LEVEL_PIN)
  pin:SetSize(PIN_SIZE, PIN_SIZE)
  pin.texture = pin:CreateTexture(nil, "OVERLAY")
  pin.texture:SetAllPoints()
  pin.texture:SetTexture(PIN_TEXTURE)
  pin:RegisterForClicks("LeftButtonUp")
  pin:SetScript("OnEnter", function(self)
    self:SetSize(PIN_HOVER_SIZE, PIN_HOVER_SIZE)
    tooltip(self, self.area.name, "Not explored yet. Click to be guided here.")
  end)
  pin:SetScript("OnLeave", function(self)
    self:SetSize(PIN_SIZE, PIN_SIZE)
    hideTooltip()
  end)
  pin:SetScript("OnClick", function(self) M.Guide(self.area) end)
  return pin
end

local function edge(box, a, b)
  local t = box:CreateTexture(nil, "BORDER")
  t:SetColorTexture(BOX_R, BOX_G, BOX_B, BOX_EDGE_ALPHA)
  t:SetPoint(a, box, a)
  t:SetPoint(b, box, b)
  return t
end

-- The box over an area: a faint fill and a thin edge. It takes no clicks, so the map still pans under it.
local function newBox(i, canvas)
  local box = onCanvas("Frame", "MGAExplorerMapArea" .. i, canvas, LEVEL_BOX)
  box.fill = box:CreateTexture(nil, "BACKGROUND")
  box.fill:SetAllPoints(box)
  box.fill:SetColorTexture(BOX_R, BOX_G, BOX_B, BOX_FILL_ALPHA)
  box.edges = { edge(box, "TOPLEFT", "TOPRIGHT"), edge(box, "BOTTOMLEFT", "BOTTOMRIGHT"), edge(box, "TOPLEFT", "BOTTOMLEFT"), edge(box, "TOPRIGHT", "BOTTOMRIGHT") }
  box.edges[1]:SetHeight(EDGE); box.edges[2]:SetHeight(EDGE)
  box.edges[3]:SetWidth(EDGE); box.edges[4]:SetWidth(EDGE)
  box:EnableMouse(false)
  return box
end

local function newBadge(i, canvas)
  local badge = onCanvas("Button", "MGAExplorerZoneBadge" .. i, canvas, LEVEL_PIN)
  badge:SetSize(BADGE_SIZE, BADGE_SIZE)
  badge.back = badge:CreateTexture(nil, "BACKGROUND")
  badge.back:SetAllPoints()
  badge.back:SetTexture(BADGE_TEXTURE)
  badge.back:SetAlpha(BADGE_ALPHA)
  badge.count = badge:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  badge.count:SetPoint("CENTER", badge, "CENTER", 0, 0)
  badge:RegisterForClicks("LeftButtonUp")
  badge:SetScript("OnEnter", function(self)
    local done, total = M.Count(self.zone)
    tooltip(self, self.zone.name, string.format("%d of %d explored, %d left. Click to be guided to the nearest.", done, total, total - done))
  end)
  badge:SetScript("OnLeave", hideTooltip)
  badge:SetScript("OnClick", function(self) M.GuideInZone(self.zone) end)
  return badge
end

local function place(frame, canvas, x, y)
  frame:ClearAllPoints()
  frame:SetPoint("CENTER", canvas, "TOPLEFT", x * canvas:GetWidth(), -y * canvas:GetHeight())
  frame:Show()
end

local function drawZone(canvas, map)
  local width, height = canvas:GetWidth(), canvas:GetHeight()
  local boxed = M.Settings().areaBoxes
  for i, area in ipairs(M.PinsFor(map)) do
    pins[i] = pins[i] or newPin(i, canvas)
    pins[i].area = area
    place(pins[i], canvas, area.x / 100, area.y / 100)
    if boxed then
      boxes[i] = boxes[i] or newBox(i, canvas)
      local box, r = boxes[i], area.rect
      box:ClearAllPoints()
      box:SetPoint("TOPLEFT", canvas, "TOPLEFT", r[1] / 100 * width, -r[2] / 100 * height)
      box:SetSize((r[3] - r[1]) / 100 * width, (r[4] - r[2]) / 100 * height)
      box:Show()
    end
  end
end

local function drawContinent(canvas, map)
  for i, entry in ipairs(M.ZoneBadges(map)) do
    badges[i] = badges[i] or newBadge(i, canvas)
    badges[i].zone = entry.zone
    badges[i].count:SetText(tostring(entry.left))
    place(badges[i], canvas, entry.x, entry.y)
  end
end

function M.DrawMapPins()
  for _, list in ipairs({ pins, boxes, badges }) do
    for _, frame in ipairs(list) do frame:Hide() end
  end
  local canvas = W.MapCanvas()
  if not (canvas and M.Settings().mapPins and WorldMapFrame:IsShown()) then return end
  local map = WorldMapFrame.GetMapID and WorldMapFrame:GetMapID()
  if M.ZoneForMap(map) then return drawZone(canvas, map) end
  drawContinent(canvas, map)
end

local hooked = false

function M.HookWorldMap()
  if hooked or not WorldMapFrame then return end
  hooked = true
  if WorldMapFrame.HookScript then WorldMapFrame:HookScript("OnShow", M.DrawMapPins) end
  if not hooksecurefunc then return end
  if WorldMapFrame.OnMapChanged then hooksecurefunc(WorldMapFrame, "OnMapChanged", M.DrawMapPins)
  elseif WorldMapFrame.SetMapID then hooksecurefunc(WorldMapFrame, "SetMapID", M.DrawMapPins) end
end
