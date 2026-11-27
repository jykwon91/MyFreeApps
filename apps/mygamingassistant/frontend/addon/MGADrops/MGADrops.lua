-- MGA Drops: what a mob drops and how often, in its tooltip. Mouse over a creature (or your target's
-- portrait) and the tooltip lists its likeliest drops with Classic's drop chances; hold Shift for all of
-- them. A lookup window finds any creature by name.
--
--   /mgadrops          your target's drops in the window, else the window's search
--   /mgadrops <name>   look a creature up by name
--
-- The MGA menu (the minimap button's left-click) has "Mob drops"; the tooltip toggle is in the MGA settings.
-- This file only adds lines to GameTooltip: it touches no other Blizzard frame and never reads the combat log.

local M = MGADrops
local UI = MGAHub.UI

local function canAttack(unit)
  if not unit or not UnitCanAttack then return true end
  local ok, attackable = pcall(UnitCanAttack, "player", unit)
  return ok and M.Open(attackable) == true
end

local function isPlayer(unit)
  if not unit or not UnitIsPlayer then return false end
  local ok, player = pcall(UnitIsPlayer, unit)
  return ok and M.Open(player) == true
end

-- Critters have no loot in Classic: they'd only ever say "no drop data".
local function isCritter(unit)
  if not unit or not UnitCreatureType then return false end
  local ok, kind = pcall(UnitCreatureType, unit)
  return ok and M.Open(kind) == "Critter"
end

local function tooltipUnit(tooltip)
  if not tooltip.GetUnit then return nil end
  local ok, _, unit = pcall(tooltip.GetUnit, tooltip)
  return ok and M.Open(unit) or nil
end

-- Adds the drop lines once per creature shown. A creature you can't attack (a vendor, a guard of your own
-- side) gets nothing, so towns stay quiet.
local function addDrops(tooltip, guid)
  if tooltip ~= GameTooltip or not M.Settings().tooltip then return end
  local unit = tooltipUnit(tooltip)
  if not M.Open(guid) and unit and UnitGUID then guid = UnitGUID(unit) end
  local npc = M.NpcIdFromGUID(guid)
  if not npc or isPlayer(unit) or not canAttack(unit) then return end
  if not M.Mob(npc) and isCritter(unit) then return end
  if tooltip.mgaDropsNpc == npc then return end
  tooltip.mgaDropsNpc = npc
  local full = IsShiftKeyDown and IsShiftKeyDown()
  for _, line in ipairs(M.TooltipLines(npc, M.Faction(), full)) do
    if line[2] then
      tooltip:AddDoubleLine(line[1], line[2], 1, 1, 1, 1, 1, 1)
    else
      tooltip:AddLine(line[1], 1, 0.82, 0)
    end
  end
  if tooltip.Show then tooltip:Show() end
end

-- Never let a drop lookup break the tooltip.
local function safeAdd(tooltip, guid)
  local ok, problem = pcall(addDrops, tooltip, guid)
  if not ok and not M.reported then
    M.reported = true
    M.Say("couldn't add drops to a tooltip (" .. tostring(problem) .. "). Tell MyGamingAssistant.")
  end
end

-- The client may build a unit tooltip through TooltipDataProcessor, OnTooltipSetUnit, or both; the
-- per-creature guard adds the lines once.
if TooltipDataProcessor and Enum and Enum.TooltipDataType and Enum.TooltipDataType.Unit then
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Unit, function(tooltip, data)
    safeAdd(tooltip, data and data.guid)
  end)
end
if not GameTooltip.HasScript or GameTooltip:HasScript("OnTooltipSetUnit") then
  GameTooltip:HookScript("OnTooltipSetUnit", function(self) safeAdd(self, nil) end)
end
GameTooltip:HookScript("OnTooltipCleared", function(self) self.mgaDropsNpc = nil end)

local function setTooltip(on)
  M.Settings().tooltip = on
end

local function buildOptions(section, top)
  local tooltip = UI.Check(section, "MGADropsOptions_tooltip", "Drops in creature tooltips",
    "The likeliest drops with Classic's chances; hold Shift for all of them.", top, -10, setTooltip)
  local note = UI.Label(section, M.HEADER_NOTE .. ". /mgadrops <name> looks any creature up.", "GameFontDisableSmall", tooltip, -18)
  note:SetWidth(520)
  function section.refresh()
    tooltip:SetChecked(M.Settings().tooltip)
  end
  section.refresh()
  return 90
end

MGAHub.Register({
  name = "Drops",
  order = 25,
  menu = {
    { text = "Mob drops", func = function() M.OpenFor(nil) end },
  },
  settings = buildOptions,
})

-- Your target's npc id, when it's a creature.
local function targetNpc()
  if not UnitExists or not UnitExists("target") or isPlayer("target") then return nil end
  return M.NpcIdFromGUID(UnitGUID and UnitGUID("target"))
end

SLASH_MGADROPS1 = "/mgadrops"
SlashCmdList["MGADROPS"] = function(message)
  local text = (message or ""):match("^%s*(.-)%s*$")
  if text ~= "" then return M.OpenSearch(text) end
  M.OpenFor(targetNpc())
end

-- Shift is read when the tooltip is built, so hold it before you mouse over. Never redraw a creature's tooltip
-- from here: RefreshData from addon code rebuilds it tainted, and in combat the game then rejects the secret
-- unit in its own tooltip code (a Lua error on every Shift press over a mob in a fight).
