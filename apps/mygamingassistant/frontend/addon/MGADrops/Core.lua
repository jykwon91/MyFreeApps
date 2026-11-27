-- MGA Drops, the logic: what a creature drops and how often, as tooltip lines and window lines. No frames
-- here; MGADrops.lua hooks the tooltip and Window.lua draws the lookup window.
--
-- Data.lua (generated, never hand-edit) holds each Classic creature's drops with Classic's chances, worked
-- out the way the server rolls its loot table. WoW Forever may differ, and every list says so. A creature
-- Classic doesn't have (Forever's own) has no list: "no drop data".

MGADrops = MGADrops or {}
local M = MGADrops
local Data = MGADropsData

M.DEFAULTS = { tooltip = true }
-- Tooltip rows before "hold Shift"; the window shows the whole list.
M.TOOLTIP_ROWS = 6
M.SEARCH_LIMIT = 60
M.HEADER = "Drops"
M.HEADER_NOTE = "Classic drop rates (Forever may differ)"
M.NO_DATA = "no drop data"
M.WORLD = "Random world drops"
M.ICON_SIZE = 14

local MUTED = "|cff9d9d9d"
local NOTE_COLOR = "|cffffd100"
-- Item quality colours, for clients without ITEM_QUALITY_COLORS.
local QUALITY_HEX = {
  [0] = "ff9d9d9d", [1] = "ffffffff", [2] = "ff1eff00", [3] = "ff0070dd", [4] = "ffa335ee", [5] = "ffff8000",
}

local function say(text)
  DEFAULT_CHAT_FRAME:AddMessage("|cff33aaffMGA Drops:|r " .. text)
end
M.Say = say

function M.Settings()
  MGADropsSettings = MGADropsSettings or {}
  for key, value in pairs(M.DEFAULTS) do
    if MGADropsSettings[key] == nil then MGADropsSettings[key] = value end
  end
  return MGADropsSettings
end

-- A value the client hides from addons ("secret") reads as nil, so nothing below ever compares one.
local function open(value)
  if value == nil then return nil end
  if issecretvalue and issecretvalue(value) then return nil end
  return value
end
M.Open = open

-- "Creature-0-<server>-<instance>-<zone>-<npc id>-<spawn>" (and Vehicle-) -> npc id; nil for players, pets, objects.
function M.NpcIdFromGUID(guid)
  guid = open(guid)
  if type(guid) ~= "string" then return nil end
  local kind, id = guid:match("^(%a+)%-%d+%-%d+%-%d+%-%d+%-(%d+)%-")
  if kind ~= "Creature" and kind ~= "Vehicle" then return nil end
  return tonumber(id)
end

-- { npc, name, minLevel, maxLevel, list } or nil when Classic has no drops for it.
function M.Mob(npc)
  local row = npc and Data.npcs[npc]
  if not row then return nil end
  return { npc = npc, name = row[1], minLevel = row[2], maxLevel = row[3], list = Data.lists[row[4]] }
end

function M.Faction()
  local faction = UnitFactionGroup and UnitFactionGroup("player")
  return open(faction) == "Horde" and "Horde" or "Alliance"
end

-- The mob's drops for your faction, likeliest first: { item, percent, note }. A drop only the other faction
-- gets is left out.
function M.Drops(mob, faction)
  local horde = faction == "Horde"
  local drops = {}
  for _, row in ipairs(mob.list) do
    local chance = row[2]
    if horde and row[4] ~= nil then chance = row[4] end
    if chance > 0 then table.insert(drops, { item = row[1], percent = chance, note = row[3] }) end
  end
  table.sort(drops, function(a, b)
    if a.percent ~= b.percent then return a.percent > b.percent end
    return a.item < b.item
  end)
  return drops
end

function M.World(mob)
  return mob.list.w or 0
end

-- 25 -> "25%", 2.5 -> "2.5%", 0.74 -> "0.74%".
function M.Percent(value)
  if value == math.floor(value) then return string.format("%d%%", value) end
  if value >= 1 then return string.format("%.1f%%", value) end
  return (string.format("%.2f", value):gsub("0$", "")) .. "%"
end

function M.ItemName(item)
  local row = Data.items[item]
  return row and row[1] or ("Item " .. item)
end

function M.Quality(item)
  local row = Data.items[item]
  return row and row[2] or 1
end

