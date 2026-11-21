/**
 * Just enough of the WoW client API for the MGA Prices addon to run under
 * fengari: tooltips record each line they're given into `out`, `hover(tip, id)`
 * runs the tooltip post-calls the way the client does for an item.
 * `chat(event, message)` returns the line a chat window would show after the
 * message filters; `enterLink(frame, link)` / `leaveLink(frame)` hover a link.
 */
export const WOW_TOOLTIP_STUBS = `
floor = math.floor
NOW = 0
time = function() return NOW end
shift = false
faction = "Alliance"
bind = {}
sell = {}
out = {}
-- enchSkill: nil = no Enchanting; a number = Enchanting skill rank.
enchSkill = nil
IsShiftKeyDown = function() return shift end
UnitFactionGroup = function() return faction end
-- The skills window: a Professions header (collapsed when professionsCollapsed) over Enchanting.
professionsCollapsed = false
local function skillLines()
  local lines = { { "Professions", true } }
  if enchSkill ~= nil and not professionsCollapsed then table.insert(lines, { "Enchanting", false, enchSkill }) end
  return lines
end
GetNumSkillLines = function() return #skillLines() end
GetSkillLineInfo = function(i)
  local l = skillLines()[i]
  if not l then return nil end
  if l[2] then return l[1], true, not professionsCollapsed, 0 end
  return l[1], false, false, l[3]
end
ExpandSkillHeader = function() professionsCollapsed = false end
CollapseSkillHeader = function() professionsCollapsed = true end
-- Like the Forever client: only C_Item.GetItemInfo, no global GetItemInfo.
C_Item = { GetItemInfo = function(id) return "x",nil,nil,nil,nil,nil,nil,nil,nil,nil,sell[id],nil,nil, bind[id] end }
GetCoinTextureString = function(c) return c .. "c" end
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(out, "chat: " .. m) end }
SlashCmdList = {}
local function tip(name)
  local t = { name = name, scripts = {} }
  function t:GetName() return self.name end
  function t:AddDoubleLine(l, r) table.insert(out, l .. " | " .. r) end
  function t:AddLine(l) table.insert(out, l) end
  function t:HookScript(ev, fn) self.scripts[ev] = fn end
  function t:HasScript(ev) return ev ~= "OnTooltipSetItem" end
  function t:GetOwner() return self.owner end
  function t:IsShown() return true end
  function t:RefreshData() end
  function t:SetOwner(owner) self.owner = owner end
  -- Like a client whose SetHyperlink fires no tooltip post-call: only clears the tooltip.
  function t:SetHyperlink(link) if self.scripts.OnTooltipCleared then self.scripts.OnTooltipCleared(self) end end
  function t:Show() self.shown = true end
  function t:Hide() self.shown = false end
  return t
end
GameTooltip = tip("GameTooltip"); ItemRefTooltip = tip("ItemRefTooltip"); ShoppingTooltip1 = tip("ShoppingTooltip1")
Enum = { TooltipDataType = { Item = 0 } }
local postcalls = {}
TooltipDataProcessor = { AddTooltipPostCall = function(_, fn) table.insert(postcalls, fn) end }
function hooksecurefunc(target, name, fn)
  if type(target) == "string" then target, name, fn = _G, target, name end
  local original = target[name]
  target[name] = function(...) local r = original and original(...); fn(...); return r end
end
local filters = {}
ChatFrame_AddMessageEventFilter = function(event, fn)
  filters[event] = filters[event] or {}
  table.insert(filters[event], fn)
end
function chat(event, message)
  for _, f in ipairs(filters[event] or {}) do
    local stop, changed = f(ChatFrame1, event, message, "Sender")
    if stop then return nil end
    if changed then message = changed end
  end
  return message
end
NUM_CHAT_WINDOWS = 1
CHAT_FRAMES = { "ChatFrame1" }
ChatFrame1 = tip("ChatFrame1")
function enterLink(frame, link) frame.scripts.OnHyperlinkEnter(frame, link) end
function leaveLink(frame) frame.scripts.OnHyperlinkLeave(frame) end
CreateFrame = function() return { RegisterEvent = function() end, SetScript = function() end } end
function hover(t, id)
  if t.scripts.OnTooltipCleared then t.scripts.OnTooltipCleared(t) end
  for _, f in ipairs(postcalls) do f(t, { id = id }) end
end
-- Quest frame stubs: allow the addon's quest-log and quest-giver AH blocks to run.
-- FontStrings created on the quest scroll frames insert their text into \`out\` on Show().
local function questFontString(prefix)
  local fs = { _text = "" }
  function fs:SetText(t) self._text = t end
  function fs:SetPoint() end
  function fs:SetWidth() end
  function fs:SetTextColor() end
  function fs:SetJustifyH() end
  function fs:Show()
    if self._text ~= "" then
      for line in (self._text .. "\\n"):gmatch("(.-)[\\n]") do
        if line ~= "" then table.insert(out, prefix .. ": " .. line) end
      end
    end
  end
  function fs:Hide() self._text = "" end
  return fs
end
local function makeQuestScrollFrame(prefix)
  local f = {}
  function f:GetWidth() return 320 end
  function f:CreateFontString() return questFontString(prefix) end
  return f
end
QuestLogDetailScrollChildFrame = makeQuestScrollFrame("qlog")
QuestObjectivesText = { SetPoint = function() end }
QuestFrameDetailPanel = makeQuestScrollFrame("qdetail")
QuestDetailObjectivesText = { SetPoint = function() end }
-- Override CreateFrame to track event handlers so fire() can dispatch to them.
-- The existing MODIFIER_STATE_CHANGED frame was already created above with the old no-op
-- CreateFrame; this override only affects future CreateFrame calls (from the addon).
local _eventFrames = {}
CreateFrame = function()
  local f = { _events = {}, _script = nil }
  function f:RegisterEvent(e) self._events[e] = true end
  function f:SetScript(k, fn) if k == "OnEvent" then self._script = fn end end
  table.insert(_eventFrames, f)
  return f
end
function fire(event, ...)
  for _, f in ipairs(_eventFrames) do
    if f._events[event] and f._script then f._script(f, event, ...) end
  end
end
-- Quest log state: the addon reads GetQuestLogSelection() + C_QuestLog.GetQuestIDForLogIndex().
local _logQuestId = 0
GetQuestLogSelection = function() return _logQuestId > 0 and 1 or 0 end
C_QuestLog = { GetQuestIDForLogIndex = function(_idx) return _logQuestId end }
-- Quest giver state: the addon calls GetQuestID() inside the QUEST_DETAIL handler.
local _detailQuestId = 0
GetQuestID = function() return _detailQuestId end
-- Hookable no-ops for the quest log panel update functions.
QuestLog_UpdateQuestDetails = function() end
SelectQuestLogEntry = function() end
-- Test helpers.
function triggerQuestLog(questId)
  _logQuestId = questId
  QuestLog_UpdateQuestDetails()
end
function triggerQuestDetail(questId)
  _detailQuestId = questId
  fire("QUEST_DETAIL")
end
`;
