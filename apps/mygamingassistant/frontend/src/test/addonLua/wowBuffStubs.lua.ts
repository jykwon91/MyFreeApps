/**
 * Just enough of the WoW client API for the MGA Buffs addon to run under
 * fengari. Tests fill `units.<unit>` (class, level, name, buffs, dead,
 * connected), set `group` ("solo", "party" or "raid", whose raidN entries
 * point at the same unit tables), `bags[bag] = { itemIds }`,
 * `cooldowns[itemId] = { start, duration }`, `now` (GetTime) and `combat`,
 * then `fire(event, ...)` and `tick()` (the addon's ticker). A buff is
 * `{ name, icon, expires, source, spellId }`. `knownSpells[id] = false`
 * unlearns a spell. `C_UnitAuras = nil` leaves only
 * the older UnitBuff. Lines go into `out`: "row: ..." for each list row it
 * draws, "hidden" when the list hides, "flash: ..." for a mid-screen message,
 * "sound", and "chat: ...". `clear()` empties `out`.
 */
export const WOW_BUFF_STUBS = `
out = {}
function clear() for k in pairs(out) do out[k] = nil end end
now = 1000
combat = false
group = "solo"
bags = {}
cooldowns = {}
NUM_BAG_SLOTS = 4

function unit(class, level, name, extra)
  local u = { class = class, level = level or 60, name = name, buffs = {}, dead = false, connected = true }
  for k, v in pairs(extra or {}) do u[k] = v end
  return u
end
units = { player = unit("WARLOCK", 60, "Me") }
function buff(name, expires, extra)
  local b = { name = name, icon = 1, expires = expires or 0, source = "player" }
  for k, v in pairs(extra or {}) do b[k] = v end
  return b
end

function GetTime() return now end
-- knownSpells[id] = false makes a spell unlearned; everything else is known.
knownSpells = {}
function IsPlayerSpell(id) return knownSpells[id] ~= false end
function UnitExists(u) return units[u] ~= nil end
function UnitClass(u) local c = units[u] and units[u].class; return c and (c:sub(1, 1) .. c:sub(2):lower()), c end
function UnitLevel(u) return units[u].level end
function UnitName(u) return units[u] and units[u].name end
function UnitIsConnected(u) return units[u].connected end
function UnitIsDeadOrGhost(u) return units[u].dead end
function UnitIsUnit(a, b) return units[a] ~= nil and units[a] == units[b] end
function UnitAffectingCombat() return combat end
function IsInRaid() return group == "raid" end
function IsInGroup() return group ~= "solo" end
local function members(prefix)
  local n = 0
  while units[prefix .. (n + 1)] do n = n + 1 end
  return n
end
function GetNumGroupMembers() return group == "raid" and members("raid") or members("party") + 1 end
function GetNumSubgroupMembers() return members("party") end

C_UnitAuras = {
  GetAuraDataByIndex = function(u, i)
    local b = units[u] and units[u].buffs[i]
    if not b then return nil end
    return { name = b.name, icon = b.icon, expirationTime = b.expires, sourceUnit = b.source, spellId = b.spellId }
  end,
}
function UnitBuff(u, i)
  local b = units[u] and units[u].buffs[i]
  if not b then return nil end
  return b.name, b.icon, 1, nil, 0, b.expires, b.source, false, nil, b.spellId
end

C_Container = {
  GetContainerNumSlots = function(bag) return bags[bag] and #bags[bag] or 0 end,
  GetContainerItemID = function(bag, slot) return bags[bag] and bags[bag][slot] end,
  GetItemCooldown = function(id)
    local c = cooldowns[id]
    if not c then return 0, 0, 1 end
    return c.start, c.duration, 1
  end,
}

local ticker
C_Timer = { NewTicker = function(_, fn) ticker = fn end }
function tick() ticker() end

DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(out, "chat: " .. m) end }
SlashCmdList = {}
RaidWarningFrame = {}
ChatTypeInfo = { RAID_WARNING = { r = 1, g = 0.5, b = 0 } }
function RaidNotice_AddMessage(_, text) table.insert(out, "flash: " .. text) end
SOUNDKIT = { RAID_WARNING = 8959 }
function PlaySound() table.insert(out, "sound") end

local function region()
  local r = { shown = true }
  function r:SetSize() end
  function r:SetPoint() end
  function r:SetJustifyH() end
  function r:SetTexture() end
  function r:SetTextColor() end
  function r:Show() self.shown = true end
  function r:Hide() self.shown = false end
  function r:SetText(t) if t ~= "" then table.insert(out, "row: " .. t) end end
  return r
end
UIParent = {}
local handler
function CreateFrame(_, name)
  local f = { name = name, shown = true, scripts = {} }
  function f:SetSize() end
  function f:SetHeight() end
  function f:SetClampedToScreen() end
  function f:SetMovable() end
  function f:EnableMouse(on) self.mouse = on end
  function f:RegisterForDrag() end
  function f:RegisterEvent() end
  function f:ClearAllPoints() end
  function f:SetPoint(p, _, rp, x, y) self.point = { p, rp, x, y } end
  function f:GetPoint() return self.point[1], UIParent, self.point[2], self.point[3], self.point[4] end
  function f:StartMoving() end
  function f:StopMovingOrSizing() end
  function f:CreateTexture() return region() end
  function f:CreateFontString() return region() end
  function f:SetScript(event, fn) self.scripts[event] = fn; if event == "OnEvent" then handler = fn end end
  function f:Show() self.shown = true end
  function f:Hide()
    if self.shown and self.name then table.insert(out, "hidden") end
    self.shown = false
  end
  _G[name or "anonymous"] = f
  return f
end
function fire(event, ...) handler(nil, event, ...) end
`;
