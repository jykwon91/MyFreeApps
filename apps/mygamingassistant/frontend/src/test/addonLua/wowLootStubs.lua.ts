/**
 * Just enough of the WoW client API for the MGA Loot addon to run under
 * fengari. Tests fill `items[id]` (info + `stats` + tooltip `lines`),
 * `equipped[slot] = id`, `me` (class, level), `talents[tab] = points` and
 * `rolls[rollID] = id`, then `fire(event, ...)` and `tick()` (runs what
 * `C_Timer.After` queued, like the next frame). The roll window and chat
 * record what they're given into `out` as "frame: ..." and "chat: ...".
 * `link(id)` builds an item link; `rollWindow(rollID)` a newer-UI roll frame;
 * `talentShape = "retail"` makes GetTalentTabInfo return points 5th.
 */
export const WOW_LOOT_STUBS = `
floor = math.floor
out = {}
items = {}
equipped = {}
rolls = {}
talents = { 0, 0, 0 }
me = { class = "WARRIOR", level = 60 }
ITEM_MOD_HIT_RATING_SHORT = "Hit Rating"

function link(id) return "|cff1eff00|Hitem:" .. id .. "::::::::60:::::|h[Item " .. id .. "]|h|r" end
local function idOf(l) return tonumber(tostring(l):match("item:(%d+)")) end

-- Like the Forever client: only C_Item.GetItemInfo, no global GetItemInfo.
C_Item = {
  GetItemInfo = function(l)
    local i = items[idOf(l)]
    if not i or i.loading then return nil end
    return "Item", l, 2, 60, i.minLevel or 1, "Armor", "x", 1, i.loc, 0, 0, i.classID, i.subclassID, i.bind
  end,
}
function GetItemStats(l)
  local i = items[idOf(l)]
  return i and i.stats or nil
end
C_TooltipInfo = {
  GetHyperlink = function(l)
    local i = items[idOf(l)]
    local lines = {}
    for _, text in ipairs(i and i.lines or {}) do table.insert(lines, { leftText = text }) end
    return { lines = lines }
  end,
}
function GetInventoryItemLink(_, slot) return equipped[slot] and link(equipped[slot]) or nil end
function UnitClass() return me.class, me.class end
function UnitLevel() return me.level end
talentShape = "classic"
function GetTalentTabInfo(tab)
  if talentShape == "retail" then return tab, "Tab " .. tab, "", "icon", talents[tab] end
  return "Tab " .. tab, "icon", talents[tab]
end
function GetLootRollItemLink(rollID) return rolls[rollID] and link(rolls[rollID]) or nil end
local queued = {}
C_Timer = { After = function(_, fn) table.insert(queued, fn) end }
function tick()
  local now = queued
  queued = {}
  for _, fn in ipairs(now) do fn() end
end
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(out, "chat: " .. m) end }
SlashCmdList = {}

function fontString()
  local f = {}
  function f:SetPoint() end
  function f:SetJustifyH() end
  function f:SetWidth() end
  function f:Show() end
  -- Joins the verdict's two lines with " // " so each verdict is one line of out.
  function f:SetText(t) if t ~= "" then table.insert(out, "frame: " .. t:gsub(string.char(10), " // ")) end end
  return f
end
NUM_GROUP_LOOT_FRAMES = 4
GroupLootFrame1 = { shown = false }
function GroupLootFrame1:IsShown() return self.shown end
function GroupLootFrame1:CreateFontString() return fontString() end
function rollWindow(rollID)
  return { rollID = rollID, IsShown = function() return true end, CreateFontString = function() return fontString() end }
end

local handler
CreateFrame = function()
  return { RegisterEvent = function() end, SetScript = function(_, _, fn) handler = fn end }
end
function fire(event, ...) handler(nil, event, ...) end
`;
