-- MGA Loot — whether an item is an upgrade over what you wear: on each loot
-- roll, and on the tooltip of any item (bags, bank, vendors, chat links).
--
-- Scores items with MyGamingAssistant's Item compare weights (Data.lua):
-- under level 60 your class's leveling weights (an estimate); at 60 your
-- spec's Pawn Classic scale. Your spec comes from /mgaloot spec, or else from
-- the talent tab with the most points. It never rolls for you.
--
--   Beside the roll window: "Upgrade +14% over [your item]", "Downgrade",
--   "About the same", "Your slot is empty" or "Can't use", then tags: binds on
--   pickup or equip, the level it needs, effects and stats it can't score.
--   On an item's tooltip: the same verdict (the tooltip already shows binding and
--   level), except on the items you're wearing.
--   /mgaloot              which weights it's using
--   /mgaloot spec <name>  set your spec (holy, feral-tank, ...); "auto" reads talents
--   /mgaloot check <link> the verdict for any item, without a roll
--   /mgaloot bags         the upgrades in your bags, biggest first
--   /mgaloot tooltip off  stop adding the verdict to tooltips ("on" brings it back)
--
-- The Forever client's APIs aren't documented, so every call is checked first;
-- when the roll window can't be found the verdict goes to chat instead.

local ADDON = "MGA Loot"
local PREFIX = "|cff33aaff" .. ADDON .. ":|r "
local MAX_LEVEL = 60
-- Closer than this (percent) is "about the same": the weights aren't that exact.
local SIDEGRADE_PCT = 5
-- Past this the old item scores next to nothing, so a percentage means little.
local MAX_SHOWN_PCT = 300
local TEXT_WIDTH = 240
-- Bag 0 is the backpack; 1-4 the bags beside it.
local LAST_BAG = NUM_BAG_SLOTS or 4
-- Sorts an empty slot (no percentage) above every upgrade by a percentage.
local EMPTY_SLOT_PCT = math.huge

local GREEN, RED, YELLOW, GREY = "|cff40ff40", "|cffff6060", "|cffffd040", "|cff9d9d9d"

-- GetItemStats keys → MGA stat keys. Anything else on an item is "not scored".
local STAT = {
  ITEM_MOD_STRENGTH_SHORT = "strength",
  ITEM_MOD_AGILITY_SHORT = "agility",
  ITEM_MOD_STAMINA_SHORT = "stamina",
  ITEM_MOD_INTELLECT_SHORT = "intellect",
  ITEM_MOD_SPIRIT_SHORT = "spirit",
  ITEM_MOD_ATTACK_POWER_SHORT = "attack_power",
  ITEM_MOD_RANGED_ATTACK_POWER_SHORT = "ranged_attack_power",
  ITEM_MOD_FERAL_ATTACK_POWER_SHORT = "feral_attack_power",
  ITEM_MOD_SPELL_POWER_SHORT = "spell_power",
  ITEM_MOD_SPELL_DAMAGE_DONE_SHORT = "spell_damage",
  ITEM_MOD_SPELL_HEALING_DONE_SHORT = "healing",
  ITEM_MOD_MANA_REGENERATION_SHORT = "mp5",
  ITEM_MOD_POWER_REGEN0_SHORT = "mp5",
  ITEM_MOD_DEFENSE_SKILL_RATING_SHORT = "defense",
  ITEM_MOD_BLOCK_VALUE_SHORT = "block_value",
  ITEM_MOD_SPELL_PENETRATION_SHORT = "spell_penetration",
  RESISTANCE2_NAME = "fire_resistance",
  RESISTANCE3_NAME = "nature_resistance",
  RESISTANCE4_NAME = "frost_resistance",
  RESISTANCE5_NAME = "shadow_resistance",
  RESISTANCE6_NAME = "arcane_resistance",
}
local DPS_KEY = "ITEM_MOD_DAMAGE_PER_SECOND_SHORT"
local ARMOR_KEY = "RESISTANCE0_NAME"

