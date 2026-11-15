-- MGA Buffs — a reminder, out of combat, when a buff you want is missing or about to run out.
--
--   Armor:     Demon Skin / Demon Armor (Warlock), Frost / Ice / Mage Armor (Mage), Inner Fire (Priest).
--   Soulstone: Warlocks from level 18 — your Soulstone on someone in the group running out, none
--              on anyone while a stone in your bags is ready, or no stone in your bags at all.
--   Food:      Well Fed (and the few foods whose buff has another name). Quiet while you eat.
--   Group:     Fortitude, Arcane Intellect (mana users only) and Mark of the Wild — only when a
--              Priest, Mage or Druid is in your group (or you are one), naming who to ask.
--
-- Warnings show in a small movable list with icons. A new one also flashes mid-screen with a
-- sound. In combat, dead or a ghost, the list hides: buffs wait until you can do something.
--
--   /mgabuffs                 what's on, and what's missing right now
--   /mgabuffs armor           turn a check off or on (also: soulstone, food, group)
--   /mgabuffs minutes 5       warn this many minutes before a buff runs out (1-30, default 3)
--   /mgabuffs sound           turn the sound and mid-screen flash off or on
--   /mgabuffs unlock | lock   drag the list somewhere else, then lock it
--   /mgabuffs reset           put the list back where it started

local ADDON = "MGA Buffs"
local PREFIX = "|cff33aaff" .. ADDON .. ":|r "
local TICK_SECONDS = 1
local MAX_ROWS = 6
local ROW_HEIGHT = 26
local ICON_SIZE = 22
local SOULSTONE_LEVEL = 18
local SOULSTONE_SECONDS = 30 * 60
local FOOD_ICON = "Interface\\Icons\\Spell_Misc_Food"
local CHECKS = { "armor", "soulstone", "food", "group" }
local DEFAULTS = { armor = true, soulstone = true, food = true, group = true, minutes = 3, sound = true, locked = true }
local DEFAULT_POINT = { "TOP", "TOP", 0, -140 }

local WARN = { 1, 0.82, 0 }
local URGENT = { 1, 0.35, 0.25 }

-- Names and ids from the WoW Forever client files (build 1.60.1.70888).
local ARMOR = {
  WARLOCK = { names = { "Demon Armor", "Demon Skin" }, icon = 136185, label = function(level) return level < 20 and "Demon Skin" or "Demon Armor" end },
  MAGE = { names = { "Mage Armor", "Ice Armor", "Frost Armor" }, icon = 135843, label = function() return "Frost, Ice or Mage Armor" end },
  PRIEST = { names = { "Inner Fire" }, icon = 135926, minLevel = 12, label = function() return "Inner Fire" end },
}
local SOULSTONE_ITEMS = { 16896, 16895, 16893, 16892, 5232 } -- Major first: the best stone in your bags wins
local SOULSTONE_BUFFS = { [20707] = true, [20762] = true, [20763] = true, [20764] = true, [20765] = true }
local SOULSTONE_BUFF = "Soulstone Resurrection"
local SOULSTONE_ICON = 136210
local FOOD_BUFFS = { ["Well Fed"] = true, ["Increased Healing Power"] = true, ["Increased Spell Damage"] = true, ["Increased Stamina"] = true }
local EATING = { ["Food"] = true, ["Drink"] = true }
local GROUP_BUFFS = {
  { label = "Fortitude", class = "PRIEST", names = { "Power Word: Fortitude", "Prayer of Fortitude" }, icon = 135987 },
  { label = "Arcane Intellect", class = "MAGE", names = { "Arcane Intellect", "Arcane Brilliance" }, icon = 135932, manaOnly = true },
  { label = "Mark of the Wild", class = "DRUID", names = { "Mark of the Wild", "Gift of the Wild" }, icon = 136078 },
}
local CLASS_LABEL = { PRIEST = "Priest", MAGE = "Mage", DRUID = "Druid" }
local MANA = 0

local function say(message)
  DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. message)
end

-- The game loads saved variables after the addon file runs, so read them late.
local function settings()
  MGABuffsSettings = MGABuffsSettings or {}
  for key, value in pairs(DEFAULTS) do
    if MGABuffsSettings[key] == nil then MGABuffsSettings[key] = value end
  end
  return MGABuffsSettings
end

local function set(list)
  local s = {}
  for _, v in ipairs(list) do s[v] = true end
  return s
end

