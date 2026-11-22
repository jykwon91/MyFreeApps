-- MGA Loot — whether an item is an upgrade over what you wear: on each loot
-- roll, and on the tooltip of any item (bags, bank, vendors, chat links).
--
-- Scores items with MyGamingAssistant's Item compare weights (Data.lua):
-- under level 60 your class's leveling weights (an estimate); at 60 your
-- spec's Pawn Classic scale. Your spec comes from /mgaloot spec, or else from
-- the talent tab with the most points. It never rolls for you.
-- Use, Chance on hit and Equip effects count at the stat they're worth on
-- average (MGALootEffects in Data.lua, worked out from the game files), with
-- a note saying how. An effect the data can't value is estimated from the
-- item's level: the stat points it lacks next to items of its slot, quality
-- and level with no effect (MGALootBudget), at your average stat weight.
-- Weights and models are PvE ("PvE values" in the tags); an effect worth a lot
-- more against players (control, immunities, damage shields, armor cuts) says
-- "(worth more in PvP)". That is a label only: there are no PvP weights.
-- A change to one class's spells (an entry's `class`) counts only for that
-- class; anyone else counts it as 0, and it never makes them an estimate.
--
--   Beside the roll window: "Upgrade +14% over [your item]", "Downgrade",
--   "About the same", "Your slot is empty" or "Can't use", then tags: binds on
--   pickup or equip, the level it needs, and how each effect was counted.
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
-- Every weight and model is for fighting mobs; PvP is a label, never a number.
local PVE_TAG = "PvE values"
local PVP_NOTE = " (worth more in PvP)"
local OTHER_CLASS_NOTE = " (only for %ss, so it counts 0)"
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
  -- Forever's school spell damage (client stat ids 84-89; key names from its GlobalStrings).
  ITEM_MOD_HOLY_DAMAGE_DONE_SHORT = "holy_spell_damage",
  ITEM_MOD_FIRE_DAMAGE_DONE_SHORT = "fire_spell_damage",
  ITEM_MOD_NATURE_DAMAGE_DONE_SHORT = "nature_spell_damage",
  ITEM_MOD_FROST_DAMAGE_DONE_SHORT = "frost_spell_damage",
  ITEM_MOD_SHADOW_DAMAGE_DONE_SHORT = "shadow_spell_damage",
  ITEM_MOD_ARCANE_DAMAGE_DONE_SHORT = "arcane_spell_damage",
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
-- Classic's hit, crit, dodge, parry and block chance: GetItemStats may give it as a "rating" of 1 per 1%.
local CHANCE_STAT = {
  ITEM_MOD_HIT_RATING_SHORT = "hit_pct",
  ITEM_MOD_CRIT_RATING_SHORT = "crit_pct",
  ITEM_MOD_HIT_SPELL_RATING_SHORT = "spell_hit_pct",
  ITEM_MOD_CRIT_SPELL_RATING_SHORT = "spell_crit_pct",
  ITEM_MOD_DODGE_RATING_SHORT = "dodge_pct",
  ITEM_MOD_PARRY_RATING_SHORT = "parry_pct",
  ITEM_MOD_BLOCK_RATING_SHORT = "block_pct",
}
-- The same chances as the tooltip writes them. Spell lines come first: "to hit with spells" also starts "to hit".
local CHANCE_TEXT = {
  { "^Equip: Improves your chance to hit with spells by (%d+)%%%.$", "spell_hit_pct" },
  { "^Equip: Improves your chance to get a critical strike with spells by (%d+)%%%.$", "spell_crit_pct" },
  { "^Equip: Improves your chance to hit by (%d+)%%%.$", "hit_pct" },
  { "^Equip: Improves your chance to get a critical strike by (%d+)%%%.$", "crit_pct" },
  { "^Equip: Increases your chance to dodge an attack by (%d+)%%%.$", "dodge_pct" },
  { "^Equip: Increases your chance to parry an attack by (%d+)%%%.$", "parry_pct" },
  { "^Equip: Increases your chance to block attacks with a shield by (%d+)%%%.$", "block_pct" },
}
-- MGALootEffects stat keys that are chances, merged with the item's own (the highest counts, never both).
local EFFECT_CHANCE = {
  hit_pct = true, crit_pct = true, spell_hit_pct = true, spell_crit_pct = true,
  dodge_pct = true, parry_pct = true, block_pct = true,
}
-- Effects that only work with a ranged weapon: counted only for weights that value ranged DPS over melee.
local EFFECT_RANGED = { ranged_hit_pct = "hit_pct", ranged_crit_pct = "crit_pct", ranged_haste_pct = "haste_pct" }
-- "Spell Damage Vs Humanoids" and the like: the stat it is, against one creature type.
local VS_BASE = { SPELL_DAMAGE = "spell_damage", ATTACK_POWER = "attack_power" }
local DPS_KEY = "ITEM_MOD_DAMAGE_PER_SECOND_SHORT"
local ARMOR_KEY = "RESISTANCE0_NAME"
-- Stats whose amounts aren't on the stat-point scale: left out of an item's stat points, and given no weight.
local NOT_POINTS = { ITEM_MOD_MANA_SHORT = true, ITEM_MOD_HEALTH_SHORT = true }
-- A stat point at your average weight is the mean of the primary stats your weights value.
local PRIMARY_STATS = { "strength", "agility", "stamina", "intellect", "spirit" }
-- Equip location -> MGALootBudget's slot group.
local BUDGET_GROUP = {
  INVTYPE_HEAD = "head_chest_legs", INVTYPE_CHEST = "head_chest_legs", INVTYPE_ROBE = "head_chest_legs",
  INVTYPE_LEGS = "head_chest_legs",
  INVTYPE_SHOULDER = "shoulder_hands_feet_waist", INVTYPE_HAND = "shoulder_hands_feet_waist",
  INVTYPE_FEET = "shoulder_hands_feet_waist", INVTYPE_WAIST = "shoulder_hands_feet_waist",
  INVTYPE_WRIST = "wrist_neck_finger_back", INVTYPE_NECK = "wrist_neck_finger_back",
  INVTYPE_FINGER = "wrist_neck_finger_back", INVTYPE_CLOAK = "wrist_neck_finger_back",
  INVTYPE_TRINKET = "trinket",
  INVTYPE_WEAPON = "one_hand", INVTYPE_WEAPONMAINHAND = "one_hand", INVTYPE_WEAPONOFFHAND = "one_hand",
  INVTYPE_2HWEAPON = "two_hand",
  INVTYPE_RANGED = "ranged", INVTYPE_RANGEDRIGHT = "ranged", INVTYPE_THROWN = "ranged", INVTYPE_RELIC = "ranged",
  INVTYPE_SHIELD = "off_hand", INVTYPE_HOLDABLE = "off_hand",
}

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
  local name, _, quality, itemLevel, minLevel, _, _, _, equipLoc, _, _, classID, subclassID, bindType = get(link)
  if not name then return nil end
  return {
    minLevel = minLevel or 0, equipLoc = equipLoc or "", classID = classID, subclassID = subclassID, bindType = bindType,
    quality = quality or 0, itemLevel = itemLevel or 0,
  }
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