-- Equip location → the inventory slots it can go in.
local SLOTS = {
  INVTYPE_HEAD = { 1 }, INVTYPE_NECK = { 2 }, INVTYPE_SHOULDER = { 3 }, INVTYPE_CHEST = { 5 },
  INVTYPE_ROBE = { 5 }, INVTYPE_WAIST = { 6 }, INVTYPE_LEGS = { 7 }, INVTYPE_FEET = { 8 },
  INVTYPE_WRIST = { 9 }, INVTYPE_HAND = { 10 }, INVTYPE_FINGER = { 11, 12 }, INVTYPE_TRINKET = { 13, 14 },
  INVTYPE_CLOAK = { 15 }, INVTYPE_WEAPON = { 16, 17 }, INVTYPE_2HWEAPON = { 16 },
  INVTYPE_WEAPONMAINHAND = { 16 }, INVTYPE_WEAPONOFFHAND = { 17 }, INVTYPE_SHIELD = { 17 },
  INVTYPE_HOLDABLE = { 17 }, INVTYPE_RANGED = { 18 }, INVTYPE_RANGEDRIGHT = { 18 },
  INVTYPE_THROWN = { 18 }, INVTYPE_RELIC = { 18 },
}
local MAIN_HAND, OFF_HAND = 16, 17
local RANGED_LOC = { INVTYPE_RANGED = true, INVTYPE_RANGEDRIGHT = true, INVTYPE_THROWN = true }
-- What a one-hander rolled for the off hand can be compared with: not a shield or held item.
local OFF_HAND_WEAPON = { INVTYPE_WEAPON = true, INVTYPE_WEAPONOFFHAND = true }

local ARMOR_CLASS, WEAPON_CLASS = 4, 2
local ARMOR_TYPE = { [1] = "Cloth", [2] = "Leather", [3] = "Mail", [4] = "Plate" }
local SHIELD_SUBCLASS = 6
local RELIC_CLASS = { [7] = "paladin", [8] = "druid", [9] = "shaman" }
local WEAPON_TYPE = {
  [0] = "Axe", [1] = "Axe", [2] = "Bow", [3] = "Gun", [4] = "Mace", [5] = "Mace", [6] = "Polearm",
  [7] = "Sword", [8] = "Sword", [10] = "Staff", [13] = "Fist Weapon", [15] = "Dagger", [16] = "Thrown",
  [18] = "Crossbow", [19] = "Wand",
}
local TWO_HANDED = { [1] = true, [5] = true, [6] = true, [8] = true, [10] = true }
local RANGED_WEAPON = { [2] = true, [3] = true, [16] = true, [18] = true, [19] = true }
local BIND_TEXT = { [1] = "binds on pickup", [2] = "binds when equipped" }
-- Classic writes hit, crit, dodge, parry and block chance as "Equip: Improves (or Increases) your chance to ... by 1%.".
local CHANCE_LINES = { "^Equip: Improves your chance to", "^Equip: Increases your chance to" }
-- Equip lines that are a plain number come through GetItemStats: "+40 Attack Power.", "Increased Defense +7.",
-- "Increases healing done ... by up to 22.", "Increases the block value of your shield by 10.", "Restores 4 mana per 5 sec.".
local STAT_LINES = {
  "^Equip: %+%d+ [^%.]+%.$", "^Equip: Increased [^%.]+ %+%d+%.$", "^Equip: Increases .- by %d+%.$",
  "^Equip: Increases .- by up to %d+%.$", "^Equip: Restores %d+ mana per 5 sec%.$",
}
local EFFECT_LINES = { "^Equip:", "^Use:", "^Chance on hit:" }

MGALootSettings = MGALootSettings or {}

local function say(message)
  DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. message)
end

local function itemInfo(link)
  local get = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  if not get or not link then return nil end
  local name, _, _, _, minLevel, _, _, _, equipLoc, _, _, classID, subclassID, bindType = get(link)
  if not name then return nil end
  return { minLevel = minLevel or 0, equipLoc = equipLoc or "", classID = classID, subclassID = subclassID, bindType = bindType }
end

local function statsApi()
  return (C_Item and C_Item.GetItemStats) or GetItemStats
