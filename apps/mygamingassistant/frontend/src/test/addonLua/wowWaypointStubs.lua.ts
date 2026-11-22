import { WOW_HUB_FRAME_STUBS, WOW_HUB_HELPERS } from "@/test/addonLua/wowHubStubs.lua";

/**
 * Just enough of the WoW client API for the MGA Waypoints addon to run under fengari. Tests set
 * `player` (faction "Alliance"/"Horde", class token, level), `at` = { x, y, c } (where you stand in world
 * yards, c = continent; `at = nil` = the client won't say), `facing` (radians counter-clockwise from north),
 * `bestMap` (the zone map id you're in), `rotate` (the minimap turns with you) and `indoors`, then call
 * `slash(msg)` or `fire(event)`. Chat lines go into `out` as "chat: ...".
 *
 * `openMap(id)` shows the World Map on a map; `shownMapPins()` prints "pin: <label> <left> <top>" (0-1 of the map)
 * for the pins it carries. `spin()` runs the arrow's texture rotation recorder: `arrowTurn()` is the last
 * `SetRotation` value, `arrowText()` its lines, `minimapPinAt()` the minimap pin's offset.
 */
export const WOW_WAYPOINT_STUBS = `
out = {}
${WOW_HUB_FRAME_STUBS}
${WOW_HUB_HELPERS}
local baseCreate = CreateFrame
local function withLevels(f)
  f.GetFrameLevel = function() return 1 end
  f.GetFrameStrata = function() return "MEDIUM" end
  return f
end
function CreateFrame(...) return withLevels(baseCreate(...)) end
withLevels(UIParent); withLevels(Minimap)
Minimap.width = 140
function clear() for k in pairs(out) do out[k] = nil end end
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(out, "chat: " .. (tostring(m):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))) end }
SlashCmdList = {}
function slash(msg) SlashCmdList.MGAWAYPOINTS(msg) end

player = { faction = "Alliance", class = "WARLOCK", level = 20 }
at = { x = 0, y = 0, c = 0 }
facing = 0
bestMap = nil
rotate = false
indoors = false
function UnitFactionGroup() return player.faction end
function UnitClass() return player.class:sub(1, 1) .. player.class:sub(2):lower(), player.class end
function UnitLevel() return player.level end
function UnitPosition() if at then return at.x, at.y, 0, at.c end end
function GetPlayerFacing() return facing end
function GetCVar(name) if name == "rotateMinimap" then return rotate and "1" or "0" end end
function IsIndoors() return indoors end
C_Map = { GetBestMapForUnit = function() return bestMap end }
function hooksecurefunc() end

local canvas = withLevels(CreateFrame("Frame", "WorldMapCanvas", UIParent))
canvas.width, canvas.height = 1000, 500
WorldMapFrame = CreateFrame("Frame", "WorldMapFrame", UIParent)
WorldMapFrame.shownFlag = false
mapId = nil
function WorldMapFrame:GetCanvas() return canvas end
function WorldMapFrame:GetMapID() return mapId end
function WorldMapFrame:HookScript() end
function openMap(id)
  mapId = id
  WorldMapFrame.shownFlag = true
  MGAWaypoints.DrawMapPins()
end
function shownMapPins()
  for i = 1, 10 do
    local pin = _G["MGAWaypointsMapPin" .. i]
    if pin and pin.shownFlag then
      local p = pin.point
      table.insert(out, string.format("pin: %s %.3f %.3f", pin.label, p[4] / canvas.width, -p[5] / canvas.height))
    end
  end
end

-- Records what the arrow's texture is turned to; call after the arrow exists, then update.
function spin()
  MGAWaypointsArrow.texture.SetRotation = function(self, r) self.rotation = r end
  MGAWaypoints.Update()
end
function arrowTurn() return MGAWaypointsArrow.texture.rotation end
function arrowText() return MGAWaypointsArrow.name.text, MGAWaypointsArrow.distance.text, MGAWaypointsArrow.hint.text end
function minimapPinAt() local p = MGAWaypointsMinimapPin.point; return p[4], p[5] end
`;