-- The share of mobs at this level of a creature type ("HUMANOID"), from MGALootCreatureShare.
local function creatureShare(level, kind)
  local shares = MGALootCreatureShare or {}
  local band = math.min(math.floor(level / 10) * 10, MGALootCreatureShareTop or 50)
  return (shares[band] or {})[kind] or 0
end

local function plural(kind)
  local word = kind:sub(1, 1) .. kind:sub(2):lower()
  if word == "Undead" or word == "Mechanical" then return word end
  return word .. "s"
end

-- Classic's spell coefficient is cast time / 3.5, so a point of spell damage is worth 1/3.5 DPS:
-- damage per second from a spell-cast proc is worth 3.5 spell damage per point.
local SPELL_DAMAGE_PER_DPS = 3.5

-- Classic's armor damage reduction against a mob of `armor` when you're `level`.
local function armorReduction(armor, level)
  armor = math.max(0, armor)
  return armor / (armor + 400 + 85 * level)
end

-- The share of weapon DPS `cut` armor off the target adds: against the median armor of normal mobs
-- in your ten-level band (MGALootMobArmor). Nil with no mob data.
local function armorCutShare(cut, level)
  local bands = MGALootMobArmor or {}
  local band = math.min(math.floor(level / 10) * 10, MGALootMobArmorTop or 50)
  local armor = bands[band]
  if not armor then return nil end
  return (1 - armorReduction(armor - cut, level)) / (1 - armorReduction(armor, level)) - 1, armor
end

-- The DPS of the weapon in your main hand, for extra attacks on an item that isn't a weapon.
local function mainHandDps()
  local link = GetInventoryItemLink("player", MAIN_HAND)
  local stats = link and statsApi()(link)
  return stats and stats[DPS_KEY] or 0
end

-- Your average weight for a stat point: the mean of the primary stats your weights value (0 when none).
local function averageStatWeight(w)
  local sum, count = 0, 0
  for _, stat in ipairs(PRIMARY_STATS) do
    local weight = w.stats[stat] or 0
    if weight > 0 then sum, count = sum + weight, count + 1 end
  end
  return count > 0 and sum / count or 0
end