end

local function itemId(link)
  return link and tonumber(link:match("item:(%d+)"))
end

-- The item's tooltip text, when the client can give it to an addon; nil otherwise.
local function tooltipLines(link)
  if not (C_TooltipInfo and C_TooltipInfo.GetHyperlink) then return nil end
  local data = C_TooltipInfo.GetHyperlink(link)
  if not data or not data.lines then return nil end
  local lines = {}
  for _, line in ipairs(data.lines) do
    if line.leftText then table.insert(lines, line.leftText) end
  end
  return lines
end

local function matchesAny(text, patterns)
  for _, pattern in ipairs(patterns) do
    if text:find(pattern) then return true end
  end
  return false
end

-- Whether the tooltip says Unique; false when the client can't give the tooltip.
local function isUnique(link)
  for _, line in ipairs(tooltipLines(link) or {}) do
    if line:find("^Unique") then return true end
  end
  return false
end

local function player()
  local _, token = UnitClass("player")
  local classId = token and token:lower() or ""
  return { classId = classId, class = MGALootData[classId], level = UnitLevel("player") or 0 }
end

-- Points spent in talent tab `tab`, whichever shape this client's GetTalentTabInfo returns.
local function talentPoints(tab)
  if not GetTalentTabInfo then return nil end
  local ok, a, _, c, _, e = pcall(GetTalentTabInfo, tab)
  if not ok then return nil end
  if type(a) == "number" then return tonumber(e) end
  return tonumber(c)
end

local function specById(class, id)
  for _, spec in ipairs(class.specs) do
    if spec.id == id then return spec end
  end
  return nil
end

-- The first spec on the tab with the most talent points (Feral = damage); nil with no points.
local function talentSpec(class)
  local best, bestPoints = nil, 0
  for tab = 1, 3 do
    local points = talentPoints(tab)
    if points and points > bestPoints then
      for _, spec in ipairs(class.specs) do
        if spec.tab == tab then best, bestPoints = spec, points; break end
      end
    end
  end
  return best
end

-- The weights to score with and how to label them.
local function weightsFor(me)
  if me.level < MAX_LEVEL then
    return me.class.leveling, "leveling estimate"
  end
  local spec = (MGALootSettings.spec and specById(me.class, MGALootSettings.spec)) or talentSpec(me.class)
  if spec then return spec.weights, "as " .. spec.name end
  return me.class.leveling, "leveling weights: set your spec with /mgaloot spec"
end

local function contains(list, value)
  for _, v in ipairs(list) do
    if v == value then return true end
  end
  return false
end

-- Why your class can't use it now, or nil.
local function cantUse(info, me)
  local p = me.class
  if info.classID == ARMOR_CLASS then
    local relicClass = RELIC_CLASS[info.subclassID]
    if relicClass then return relicClass ~= me.classId and "not for your class" or nil end
    if info.subclassID == SHIELD_SUBCLASS then return (not p.shield) and "your class can't use shields" or nil end
    local armor = ARMOR_TYPE[info.subclassID]
    if not armor or info.equipLoc == "INVTYPE_CLOAK" or contains(p.armor, armor) then return nil end
    if p.heavy and p.heavy.type == armor then
      return me.level < p.heavy.level and ("you can wear " .. armor .. " from level " .. p.heavy.level) or nil
    end
    return "your class can't wear " .. armor
  end
  if info.classID == WEAPON_CLASS then
    local weapon = WEAPON_TYPE[info.subclassID]
    if not weapon then return nil end
    local list = p.oneHand
    if TWO_HANDED[info.subclassID] then list = p.twoHand elseif RANGED_WEAPON[info.subclassID] then list = p.ranged end
    if not contains(list, weapon) then return "your class can't use this " .. weapon end
    if info.equipLoc == "INVTYPE_WEAPONOFFHAND" and not (p.dualWield and me.level >= p.dualWield) then
      return "you can't dual wield"
    end
  end
  return nil
end