-- Each helpful aura on a unit as { name, icon, expires, mine, spellId }. Forever runs the modern
-- aura API; older clients only have UnitBuff. `expires` is 0 for a buff without a timer.
local function buffs(unit)
  local list = {}
  for i = 1, 40 do
    local name, icon, expires, source, spellId
    if C_UnitAuras and C_UnitAuras.GetAuraDataByIndex then
      local aura = C_UnitAuras.GetAuraDataByIndex(unit, i, "HELPFUL")
      if not aura then break end
      name, icon, expires, source, spellId = aura.name, aura.icon, aura.expirationTime, aura.sourceUnit, aura.spellId
    elseif UnitBuff then
      local _
      name, icon, _, _, _, expires, source, _, _, spellId = UnitBuff(unit, i)
      if not name then break end
    else
      break
    end
    local mine = source ~= nil and UnitIsUnit(source, "player")
    table.insert(list, { name = name, icon = icon, expires = expires or 0, mine = mine, spellId = spellId })
  end
  return list
end

local function find(list, names)
  for _, aura in ipairs(list) do
    if names[aura.name] then return aura end
  end
end

local function minutesLeft(aura, now)
  return math.ceil((aura.expires - now) / 60)
end

local function expiring(aura, now)
  return aura.expires > 0 and aura.expires - now <= settings().minutes * 60
end

local function leftText(aura, now)
  local m = minutesLeft(aura, now)
  return m <= 1 and "under a minute left" or (m .. " min left")
end

-- Everyone in your group, you included, as unit ids.
local function groupUnits()
  local units = {}
  if IsInRaid and IsInRaid() then
    for i = 1, GetNumGroupMembers() do table.insert(units, "raid" .. i) end
    return units
  end
  table.insert(units, "player")
  if IsInGroup and IsInGroup() then
    local count = GetNumSubgroupMembers and GetNumSubgroupMembers() or (GetNumGroupMembers() - 1)
    for i = 1, count do table.insert(units, "party" .. i) end
  end
  return units
end

local function classOf(unit)
  local _, class = UnitClass(unit)
  return class
end

local function present(unit)
  return UnitExists(unit) and (not UnitIsConnected or UnitIsConnected(unit)) and not UnitIsDeadOrGhost(unit)
end

-- Bag scanning: Forever has C_Container; older clients have the globals.
local function bagItemCount(itemId)
  local slotsIn = (C_Container and C_Container.GetContainerNumSlots) or GetContainerNumSlots
  local idAt = (C_Container and C_Container.GetContainerItemID) or GetContainerItemID
  if not slotsIn or not idAt then return 0 end
  local count = 0
  for bag = 0, NUM_BAG_SLOTS or 4 do
    for slot = 1, slotsIn(bag) or 0 do
      if idAt(bag, slot) == itemId then count = count + 1 end
    end
  end
  return count
end

local function itemCooldownLeft(itemId, now)
  local get = (C_Container and C_Container.GetItemCooldown) or (C_Item and C_Item.GetItemCooldown) or GetItemCooldown
  if not get then return 0 end
  local start, duration = get(itemId)
  if not start or start == 0 or not duration then return 0 end
  return math.max(0, start + duration - now)
end

local lastSoulstoneCast = nil

local function armorWarning(myBuffs, now)
  local armor = ARMOR[classOf("player")]
  local level = UnitLevel("player")
  if not armor or level < (armor.minLevel or 1) then return nil end
  local aura = find(myBuffs, set(armor.names))
  local label = armor.label(level)
  if not aura then return { key = "armor", icon = armor.icon, text = "No " .. label, urgent = true } end
  if expiring(aura, now) then
    return { key = "armor-expiring", icon = aura.icon or armor.icon, text = aura.name .. ": " .. leftText(aura, now) }
  end
end

local function soulstoneWarning(units, now)
  if classOf("player") ~= "WARLOCK" or UnitLevel("player") < SOULSTONE_LEVEL then return nil end
  for _, unit in ipairs(units) do
    for _, aura in ipairs(buffs(unit)) do
      if aura.mine and (SOULSTONE_BUFFS[aura.spellId] or aura.name == SOULSTONE_BUFF) then
        -- Some clients don't give other players' buff timers; fall back to when you cast it.
        if aura.expires == 0 and lastSoulstoneCast then aura.expires = lastSoulstoneCast + SOULSTONE_SECONDS end
        if expiring(aura, now) then
          return { key = "soulstone-expiring", icon = aura.icon or SOULSTONE_ICON, text = "Soulstone on " .. UnitName(unit) .. ": " .. leftText(aura, now) }
        end
        return nil
      end
    end
  end
  for _, itemId in ipairs(SOULSTONE_ITEMS) do
    if bagItemCount(itemId) > 0 then
      if itemCooldownLeft(itemId, now) > 0 then return nil end
      local onWho = #units > 1 and "someone" or "yourself"
      return { key = "soulstone-ready", icon = SOULSTONE_ICON, text = "Soulstone ready: put it on " .. onWho, urgent = true }
    end
  end
  return { key = "soulstone-none", icon = SOULSTONE_ICON, text = "No Soulstone in your bags: Create Soulstone", urgent = true }
