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
out = {}
IsShiftKeyDown = function() return shift end
UnitFactionGroup = function() return faction end
-- Like the Forever client: only C_Item.GetItemInfo, no global GetItemInfo.
C_Item = { GetItemInfo = function(id) return "x",nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil, bind[id] end }
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
`;