-- Score with these weights; also the names of stats it couldn't score.
local function score(link, equipLoc, w)
  -- The client has the item by now (judge checks GetItemInfo first); no stats table means no stats.
  local stats = statsApi()(link) or {}
  local total, unscored = 0, {}
  for key, amount in pairs(stats) do
    if key == DPS_KEY then
      total = total + amount * (RANGED_LOC[equipLoc] and w.ranged or w.melee)
    elseif key == ARMOR_KEY then
      total = total + amount * w.armor
    elseif STAT[key] then
      total = total + amount * (w.stats[STAT[key]] or 0)
    else
      table.insert(unscored, _G[key] or key)
    end
  end
  table.sort(unscored)
  return total, unscored
end

local function equipped(slot)
  local link = GetInventoryItemLink("player", slot)
  if not link then return nil end
  local info = itemInfo(link)
  return { link = link, loc = info and info.equipLoc or "" }
end

-- The slots a rolled item would really go in: a one-hander only goes to the
-- off hand when you can dual wield and the off hand holds a weapon too.
local function candidateSlots(info, me)
  local slots = SLOTS[info.equipLoc]
  if info.equipLoc ~= "INVTYPE_WEAPON" then return slots end
  local p = me.class
  local off = equipped(OFF_HAND)
  if p.dualWield and me.level >= p.dualWield and off and OFF_HAND_WEAPON[off.loc] then return slots end
  return { MAIN_HAND }
end

-- What the new item would replace: {link, score} (nil link = empty slot), or a reason it can't be compared.
local function replaced(info, w, me, link)
  local main = equipped(MAIN_HAND)
  local slots = candidateSlots(info, me)
  local inHands = slots[1] == MAIN_HAND or slots[1] == OFF_HAND
  if info.equipLoc == "INVTYPE_2HWEAPON" then
    local off = equipped(OFF_HAND)
    if not main and not off then return { link = nil } end
    local total = 0
    for _, item in ipairs({ main or false, off or false }) do
      if item then total = total + (score(item.link, item.loc, w) or 0) end
    end
    return { link = (main or off).link, score = total }
  end
  if inHands and main and main.loc == "INVTYPE_2HWEAPON" then
    if slots[1] == OFF_HAND then return { blocked = "you use a two-hander" } end
    return { link = main.link, score = score(main.link, main.loc, w) or 0 }
  end
  local held = {}
  for _, slot in ipairs(slots) do
    local item = equipped(slot)
    if not item then return { link = nil } end
    table.insert(held, item)
  end
  local newId = itemId(link)
  local weakest
  for _, item in ipairs(held) do
    if itemId(item.link) == newId and isUnique(link) then return { blocked = "it's unique and you wear one" } end
    local s = score(item.link, item.loc, w) or 0
    if not weakest or s < weakest.score then weakest = { link = item.link, score = s } end
  end
  return weakest
end

-- What the tooltip has that the score leaves out; empty when the client can't give the tooltip.
local function effectTags(link)
  local chance, effect = false, false
  for _, line in ipairs(tooltipLines(link) or {}) do
    if matchesAny(line, CHANCE_LINES) then
      chance = true
    elseif matchesAny(line, EFFECT_LINES) and not matchesAny(line, STAT_LINES) then
      effect = true
    end
  end
  local tags = {}
  if chance then table.insert(tags, "hit/crit/dodge chances not scored") end
  if effect then table.insert(tags, "has effects it can't score: read the tooltip") end
  return tags
end

local function percentText(new, old)
  local pct = floor((new - old) / old * 100 + 0.5)
  if pct > MAX_SHOWN_PCT then return pct, "+" .. MAX_SHOWN_PCT .. "%+" end
  return pct, (pct > 0 and "+" or "") .. pct .. "%"
end

