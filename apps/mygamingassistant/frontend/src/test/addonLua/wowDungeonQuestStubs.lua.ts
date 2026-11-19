/**
 * Just enough of the WoW client API for the MGA Dungeon Quests addon to run under fengari. Tests set
 * `player` (faction, class, level, skills = { {name, rank} }), `completed[questId] = true` (turned in), `questLog = { {id, complete} }`,
 * `instance = { type, id }` (nil = out in the world), then call `slash(msg)` or `fire(event)`.
 * Lines go into `out`: "chat: ..." for chat, "window: ..." for each line of text the window shows
 * (colour codes and icons stripped, icons as [done] / [log] / [todo]), and "hidden" / "shown" for the
 * window. `shownRows()`, `shownBosses()` and `shownLoot()` print "row: ...", "boss: ..." and "loot: ..."
 * for what's on screen, `shownCrumbs()` the path at the top. `clear()` empties `out`; `clickRow(n)`,
 * `clickBoss(n)`, `clickTab(n)`, `clickBack()` and `clickCrumb()` click them. `C_QuestLog = nil` leaves the older globals.
 * Map pins: `C_Map.SetUserWaypoint` prints "waypoint: <map> <x> <y>" (0-1), map 9999 can't take one,
 * `C_Map = nil` is a client without them; `shownPins()` prints "pins: 1,3" (the lines with a Pin
 * button), `clickPin(n)` clicks line n's. Routes: `position = { x, y, c }` is where you stand (nil = inside an
 * instance), `shownRoute()` prints "route: <heading> | <leg>" or "route: none", `tickRoute()` runs the tracker,
 * `clickRouteStop()` and `clickDoorRoute()` click its Stop and the Overview tab's button.
 * Turn-ins: `questLog` entries take a `title`; `openMap(id)` shows the World Map, `shownTurnInPins()` prints its pins and
 * button, `hoverTurnInPin(n)` prints "tooltip: ..." lines, `clickTurnInPin(n)` and `clickTurnInButton()` click them.
 */
