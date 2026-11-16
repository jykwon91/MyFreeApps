/**
 * Just enough of the WoW client API for the MGA Dungeon Quests addon to run under fengari. Tests set
 * `player` (faction, class, level, skills = { {name, rank} }), `completed[questId] = true` (turned in), `questLog = { {id, complete} }`,
 * `instance = { type, id }` (nil = out in the world), then call `slash(msg)` or `fire(event)`.
 * Lines go into `out`: "chat: ..." for chat, "window: ..." for each line of text the window shows
 * (colour codes and icons stripped, icons as [done] / [log] / [todo]), "row: ..." for each dungeon
 * in the list, and "hidden" / "shown" for the window. `clear()` empties `out`; `clickRow(n)` and
 * `clickBack()` click the list and the back button. `C_QuestLog = nil` leaves the older globals.
 * Map pins: `C_Map.SetUserWaypoint` prints "waypoint: <map> <x> <y>" (0-1), map 9999 can't take one,
 * `C_Map = nil` is a client without them; `shownPins()` prints "pins: 1,3" (the lines with a Pin
 * button), `clickPin(n)` clicks line n's.
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
    return q and { questID = q.id, isHeader = false } or nil
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
  return "Quest", 1, nil, false, false, q.complete and 1 or nil, 0, q.id
end
function IsQuestFlaggedCompleted(id) return completed[id] == true end
UiMapPoint = { CreateFromCoordinates = function(map, x, y) return { map = map, x = x, y = y } end }
C_Map = {
  SetUserWaypoint = function(p) out[#out + 1] = string.format("waypoint: %d %.3f %.3f", p.map, p.x, p.y) end,
  CanSetUserWaypointOnMap = function(map) return map ~= 9999 end,
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
local rows = {}
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
    elseif self.isRowLabel then
      out[#out + 1] = "row: " .. plain(t)
    end
  end
  function methods:GetStringHeight() return 100 end
  function methods:CreateFontString()
    local fs = newObject("FontString", nil, self)
    if self.parent and self.parent.kind == "ScrollFrame" then fs.isWindowText = true else fs.isRowLabel = true end
    return fs
  end
  o.name = name
  o.isWindowText, o.isRowLabel = false, false
  -- Unknown methods are no-ops; fields a template would add (TitleText) are absent.
  setmetatable(o, { __index = function(_, k) if k == "TitleText" then return nil end return methods[k] or function() end end })
  frames[#frames + 1] = o
  if name then named[name] = o end
  if kind == "Button" and not name and parent and parent.parent and parent.parent.kind == "ScrollFrame" then rows[#rows + 1] = o end
  return o
end
function CreateFrame(kind, name, parent) return newObject(kind, name, parent) end
-- The scroll child's parent is the ScrollFrame; its rows are Buttons parented to the child.

function fire(event, ...)
  for _, f in ipairs(frames) do
    if f.events[event] and f.scripts.OnEvent then f.scripts.OnEvent(f, event, ...) end
  end
end
function slash(msg) SlashCmdList.MGADUNGEONQUESTS(msg) end
function clickRow(n)
  local shownRows = {}
  for _, r in ipairs(rows) do if r.shownFlag then shownRows[#shownRows + 1] = r end end
  shownRows[n].scripts.OnClick(shownRows[n])
end
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
function clickBack()
  for _, f in ipairs(frames) do
    if f.kind == "Button" and f.parent == named.MGADungeonQuestsFrame then f.scripts.OnClick(f) end
  end
end
`;