end

local function foodWarning(myBuffs, now)
  if find(myBuffs, EATING) then return nil end
  local aura = find(myBuffs, FOOD_BUFFS)
  if not aura then return { key = "food", icon = FOOD_ICON, text = "Not Well Fed: eat buff food" } end
  if expiring(aura, now) then
    return { key = "food-expiring", icon = aura.icon or FOOD_ICON, text = aura.name .. ": " .. leftText(aura, now) }
  end
end

local function groupWarnings(units, myBuffs, now)
  local warnings = {}
  local usesMana = not UnitPowerType or UnitPowerType("player") == MANA
  for _, buff in ipairs(GROUP_BUFFS) do
    if usesMana or not buff.manaOnly then
      local caster
      for _, unit in ipairs(units) do
        if classOf(unit) == buff.class and present(unit) then
          -- You first: if you can cast it yourself, that's the answer.
          if UnitIsUnit(unit, "player") then caster = unit; break end
          caster = caster or unit
        end
      end
      if caster then
        local who = UnitIsUnit(caster, "player") and "cast it" or ("ask " .. UnitName(caster) .. " (" .. CLASS_LABEL[buff.class] .. ")")
        local aura = find(myBuffs, set(buff.names))
        if not aura then
          table.insert(warnings, { key = "group-" .. buff.class, icon = buff.icon, text = "No " .. buff.label .. ": " .. who })
        elseif expiring(aura, now) then
          table.insert(warnings, { key = "group-" .. buff.class .. "-expiring", icon = aura.icon or buff.icon, text = buff.label .. ": " .. leftText(aura, now) .. ", " .. who })
        end
      end
    end
  end
  return warnings
end

-- Everything missing right now, most important first; nil when buffs can't matter (combat, dead).
local function currentWarnings()
  if UnitAffectingCombat("player") or UnitIsDeadOrGhost("player") then return nil end
  local s = settings()
  local now = GetTime()
  local myBuffs = buffs("player")
  local units = groupUnits()
  local warnings = {}
  local function add(w) if w then table.insert(warnings, w) end end
  if s.armor then add(armorWarning(myBuffs, now)) end
  if s.soulstone then add(soulstoneWarning(units, now)) end
  if s.food then add(foodWarning(myBuffs, now)) end
  if s.group then
    for _, w in ipairs(groupWarnings(units, myBuffs, now)) do add(w) end
  end
  return warnings
end

-- The list ------------------------------------------------------------------

local frame = CreateFrame("Frame", "MGABuffsFrame", UIParent)
frame:SetSize(320, ROW_HEIGHT)
frame:SetClampedToScreen(true)
frame:SetMovable(true)
frame:RegisterForDrag("LeftButton")
frame:SetScript("OnDragStart", function(self) self:StartMoving() end)
frame:SetScript("OnDragStop", function(self)
  self:StopMovingOrSizing()
  local point, _, relativePoint, x, y = self:GetPoint()
  settings().point = { point, relativePoint, x, y }
end)
frame:Hide()

local rows = {}
for i = 1, MAX_ROWS do
  local icon = frame:CreateTexture(nil, "ARTWORK")
  icon:SetSize(ICON_SIZE, ICON_SIZE)
  icon:SetPoint("TOPLEFT", frame, "TOPLEFT", 0, -(i - 1) * ROW_HEIGHT)
  local text = frame:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  text:SetPoint("LEFT", icon, "RIGHT", 6, 0)
  text:SetJustifyH("LEFT")
  rows[i] = { icon = icon, text = text }
end

local function place()
  local p = settings().point or DEFAULT_POINT
  frame:ClearAllPoints()
  frame:SetPoint(p[1], UIParent, p[2], p[3], p[4])
end

local shownSignature = nil
local alerted = {}