export const WOW_DUNGEON_QUEST_STUBS = `
out = {}
function clear() for k in pairs(out) do out[k] = nil end end
player = { faction = "Alliance", class = "WARLOCK", level = 20, skills = {} }
completed = {}
questLog = {}
instance = nil

function UnitFactionGroup() return player.faction end
function UnitClass() return player.class:sub(1, 1) .. player.class:sub(2):lower(), player.class end
function UnitLevel() return player.level end
-- The Skills tab: a Languages row, a Professions header (player.skillsCollapsed folds it), then
-- player.skills ({ {name, rank} }).
function GetLocale() return player.locale or "enUS" end
function GetNumSkillLines() return #player.skills + 2 end
function GetSkillLineInfo(i)
  if i == 1 then return "Language: Common", nil, nil, 300 end
  i = i - 1
  if i == 1 then return "Professions", 1, not player.skillsCollapsed and 1 or nil, 0 end
  local s = player.skills[i - 1]
  if not s then return nil end
  return s.name, nil, nil, s.rank
end
function GetInstanceInfo()
  if not instance then return "Elwynn Forest", "none", 0, "", 5, 0, false, 0 end
  return "Dungeon", instance.type, 1, "Normal", 5, 0, false, instance.id
end
C_QuestLog = {
  IsQuestFlaggedCompleted = function(id) return completed[id] == true end,
  GetInfo = function(i)
    local q = questLog[i]
    return q and { questID = q.id, title = q.title, isHeader = false } or nil
  end,
  IsComplete = function(id)
    for _, q in ipairs(questLog) do if q.id == id then return q.complete == true end end
    return false
  end,
}
function GetNumQuestLogEntries() return #questLog, #questLog end
function GetQuestLogTitle(i)
  local q = questLog[i]
  if not q then return nil end
  return q.title or "Quest", 1, nil, false, false, q.complete and 1 or nil, 0, q.id
end
function IsQuestFlaggedCompleted(id) return completed[id] == true end
position = nil
function GetTaxiMapID() return 1415 end
function UnitPosition()
  if position then return position.x, position.y, 0, position.c end
end
UiMapPoint = { CreateFromCoordinates = function(map, x, y) return { map = map, x = x, y = y } end }
C_Map = {
  SetUserWaypoint = function(p) out[#out + 1] = string.format("waypoint: %d %.3f %.3f", p.map, p.x, p.y) end,
  CanSetUserWaypointOnMap = function(map) return map ~= 9999 end,
  ClearUserWaypoint = function() out[#out + 1] = "waypoint cleared" end,
}
C_SuperTrack = { SetSuperTrackedUserWaypoint = function(on) out[#out + 1] = "supertrack: " .. tostring(on) end }

local function plain(s)
  s = s:gsub("|TInterface\\\\RaidFrame\\\\ReadyCheck%-Ready:14|t", "[done]")
  s = s:gsub("|TInterface\\\\RaidFrame\\\\ReadyCheck%-Waiting:14|t", "[log]")
  s = s:gsub("|TInterface\\\\Buttons\\\\UI%-CheckBox%-Up:14|t", "[todo]")
  return (s:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))
end

DEFAULT_CHAT_FRAME = { AddMessage = function(_, msg) out[#out + 1] = "chat: " .. plain(msg) end }
UIParent = {}
UISpecialFrames = {}
SlashCmdList = {}

local frames = {}
local named = {}
local function newObject(kind, name, parent)
  local o = { kind = kind, scripts = {}, events = {}, shownFlag = kind ~= "Frame" or name ~= "MGADungeonQuestsFrame", parent = parent }
  local methods = {}
  function methods:SetScript(k, fn) self.scripts[k] = fn end
  function methods:RegisterEvent(e) self.events[e] = true end
  function methods:Show()
    self.shownFlag = true
    if self.name == "MGADungeonQuestsFrame" then out[#out + 1] = "shown" end
  end
  function methods:Hide()
    self.shownFlag = false
    if self.name == "MGADungeonQuestsFrame" then out[#out + 1] = "hidden" end
  end
  function methods:IsShown() return self.shownFlag end
  function methods:SetText(t)
    self.text = t
    if self.isWindowText then
      for line in (t .. "\\n"):gmatch("(.-)\\n") do out[#out + 1] = "window: " .. plain(line) end
    end
  end
  function methods:GetStringHeight() return 100 end
  function methods:CreateFontString()
    local fs = newObject("FontString", nil, self)
    fs.isWindowText = self.parent ~= nil and self.parent.kind == "ScrollFrame"
    return fs
  end
  function methods:CreateTexture() return newObject("Texture", nil, self) end
  function methods:SetTexture(file) self.file = file end
  function methods:GetFrameLevel() return 1 end
  function methods:GetWidth() return 1000 end
  function methods:GetHeight() return 500 end
  function methods:SetPoint(...) self.point = { ... } end
  function methods:HookScript(k, fn) self.hooks = rawget(self, "hooks") or {}; self.hooks[k] = fn end
  o.name = name
  o.isWindowText = false
  -- Unknown methods are no-ops; fields a template would add (TitleText) are absent.
  setmetatable(o, { __index = function(_, k) if k == "TitleText" then return nil end return methods[k] or function() end end })
  frames[#frames + 1] = o
  if name then named[name] = o end
  return o
end
function CreateFrame(kind, name, parent) return newObject(kind, name, parent) end
function hooksecurefunc(t, name, fn)
  local old = t[name]
  t[name] = function(...) local r = old(...); fn(...); return r end
end
-- The World Map: openMap(uiMapId) shows it on a map; mapTypes[id] = 2 makes a map a continent, whose
-- pins C_Map places by mapOnContinent[uiMapId] = {x, y} (0-1).
mapTypes, mapOnContinent = {}, {}
WorldMapFrame = newObject("Frame", "WorldMapFrame", UIParent)
WorldMapFrame.shownFlag = false
WorldMapFrame.ScrollContainer = newObject("Frame", nil, WorldMapFrame)
WorldMapFrame.ScrollContainer.Child = newObject("Frame", nil, WorldMapFrame.ScrollContainer)
WorldMapFrame.mapId = nil
function WorldMapFrame.GetMapID(self) return self.mapId end
function WorldMapFrame.GetCanvas(self) return self.ScrollContainer.Child end
function WorldMapFrame.OnMapChanged() end
function openMap(id)
  WorldMapFrame.mapId = id
  local wasShown = WorldMapFrame.shownFlag
  WorldMapFrame.shownFlag = true
  local hooks = rawget(WorldMapFrame, "hooks")
  if not wasShown and hooks and hooks.OnShow then hooks.OnShow(WorldMapFrame) end
  WorldMapFrame:OnMapChanged()
end
C_Map.GetMapInfo = function(id) return { mapType = mapTypes[id] or 3 } end
CreateVector2D = function(x, y) return { x = x, y = y, GetXY = function(v) return v.x, v.y end } end
C_Map.GetWorldPosFromMapPos = function(map, pos) return 0, { map = map } end
C_Map.GetMapPosFromWorldPos = function(_, world)
  local spot = mapOnContinent[world.map]
  if spot then return 1415, CreateVector2D(spot[1], spot[2]) end
end
GameTooltip = newObject("Frame", "GameTooltip", UIParent)
function GameTooltip.AddLine(_, text) out[#out + 1] = "tooltip: " .. text end
-- The turn-in pins on the map: "turnin pin: <giver> at <x> <y>" (canvas offsets), and the map's button.
function shownTurnInPins()
  for i = 1, 30 do
    local p = named["MGADungeonQuestsTurnInPin" .. i]
    if p and p.shownFlag then out[#out + 1] = string.format("turnin pin: %s at %.0f %.0f", p.stop.giver, p.point[4], p.point[5]) end
  end
  local b = named.MGADungeonQuestsTurnInButton
  out[#out + 1] = (b and b.shownFlag) and ("map button: " .. b.text) or "map button: none"
end
function hoverTurnInPin(n) local p = named["MGADungeonQuestsTurnInPin" .. n]; p.scripts.OnEnter(p) end
function clickTurnInPin(n) local p = named["MGADungeonQuestsTurnInPin" .. n]; p.scripts.OnClick(p) end
function clickTurnInButton() named.MGADungeonQuestsTurnInButton.scripts.OnClick() end
-- The scroll child's parent is the ScrollFrame; the window text is the font strings made on it.

function fire(event, ...)
  for _, f in ipairs(frames) do
    if f.events[event] and f.scripts.OnEvent then f.scripts.OnEvent(f, event, ...) end
  end
end
function slash(msg) SlashCmdList.MGADUNGEONQUESTS(msg) end
-- Prints one line per pooled button on screen.
local function printShown(prefix, describe)
  for i = 1, 60 do
    local b = named[prefix .. i]
    if b and b.shownFlag then out[#out + 1] = describe(b) end
  end
end
function shownRows()
  printShown("MGADungeonQuestsDungeon", function(b)
    return "row: " .. b.title.text .. " | " .. b.range.text .. " | " .. b.status.text .. " | art " .. tostring(b.art.file)
  end)
end
function shownBosses()
  printShown("MGADungeonQuestsBoss", function(b) return "boss: " .. b.label.text .. " | portrait " .. tostring(b.portrait.file) end)
end
function shownLoot()
  printShown("MGADungeonQuestsLoot", function(b) return "loot: " .. plain(b.label.text) .. " | " .. b.sub.text .. " | " .. b.chance.text end)
end
-- The loot names as drawn, colour codes kept.
function shownLootColours()
  printShown("MGADungeonQuestsLoot", function(b) return "colour: " .. b.label.text end)
end
function shownCrumbs()
  local path = {}
  for _, name in ipairs({ "Home", "CrumbDungeon", "CrumbBoss" }) do
    local b = named["MGADungeonQuests" .. name]
    if b.shownFlag then path[#path + 1] = b.text end
  end
  out[#out + 1] = "crumbs: " .. table.concat(path, " > ")
end
function clickRow(n) named["MGADungeonQuestsDungeon" .. n].scripts.OnClick() end
function clickBoss(n) named["MGADungeonQuestsBoss" .. n].scripts.OnClick() end
function clickTab(n) named["MGADungeonQuestsTab" .. n].scripts.OnClick() end
function clickCrumb() named.MGADungeonQuestsCrumbDungeon.scripts.OnClick() end
function shownRoute()
  local f = named.MGADungeonQuestsRouteFrame
  out[#out + 1] = (f and f.shownFlag) and ("route: " .. f.heading.text .. " | " .. f.leg.text) or "route: none"
end
function tickRoute() named.MGADungeonQuestsRouteFrame.scripts.OnUpdate(named.MGADungeonQuestsRouteFrame, 1.1) end
function clickRouteStop() named.MGADungeonQuestsRouteStop.scripts.OnClick() end
function clickDoorRoute() named.MGADungeonQuestsDoorRoute.scripts.OnClick() end
-- The Pin buttons on screen, top to bottom, as "line n" numbers; clickPin(n) clicks line n's.
function shownPins()
  local list = {}
  for i = 1, 50 do
    local b = named["MGADungeonQuestsPin" .. i]
    if b and b.shownFlag then list[#list + 1] = i end
  end
  out[#out + 1] = "pins: " .. table.concat(list, ",")
end
function clickPin(n) named["MGADungeonQuestsPin" .. n].scripts.OnClick() end
function clickBack() named.MGADungeonQuestsHome.scripts.OnClick() end
`;
