/**
 * Just enough of the WoW client API for the MGA Prices addon to run under
 * fengari: tooltips record each line they're given into `out`, `hover(tip, id)`
 * runs the tooltip post-calls the way the client does for an item.
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
GetItemInfo = function(id) return "x",nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil,nil, bind[id] end
GetCoinTextureString = function(c) return c .. "c" end
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(out, "chat: " .. m) end }
SlashCmdList = {}
local function tip(name)
  local t = { name = name, scripts = {} }
  function t:GetName() return self.name end
  function t:AddDoubleLine(l, r) table.insert(out, l .. " | " .. r) end
  function t:AddLine(l) table.insert(out, l) end
  function t:HookScript(ev, fn) self.scripts[ev] = fn end
  function t:GetOwner() return self.owner end
  function t:IsShown() return true end
  function t:RefreshData() end
  return t
end
GameTooltip = tip("GameTooltip"); ItemRefTooltip = tip("ItemRefTooltip"); ShoppingTooltip1 = tip("ShoppingTooltip1")
Enum = { TooltipDataType = { Item = 0 } }
local postcalls = {}
TooltipDataProcessor = { AddTooltipPostCall = function(_, fn) table.insert(postcalls, fn) end }
CreateFrame = function() return { RegisterEvent = function() end, SetScript = function() end } end
function hover(t, id)
  if t.scripts.OnTooltipCleared then t.scripts.OnTooltipCleared(t) end
  for _, f in ipairs(postcalls) do f(t, { id = id }) end
end
`;