local function render(warnings)
  local unlocked = not settings().locked
  local list = warnings
  if unlocked and #list == 0 then
    list = { { icon = SOULSTONE_ICON, text = "MGA Buffs: drag me, then /mgabuffs lock" } }
  end
  local parts = {}
  for _, w in ipairs(list) do table.insert(parts, w.text) end
  local signature = table.concat(parts, "|") .. (unlocked and "|unlocked" or "")
  if signature == shownSignature then return end
  shownSignature = signature
  for i, row in ipairs(rows) do
    local w = list[i]
    if w then
      local color = w.urgent and URGENT or WARN
      row.icon:SetTexture(w.icon)
      row.icon:Show()
      row.text:SetTextColor(color[1], color[2], color[3])
      row.text:SetText(w.text)
      row.text:Show()
    else
      row.icon:Hide()
      row.text:SetText("")
      row.text:Hide()
    end
  end
  frame:SetHeight(math.max(1, math.min(#list, MAX_ROWS)) * ROW_HEIGHT)
  frame:EnableMouse(unlocked)
  if #list > 0 then frame:Show() else frame:Hide() end
end

-- A warning that wasn't showing a moment ago flashes mid-screen once, with a sound.
local function alert(warnings)
  local now = {}
  for _, w in ipairs(warnings) do
    now[w.key] = true
    if not alerted[w.key] and settings().sound then
      if RaidNotice_AddMessage and RaidWarningFrame then
        RaidNotice_AddMessage(RaidWarningFrame, w.text, ChatTypeInfo and ChatTypeInfo["RAID_WARNING"] or { r = 1, g = 0.82, b = 0 })
      end
      if PlaySound then PlaySound(SOUNDKIT and SOUNDKIT.RAID_WARNING or 8959) end
    end
  end
  alerted = now
end

local failed = false
local function check()
  local ok, result = pcall(currentWarnings)
  if not ok then
    -- A client API that behaves differently from what this addon expects: say so once, not every second.
    if not failed then say("stopped checking: " .. tostring(result) .. ". Tell MyGamingAssistant.") end
    failed = true
    render({})
    return
  end
  -- In combat or dead: hide, but remember what was already flashed so it doesn't flash again after.
  if not result then render({}) return end
  alert(result)
  render(result)
end

-- Slash command -------------------------------------------------------------

local function onOff(value)
  return value and "on" or "off"
end

local function status()
  local s = settings()
  local parts = {}
  for _, key in ipairs(CHECKS) do table.insert(parts, key .. " " .. onOff(s[key])) end
  say(table.concat(parts, ", ") .. "; warns " .. s.minutes .. " min before a buff runs out; sound " .. onOff(s.sound) .. ".")
  local warnings = currentWarnings()
  if not warnings then
    say("buffs are checked once you're out of combat and alive.")
  elseif #warnings == 0 then
    say("nothing missing right now.")
  else
    for _, w in ipairs(warnings) do say(w.text) end
  end
end

SLASH_MGABUFFS1 = "/mgabuffs"
SlashCmdList.MGABUFFS = function(message)
  local s = settings()
  local command, arg = (message or ""):lower():match("^%s*(%S*)%s*(.-)%s*$")
  if command == "" then
    status()
  elseif set(CHECKS)[command] then
    s[command] = not s[command]
    say(command .. " reminders " .. onOff(s[command]) .. ".")
  elseif command == "minutes" then
    local n = tonumber(arg)
    if not n or n < 1 or n > 30 then
      say("give a number of minutes from 1 to 30, like /mgabuffs minutes 5.")
    else
      s.minutes = math.floor(n)
      say("warning " .. s.minutes .. " min before a buff runs out.")
    end
  elseif command == "sound" then
    s.sound = not s.sound
    say("sound and mid-screen flash " .. onOff(s.sound) .. ".")
  elseif command == "unlock" then
    s.locked = false
    say("drag the list where you want it, then /mgabuffs lock.")
  elseif command == "lock" then
    s.locked = true
    say("list locked.")
  elseif command == "reset" then
    s.point = nil
    place()
    say("list back in its starting place.")
  else
    say("/mgabuffs [armor | soulstone | food | group | minutes N | sound | unlock | lock | reset]")
    return
  end
  shownSignature = nil
  check()
end

-- Events ----------------------------------------------------------------------

-- Its own frame: the list hides, and a hidden frame gets no OnUpdate.
local events = CreateFrame("Frame")
events:RegisterEvent("PLAYER_LOGIN")
events:RegisterEvent("PLAYER_REGEN_DISABLED")
events:RegisterEvent("UNIT_SPELLCAST_SUCCEEDED")
events:SetScript("OnEvent", function(_, event, unit, _, spellId)
  if event == "PLAYER_LOGIN" then
    place()
    check()
    if C_Timer and C_Timer.NewTicker then
      C_Timer.NewTicker(TICK_SECONDS, check)
    else
      local waited = 0
      events:SetScript("OnUpdate", function(_, elapsed)
        waited = waited + elapsed
        if waited >= TICK_SECONDS then waited = 0; check() end
      end)
    end
  elseif event == "PLAYER_REGEN_DISABLED" then
    render({})
  elseif event == "UNIT_SPELLCAST_SUCCEEDED" and unit == "player" and SOULSTONE_BUFFS[spellId] then
    lastSoulstoneCast = GetTime()
  end
end)