local function qualityHex(quality)
  local colors = ITEM_QUALITY_COLORS and ITEM_QUALITY_COLORS[quality]
  local hex = colors and colors.hex
  if type(hex) == "string" then return hex end
  return "|c" .. (QUALITY_HEX[quality] or QUALITY_HEX[1])
end

-- The client's icon for an item, without asking the server (works for items you've never seen).
local function icon(item)
  local get = (C_Item and C_Item.GetItemIconByID) or GetItemIcon
  if not get then return nil end
  local ok, texture = pcall(get, item)
  return ok and open(texture) or nil
end

-- "|T<icon>|t Linen Cloth" in the item's quality colour.
function M.ItemText(item)
  local texture = icon(item)
  local prefix = texture and ("|T" .. texture .. ":" .. M.ICON_SIZE .. ":" .. M.ICON_SIZE .. "|t ") or ""
  return prefix .. qualityHex(M.Quality(item)) .. M.ItemName(item) .. "|r"
end

-- "25%", "60% quest", "0.1% Blacksmithing".
function M.ChanceText(drop)
  local text = M.Percent(drop.percent)
  if drop.note then text = text .. " " .. NOTE_COLOR .. drop.note .. "|r" end
  return text
end

-- What the tooltip adds for a creature: { left, right } rows, the header first. nil = add nothing.
-- `full` (Shift held) lists every drop instead of the top TOOLTIP_ROWS.
function M.TooltipLines(npc, faction, full)
  local mob = M.Mob(npc)
  if not mob then return { { M.HEADER .. ": " .. MUTED .. M.NO_DATA .. "|r" } } end
  local drops = M.Drops(mob, faction)
  local lines = { { M.HEADER .. " " .. MUTED .. M.HEADER_NOTE .. "|r" } }
  local shown = full and #drops or math.min(#drops, M.TOOLTIP_ROWS)
  for i = 1, shown do
    table.insert(lines, { "  " .. M.ItemText(drops[i].item), M.ChanceText(drops[i]) })
  end
  if #drops > shown then
    table.insert(lines, { "  " .. MUTED .. "+" .. (#drops - shown) .. " more: hold Shift|r" })
  end
  local world = M.World(mob)
  if world > 0 then table.insert(lines, { "  " .. MUTED .. M.WORLD .. "|r", MUTED .. M.Percent(world) .. "|r" }) end
  return lines
end

-- "Kobold Vermin (1-2)".
function M.MobLabel(mob)
  local levels = mob.minLevel == mob.maxLevel and tostring(mob.minLevel) or (mob.minLevel .. "-" .. mob.maxLevel)
  return mob.name .. " (" .. levels .. ")"
end

-- Creatures whose name contains `text` (any case): exact names first, then by name and level. At most SEARCH_LIMIT.
function M.Search(text)
  local query = (text or ""):lower():gsub("^%s+", ""):gsub("%s+$", "")
  if query == "" then return {} end
  local found = {}
  for npc, row in pairs(Data.npcs) do
    local name = row[1]:lower()
    if name:find(query, 1, true) then
      table.insert(found, { npc = npc, exact = name == query, name = row[1], level = row[2] })
    end
  end
  table.sort(found, function(a, b)
    if a.exact ~= b.exact then return a.exact end
    if a.name ~= b.name then return a.name < b.name end
    if a.level ~= b.level then return a.level < b.level end
    return a.npc < b.npc
  end)
  local mobs = {}
  for i = 1, math.min(#found, M.SEARCH_LIMIT) do table.insert(mobs, M.Mob(found[i].npc)) end
  return mobs, #found
end

-- The window's lines for one creature: every drop for your faction, then the world-drop line.
-- { kind = "drop" | "world" | "note", text, chance }.
function M.WindowLines(mob, faction)
  local lines = {}
  for _, drop in ipairs(M.Drops(mob, faction)) do
    table.insert(lines, { kind = "drop", text = M.ItemText(drop.item), chance = M.ChanceText(drop), item = drop.item })
  end
  local world = M.World(mob)
  if world > 0 then table.insert(lines, { kind = "world", text = MUTED .. M.WORLD .. "|r", chance = M.Percent(world) }) end
  if #lines == 0 then table.insert(lines, { kind = "note", text = MUTED .. M.NO_DATA .. "|r", chance = "" }) end
  return lines
end