-- The verdict for an item, as {text, kind, pct, needs, pending}; nil when it isn't gear.
-- kind is "upgrade", "downgrade", "same" or nil (can't use / can't compare / trinket);
-- `needs` is the level it needs when above yours. `brief` leaves out the binding and
-- level tags, for a tooltip that already shows them.
local function judge(link, brief)
  local info = itemInfo(link)
  if not info then return { text = GREY .. "Checking the item...|r", pending = true } end
  if not SLOTS[info.equipLoc] then return nil end
  local me = player()
  if not me.class then return nil end

  local tags = {}
  local needs = info.minLevel > me.level and info.minLevel or nil
  if not brief then
    if BIND_TEXT[info.bindType] then table.insert(tags, BIND_TEXT[info.bindType]) end
    if needs then table.insert(tags, "needs level " .. needs) end
  end
  local why = cantUse(info, me)
  if why then
    return { text = RED .. "Can't use:|r " .. why .. (#tags > 0 and (GREY .. " · " .. table.concat(tags, " · ") .. "|r") or "") }
  end
  if not statsApi() then return { text = GREY .. "Can't compare: this client doesn't give addons item stats|r" } end

  local w, label = weightsFor(me)
  for _, tag in ipairs(effectTags(link)) do table.insert(tags, tag) end
  local text, kind, pct
  if info.equipLoc == "INVTYPE_TRINKET" then
    text = YELLOW .. "Trinket: judge it by its effect|r"
  else
    local new, unscored = score(link, info.equipLoc, w)
    if #unscored > 0 then table.insert(tags, "not scored: " .. table.concat(unscored, ", ")) end
    table.insert(tags, 1, label)
    local old = replaced(info, w, me, link)
    if old.blocked then
      text = GREY .. "Can't compare: " .. old.blocked .. "|r"
    elseif not old.link then
      text, kind, pct = GREEN .. "Upgrade: your slot is empty|r", "upgrade", EMPTY_SLOT_PCT
    elseif old.score <= 0 then
      if new > 0 then
        text, kind, pct = GREEN .. "Upgrade over|r " .. old.link, "upgrade", EMPTY_SLOT_PCT
      else
        text = GREY .. "Nothing it scores on either item|r"
      end
    else
      local shown
      pct, shown = percentText(new, old.score)
      if pct >= SIDEGRADE_PCT then
        text, kind = GREEN .. "Upgrade " .. shown .. " over|r " .. old.link, "upgrade"
      elseif pct <= -SIDEGRADE_PCT then
        text, kind = RED .. "Downgrade " .. shown .. " vs|r " .. old.link, "downgrade"
      else
        text, kind = YELLOW .. "About the same as|r " .. old.link, "same"
      end
    end
  end
  if #tags > 0 then text = text .. "\n" .. GREY .. table.concat(tags, " · ") .. "|r" end
  return { text = text, kind = kind, pct = pct, needs = needs }
end

-- The "item:..." part of a link: the same for a full chat link and the raw string
-- the client passes to SetHyperlink.
local function itemString(link)
  return link and link:match("item:[%-%d:]+")
end

-- Whether you're wearing this very item (same item string) in a slot it goes in.
local function wearing(link)
  local info = itemInfo(link)
  local this = itemString(link)
  for _, slot in ipairs(info and SLOTS[info.equipLoc] or {}) do
    if itemString(GetInventoryItemLink("player", slot)) == this then return true end
  end
  return false
end

local function firstLine(text)
  return text:match("^[^\n]*")
end

-- The roll window showing this roll, in either the Classic or the newer loot UI.
local function rollFrame(rollID)
  for i = 1, NUM_GROUP_LOOT_FRAMES or 4 do
    local frame = _G["GroupLootFrame" .. i]
    if frame and frame.rollID == rollID and frame:IsShown() then return frame end
  end
  if GroupLootContainer and GroupLootContainer.rollFrames then
    for _, frame in pairs(GroupLootContainer.rollFrames) do
      if frame.rollID == rollID and frame:IsShown() then return frame end
    end
  end
  return nil
end

-- The verdict sits to the right of the roll window: roll windows stack
-- vertically, so text above one would cover the next.
local function frameText(frame)
  if not frame.MGALootText then
    local text = frame:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    text:SetPoint("LEFT", frame, "RIGHT", 6, 0)
    text:SetWidth(TEXT_WIDTH)
    text:SetJustifyH("LEFT")
    frame.MGALootText = text
  end
  return frame.MGALootText
end

local pending, toldInChat, ended = {}, {}, {}

local function showRoll(rollID)
  if ended[rollID] then return end
  local link = GetLootRollItemLink and GetLootRollItemLink(rollID)
  if not link then return end
  local verdict = judge(link)
  pending[rollID] = verdict and verdict.pending or nil
  local frame = rollFrame(rollID)
  if frame then
    local text = frameText(frame)
    text:SetText(verdict and verdict.text or "")
    text:Show()
  elseif verdict and not verdict.pending and not toldInChat[rollID] then
    toldInChat[rollID] = true
    say(link .. " " .. verdict.text:gsub("\n", " — "))
  end
end

local function endRoll(rollID)
  ended[rollID], pending[rollID], toldInChat[rollID] = true, nil, nil
  local frame = rollFrame(rollID)
  if frame and frame.MGALootText then frame.MGALootText:SetText("") end
end

local events = CreateFrame("Frame")
events:RegisterEvent("START_LOOT_ROLL")
events:RegisterEvent("CANCEL_LOOT_ROLL")
events:RegisterEvent("GET_ITEM_INFO_RECEIVED")
events:SetScript("OnEvent", function(_, event, rollID)
  if event == "START_LOOT_ROLL" then
    ended[rollID] = nil
    -- The roll window may appear after the event, so look for it next frame.
    if C_Timer and C_Timer.After then C_Timer.After(0, function() showRoll(rollID) end) else showRoll(rollID) end
  elseif event == "CANCEL_LOOT_ROLL" then
    endRoll(rollID)
  elseif event == "GET_ITEM_INFO_RECEIVED" then
    for id in pairs(pending) do showRoll(id) end
  end
end)

-- Tooltips. MGALootSettings.tooltip == false turns the verdict line off.
local TOOLTIPS = { GameTooltip = true, ItemRefTooltip = true }

local function tooltipsOn()
  return MGALootSettings.tooltip ~= false
end

-- Adds the verdict once per tooltip show: several hooks fire for one show, with the
-- item as a full link or a raw item string, so the guard is the item id. An item the
-- game hasn't loaded leaves the guard unset, so a later hook in the same show can try again.
local function addVerdict(tooltip, link)
  local id = itemId(link)
  if not id or tooltip.mgaLootItem == id or not tooltipsOn() then return end
  local verdict = not wearing(link) and judge(link, true)
  if verdict and verdict.pending then return end
  tooltip.mgaLootItem = id
  if not verdict then return end
  local prefix = PREFIX
  for line in verdict.text:gmatch("[^\n]+") do
    tooltip:AddLine(prefix .. line, 1, 1, 1, true)
    prefix = ""
  end
end

-- The full link (random suffix included) when the tooltip gives it; else one built from the id.
local function tooltipLink(tooltip, data)
  local _, link
  if tooltip.GetItem then _, link = tooltip:GetItem() end
  if link then return link end
  return data and data.id and ("item:" .. data.id) or nil
end

-- Like MGA Prices: hook every way the client builds an item tooltip, since which
-- ones fire differs by client build; addVerdict's per-link guard adds it once.
if TooltipDataProcessor and Enum and Enum.TooltipDataType then
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
    if TOOLTIPS[tooltip:GetName() or ""] then addVerdict(tooltip, tooltipLink(tooltip, data)) end
  end)
end
for name in pairs(TOOLTIPS) do
  local tooltip = _G[name]
  if tooltip then
    tooltip:HookScript("OnTooltipCleared", function(self) self.mgaLootItem = nil end)
    if not tooltip.HasScript or tooltip:HasScript("OnTooltipSetItem") then
      tooltip:HookScript("OnTooltipSetItem", function(self) addVerdict(self, tooltipLink(self)) end)
    end
    -- A clicked chat link opens ItemRefTooltip with SetHyperlink: add it there too, then
    -- Show() so the tooltip grows to fit.
    if hooksecurefunc then
      hooksecurefunc(tooltip, "SetHyperlink", function(self, link)
        local id = type(link) == "string" and itemId(link)
        if id and self.mgaLootItem ~= id then
          addVerdict(self, link)
          self:Show()
        end
      end)
    end
  end
end

-- Every item link in your bags once each, or nil when the client gives addons no bag API.
local function bagLinks()
  local container = C_Container
  local numSlots = (container and container.GetContainerNumSlots) or GetContainerNumSlots
  local slotLink = (container and container.GetContainerItemLink) or GetContainerItemLink
  if not (numSlots and slotLink) then return nil end
  local links, seen = {}, {}
  for bag = 0, LAST_BAG do
    for slot = 1, numSlots(bag) or 0 do
      local link = slotLink(bag, slot)
      if link and not seen[link] then
        seen[link] = true
        table.insert(links, link)
      end
    end
  end
  return links
end

local function biggestFirst(a, b)
  if a.verdict.pct ~= b.verdict.pct then return a.verdict.pct > b.verdict.pct end
  return a.link < b.link
end

local function bags()
  local me = player()
  if not me.class then return say("doesn't know your class.") end
  local links = bagLinks()
  if not links then return say("this client doesn't let addons read your bags.") end
  local upgrades, loading = {}, 0
  for _, link in ipairs(links) do
    local verdict = judge(link, true)
    if verdict and verdict.pending then
      loading = loading + 1
    elseif verdict and verdict.kind == "upgrade" then
      table.insert(upgrades, { link = link, verdict = verdict })
    end
  end
  table.sort(upgrades, biggestFirst)
  local _, label = weightsFor(me)
  if #upgrades == 0 then
    say("nothing in your bags is an upgrade (" .. label .. ").")
  else
    say("upgrades in your bags (" .. label .. "):")
    for _, found in ipairs(upgrades) do
      local needs = found.verdict.needs and (GREY .. " (needs level " .. found.verdict.needs .. ")|r") or ""
      say(found.link .. " " .. firstLine(found.verdict.text) .. needs)
    end
  end
  if loading > 0 then say(loading .. " more still loading: run /mgaloot bags again in a moment.") end
end

local function status()
  local me = player()
  if not me.class then return say("doesn't know your class.") end
  local _, label = weightsFor(me)
  local spec = me.level >= MAX_LEVEL and (" Spec: " .. (MGALootSettings.spec or "auto from talents") .. ".") or ""
  say("level " .. me.level .. " " .. me.classId .. ", " .. label .. "." .. spec)
end

SLASH_MGALOOT1 = "/mgaloot"
SlashCmdList.MGALOOT = function(msg)
  local command, rest = (msg or ""):match("^%s*(%S*)%s*(.-)%s*$")
  command = command:lower()
  if command == "spec" then
    local me = player()
    if rest:lower() == "auto" then
      MGALootSettings.spec = nil
      return say("spec: auto from your talents.")
    end
    if me.class and specById(me.class, rest:lower()) then
      MGALootSettings.spec = rest:lower()
      return say("spec: " .. specById(me.class, rest:lower()).name .. ".")
    end
    local names = {}
    for _, spec in ipairs(me.class and me.class.specs or {}) do table.insert(names, spec.id) end
    return say("pick one of: " .. table.concat(names, ", ") .. ", or auto.")
  end
  if command == "bags" then return bags() end
  if command == "tooltip" then
    local turn = rest:lower()
    if turn ~= "on" and turn ~= "off" then
      return say("tooltip verdicts are " .. (tooltipsOn() and "on" or "off") .. ": /mgaloot tooltip on or off.")
    end
    MGALootSettings.tooltip = turn == "on"
    return say("tooltip verdicts " .. turn .. ".")
  end
  if command == "check" then
    local link = rest:match("(|c%x+|Hitem:.-|h.-|h|r)") or rest:match("(item:[%d:%-]+)")
    if not link then return say("put an item link after /mgaloot check.") end
    local verdict = judge(link)
    if verdict and verdict.pending then return say("the game hasn't loaded " .. link .. " yet: check it again in a moment.") end
    return say(link .. " " .. (verdict and verdict.text:gsub("\n", " — ") or "isn't gear."))
  end
  status()
end
