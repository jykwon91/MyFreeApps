import { WOW_HUB_HELPERS } from "@/test/addonLua/wowHubStubs.lua";

/**
 * Just enough of the WoW client API for the MGA Buffs addon to run under
 * fengari. Tests fill `units.<unit>` (class, level, name, buffs, dead,
 * connected), set `group` ("solo", "party" or "raid", whose raidN entries
 * point at the same unit tables), `bags[bag] = { itemIds }`,
 * (bag 4 starts with a Healthstone, so that check stays quiet until a test sets
 * `bags[4] = nil`), `cooldowns[itemId] = { start, duration }`, `inRange[unit] = false`
 * for a groupmate too far away (UnitInRange), `now` (GetTime) and `combat`,
 * then `fire(event, ...)` and `tick()` (the addon's ticker). A buff is
 * `{ name, icon, expires, source, spellId }`. `weaponEnchant = { has, ms }` is GetWeaponEnchantInfo
 * (a lasting enchant by default, so other checks stay quiet); `itemNames[id]` names a bag item for its link. `knownSpells[id] = false`
 * unlearns a spell. `units.<unit>.secret = true` makes the client refuse that unit's aura
 * read the way Forever does when it hides auras; a buff whose name is `SECRET` comes back as a
 * secret value (issecretvalue). `C_UnitAuras = nil` leaves only
 * the older UnitBuff. Lines go into `out`: "row: ..." for each list row it
 * draws, "hidden" when the list hides, "flash: ..." for a mid-screen message,
 * "sound", "chat: ...", and "options: ..." for the settings window. `clear()`
 * empties `out`; `click(frame)` clicks a settings checkbox or button.
 */
export const WOW_BUFF_STUBS = `
out = {}
function clear() for k in pairs(out) do out[k] = nil end end
now = 1000
combat = false
group = "solo"
bags = { [4] = { 5509 } }
inRange = {}
function UnitInRange(u) return inRange[u] ~= false, true end
cooldowns = {}
weaponEnchant = { has = true, ms = 3600000 }
function GetWeaponEnchantInfo() return weaponEnchant.has, weaponEnchant.ms, 0, 1 end
itemNames = {}
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

SECRET = {}
function issecretvalue(v) return v == SECRET end

C_UnitAuras = {
  GetAuraDataByIndex = function(u, i)
    if units[u] and units[u].secret then error("Auras cannot be accessed when secret while tainted by 'MGABuffs'") end
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
  GetContainerItemLink = function(bag, slot)
    local id = bags[bag] and bags[bag][slot]
    return id and ("|cffffffff|Hitem:" .. id .. "|h[" .. (itemNames[id] or "Item") .. "]|h|r")
  end,
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

-- Only the reminder list's text is recorded ("row: ..."); other text keeps its value in .text.
-- Methods nobody listed are no-ops, like the MGA hub's frames need.
local noop = function() end
local function withNoops(o, methods)
  return setmetatable(o, { __index = function(_, k) return methods[k] or (k:match("^%u") and noop or nil) end })
end
local function region(owner)
  local r = { shownFlag = true, text = "" }
  local methods = {}
  function methods:Show() self.shownFlag = true end
  function methods:Hide() self.shownFlag = false end
  function methods:IsShown() return self.shownFlag end
  function methods:SetText(t)
    self.text = t
    if owner.name == "MGABuffsFrame" and t ~= "" then table.insert(out, "row: " .. t) end
  end
  function methods:GetText() return self.text end
  function methods:GetEffectiveScale() return 1 end
  return withNoops(r, methods)
end
UISpecialFrames = {}
function GetCursorPosition() return 0, 0 end
local frames = {}
function CreateFrame(kind, name, _, template)
  local f = { kind = kind, name = name, template = template, shownFlag = true, scripts = {}, events = {}, text = "", checked = false }
  local methods = {}
  function methods:SetSize(w, h) self.width, self.height = w, h end
  function methods:GetWidth() return self.width or 140 end
  function methods:GetHeight() return self.height or 100 end
  function methods:EnableMouse(on) self.mouse = on end
  function methods:RegisterEvent(e) self.events[e] = true end
  function methods:SetPoint(p, _, rp, x, y) self.point = { p, rp, x, y } end
  function methods:GetPoint() return self.point[1], UIParent, self.point[2], self.point[3], self.point[4] end
  function methods:GetCenter() return 500, 400 end
  function methods:CreateTexture() return region(self) end
  function methods:CreateFontString(fsName)
    local r = region(self)
    if fsName then _G[fsName] = r end
    return r
  end
  function methods:SetScript(event, fn) self.scripts[event] = fn end
  function methods:SetText(t) self.text = t end
  function methods:SetChecked(on) self.checked = on and true or false end
  function methods:GetChecked() return self.checked end
  function methods:Show() self.shownFlag = true end
  function methods:IsShown() return self.shownFlag end
  function methods:Hide()
    if self.shownFlag and self.name == "MGABuffsFrame" then table.insert(out, "hidden") end
    self.shownFlag = false
  end
  withNoops(f, methods)
  if name then _G[name] = f end
  table.insert(frames, f)
  return f
end
UIParent = CreateFrame("Frame", "UIParent")
UIParent.width, UIParent.height = 1920, 1080
Minimap = CreateFrame("Frame", "Minimap")
function fire(event, ...)
  for _, f in ipairs(frames) do
    if f.events[event] and f.scripts.OnEvent then f.scripts.OnEvent(f, event, ...) end
  end
end
${WOW_HUB_HELPERS}
`;
