import { WOW_HUB_FRAME_STUBS, WOW_HUB_HELPERS } from "@/test/addonLua/wowHubStubs.lua";

/**
 * Just enough of the WoW client for MGA Drops under fengari, on the hub's frame engine.
 *
 * GameTooltip records each line it gets into `out` ("left | right" for a double line). `units[token]` =
 * `{ guid, attackable, player, creatureType }` describes a unit; `hoverUnit(token)` shows its tooltip the
 * way the client does (clear, then the TooltipDataProcessor post-calls, then OnTooltipSetUnit). Set
 * `postCallGuid = false` to leave `data.guid` out, `TooltipDataProcessor = nil` before loading for a client
 * without it. `secret[value] = true` makes `issecretvalue` say the value is hidden. `shift` = Shift held,
 * `faction` = your faction. `touched` lists the Blizzard frames anything called a method on (it must stay empty).
 */
export const WOW_DROPS_STUBS = `
${WOW_HUB_FRAME_STUBS}
${WOW_HUB_HELPERS}
out = {}
shift = false
faction = "Alliance"
units = {}
secret = {}
postCallGuid = true
touched = {}
function issecretvalue(v) return secret[v] == true end
function IsShiftKeyDown() return shift end
function UnitFactionGroup(unit) return faction end
function UnitGUID(unit) return units[unit] and units[unit].guid end
function UnitExists(unit) return units[unit] ~= nil end
function UnitCanAttack(_, unit) return units[unit] ~= nil and units[unit].attackable == true end
function UnitIsPlayer(unit) return units[unit] ~= nil and units[unit].player == true end
function UnitCreatureType(unit) return units[unit] and units[unit].creatureType end
C_Item = { GetItemIconByID = function(id) return 1000 + id end }
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(out, "chat: " .. m) end }
SlashCmdList = {}

-- Blizzard frames MGA Drops must never move or change.
for _, name in ipairs({ "MainMenuBar", "MultiBarBottomLeft", "MultiBarRight", "EditModeManagerFrame", "PlayerFrame", "TargetFrame", "Minimap" }) do
  local real = _G[name]
  _G[name] = setmetatable({}, { __index = function(_, key)
    table.insert(touched, name .. ":" .. key)
    return real and real[key] or function() end
  end })
end

GameTooltip = { name = "GameTooltip", scripts = {}, shownFlag = false }
function GameTooltip:GetName() return self.name end
function GameTooltip:AddLine(l) table.insert(out, l) end
function GameTooltip:AddDoubleLine(l, r) table.insert(out, l .. " | " .. r) end
function GameTooltip:HookScript(event, fn)
  local before = self.scripts[event]
  self.scripts[event] = function(...) if before then before(...) end fn(...) end
end
function GameTooltip:HasScript(event) return event == "OnTooltipSetUnit" or event == "OnTooltipCleared" end
function GameTooltip:GetUnit() local u = self.unit; return u and "name", u end
function GameTooltip:IsShown() return self.shownFlag end
function GameTooltip:Show() self.shownFlag = true end
function GameTooltip:Hide() self.shownFlag = false end
function GameTooltip:SetOwner(owner) self.owner = owner end
function GameTooltip:GetOwner() return self.owner end
function GameTooltip:SetItemByID(id) table.insert(out, "item tooltip " .. id) end
function GameTooltip:RefreshData() if self.unit then hoverUnit(self.unit) end end

Enum = { TooltipDataType = { Item = 0, Unit = 2 } }
local postcalls = {}
TooltipDataProcessor = { AddTooltipPostCall = function(kind, fn) table.insert(postcalls, { kind = kind, fn = fn }) end }

function hoverUnit(token)
  GameTooltip.unit = token
  if GameTooltip.scripts.OnTooltipCleared then GameTooltip.scripts.OnTooltipCleared(GameTooltip) end
  for _, p in ipairs(postcalls) do
    if p.kind == Enum.TooltipDataType.Unit then
      p.fn(GameTooltip, { guid = postCallGuid and UnitGUID(token) or nil })
    end
  end
  if GameTooltip.scripts.OnTooltipSetUnit then GameTooltip.scripts.OnTooltipSetUnit(GameTooltip) end
end

-- A creature GUID the way the client builds one.
function creature(npc) return "Creature-0-5250-0-12-" .. npc .. "-0000ABCDEF" end
function plain(text) return (text:gsub("|T[^|]*|t ", ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end
function clear() out = {} end
`;