-- The item's stat points: every stat but weapon DPS, armor, mana and health.
local function statPoints(stats)
  local points = 0
  for key, amount in pairs(stats) do
    if key ~= DPS_KEY and key ~= ARMOR_KEY and not NOT_POINTS[key] then points = points + amount end
  end
  return points
end

-- The median stat points of items with no effect at this item's slot group, quality and item level (0 when none).
local function budgetPoints(info)
  local byQuality = MGALootBudget and info and MGALootBudget[BUDGET_GROUP[info.equipLoc] or ""]
  local levels = byQuality and byQuality[info.quality]
  if not levels or info.itemLevel < 1 then return 0 end
  return levels[math.min(info.itemLevel, MGALootBudgetTop or #levels)] or 0
end

-- Add MGALootEffects' values for this item (what its Use, Chance on hit and Equip lines are worth).
-- Returns whether the data has the item, what its valued effects add, and the stat points its item-level
-- estimate gives (nil when every effect is valued).
local function scoreEffects(id, stats, equipLoc, w, chance, notes, level)
  local entries = MGALootEffects and id and MGALootEffects[id]
  if not entries then return false, 0 end
  local budget, estimateForMe
  local myClass = player().classId
  local weaponDps = RANGED_LOC[equipLoc] and w.ranged or w.melee
  local spellDps = (w.stats.spell_damage or 0) * SPELL_DAMAGE_PER_DPS
  local rangedFirst = w.ranged > w.melee
  local add = 0
  for _, e in ipairs(entries) do
    local ranged = EFFECT_RANGED[e.stat]
    local note = e.note
    if e.class and e.class ~= myClass then
      note = note .. OTHER_CLASS_NOTE:format(e.class)
    elseif e.stat == "budget" then
      budget, note = e.value, nil
    elseif e.stat == "unresolved" then
      estimateForMe = true
    elseif e.stat == "dps" then
      add = add + e.value * weaponDps
    elseif e.stat == "spell_dps" then
      add = add + e.value * spellDps
    elseif e.stat == "use_dps" then
      add = add + e.value * math.max(weaponDps, spellDps)
    elseif e.stat == "dps_pct" then
      add = add + e.value * (stats[DPS_KEY] or mainHandDps()) * w.melee
    elseif e.stat == "armor_cut" then
      local share, armor = armorCutShare(e.value, level or 0)
      if share then
        add = add + share * (stats[DPS_KEY] or mainHandDps()) * w.melee
        note = note .. ", worth +" .. floor(share * 1000 + 0.5) / 10 .. "% weapon DPS vs " .. armor .. " armor (normal mobs your level)"
      end
    elseif e.stat == "armor" then
      add = add + e.value * w.armor
    elseif ranged then
      if rangedFirst then chance[ranged] = math.max(chance[ranged] or 0, e.value) end
    elseif EFFECT_CHANCE[e.stat] then
      chance[e.stat] = math.max(chance[e.stat] or 0, e.value)
    elseif e.stat ~= "none" then
      add = add + e.value * (w.stats[e.stat] or 0)
    end
    if note and e.pvp then note = note .. PVP_NOTE end
    if note then table.insert(notes, note) end
  end
  -- The estimate pays for the effects the data can't value; only those that count for you.
  return true, add, estimateForMe and budget or nil
end

-- Score with these weights. Also returns notes on how it counted creature-type stats, stats it has no
-- weight for and item effects.
local function score(link, equipLoc, w, level)
  -- The client has the item by now (judge checks GetItemInfo first); no stats table means no stats.
  local stats = statsApi()(link) or {}
  local total, notes = 0, {}
  local chance = {}
  local averageWeight = averageStatWeight(w)
  local effectsCovered, effectsValue, budget = scoreEffects(itemId(link), stats, equipLoc, w, chance, notes, level)
  local uncountedLine = false
  total = total + effectsValue
  for key, amount in pairs(stats) do
    local vsStat, vsKind = key:match("^ITEM_MOD_(%u+_%u+)_VS_(%u+)_SHORT$")
    if key == DPS_KEY then
      total = total + amount * (RANGED_LOC[equipLoc] and w.ranged or w.melee)
    elseif key == ARMOR_KEY then
      total = total + amount * w.armor
    elseif STAT[key] then
      total = total + amount * (w.stats[STAT[key]] or 0)
    elseif CHANCE_STAT[key] then
      chance[CHANCE_STAT[key]] = math.max(chance[CHANCE_STAT[key]] or 0, amount)
    elseif vsStat and VS_BASE[vsStat] then
      local share = creatureShare(level, vsKind)
      total = total + amount * (w.stats[VS_BASE[vsStat]] or 0) * share
      table.insert(notes, (_G[key] or key) .. " counted at " .. floor(share * 100 + 0.5) .. "% (" .. plural(vsKind):lower() .. " among mobs your level)")
    elseif NOT_POINTS[key] then
      table.insert(notes, (_G[key] or key) .. " has no stat weight, so it counts as 0")
    else
      total = total + amount * averageWeight
      table.insert(notes, (_G[key] or key) .. " counted at your average stat weight")
    end
  end
  for _, line in ipairs(tooltipLines(link) or {}) do
    local matched = false
    for _, c in ipairs(CHANCE_TEXT) do
      local n = line:match(c[1])
      if n then
        chance[c[2]] = math.max(chance[c[2]] or 0, tonumber(n))
        matched = true
        break
      end
    end
    if not matched and not effectsCovered and matchesAny(line, EFFECT_LINES) and not matchesAny(line, STAT_LINES) then
      uncountedLine = true
    end
  end
  for stat, pct in pairs(chance) do
    total = total + pct * (w.stats[stat] or 0)
  end
  if uncountedLine and not budget then
    budget = math.max(0, budgetPoints(itemInfo(link)) - statPoints(stats))
  end
  if budget then
    -- The budget pays for every effect on the item, so what the valued ones add already counts toward it.
    local worth = math.max(0, budget * averageWeight - effectsValue)
    total = total + worth
    local points = averageWeight > 0 and floor(worth / averageWeight + 0.5) or 0
    table.insert(notes, "effect estimated from item level: worth ~" .. points .. " stat points")
  end
  table.sort(notes)
  return total, notes
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
-- For rings and dual-wielded weapons it's the weaker of the two you wear, and `other` is the stronger one.
local function replaced(info, w, me, link)
  local main = equipped(MAIN_HAND)
  local slots = candidateSlots(info, me)
  local inHands = slots[1] == MAIN_HAND or slots[1] == OFF_HAND
  if info.equipLoc == "INVTYPE_2HWEAPON" then
    local off = equipped(OFF_HAND)
    if not main and not off then return { link = nil } end
    local total = 0
    for _, item in ipairs({ main or false, off or false }) do
      if item then total = total + score(item.link, item.loc, w, me.level) end
    end
    return { link = (main or off).link, score = total }
  end
  if inHands and main and main.loc == "INVTYPE_2HWEAPON" then
    if slots[1] == OFF_HAND then return { blocked = "you use a two-hander" } end
    return { link = main.link, score = score(main.link, main.loc, w, me.level) }
  end
  local held = {}
  for _, slot in ipairs(slots) do
    local item = equipped(slot)
    if not item then return { link = nil } end
    table.insert(held, item)
  end
  local newId = itemId(link)
  local weakest, other
  for _, item in ipairs(held) do
    if itemId(item.link) == newId and isUnique(link) then return { blocked = "it's unique and you wear one" } end
    local s = score(item.link, item.loc, w, me.level)
    local this = { link = item.link, score = s }
    if not weakest or s < weakest.score then
      other, weakest = weakest, this
    else
      other = this
    end
  end
  weakest.other = other
  return weakest
end

local function percentText(new, old)
  local pct = floor((new - old) / old * 100 + 0.5)
  if pct > MAX_SHOWN_PCT then return pct, "+" .. MAX_SHOWN_PCT .. "%+" end
  return pct, (pct > 0 and "+" or "") .. pct .. "%"
end

-- The verdict for an item, as {text, kind, pct, needs, pending}; nil when it isn't gear.
-- kind is "upgrade", "downgrade", "same" or nil (can't use / can't compare);
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
  local text, kind, pct
  local new, notes = score(link, info.equipLoc, w, me.level)
  table.insert(tags, 1, label)
  table.insert(tags, 2, PVE_TAG)
  for _, note in ipairs(notes) do table.insert(tags, note) end
  local old = replaced(info, w, me, link)
  if old.blocked then
    text = GREY .. "Can't compare: " .. old.blocked .. "|r"
  elseif not old.link then
    text, kind, pct = GREEN .. "Upgrade: your slot is empty|r", "upgrade", EMPTY_SLOT_PCT
  elseif old.score <= 0 then
    if new > 0 then
      text, kind, pct = GREEN .. "Upgrade over|r " .. old.link, "upgrade", EMPTY_SLOT_PCT
    else
      text, kind, pct = YELLOW .. "About the same as|r " .. old.link, "same", 0
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
  -- Two rings: the verdict is against the one you'd swap out; this line shows the other too.
  local other = kind and old.link and old.other
  if other and other.score > 0 and new > 0 then
    local otherPct, otherShown = percentText(new, other.score)
    local colour = otherPct >= SIDEGRADE_PCT and GREEN or (otherPct <= -SIDEGRADE_PCT and RED or YELLOW)
    text = text .. "\n" .. colour .. otherShown .. " vs|r " .. other.link .. GREY .. " (your other one)|r"
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
