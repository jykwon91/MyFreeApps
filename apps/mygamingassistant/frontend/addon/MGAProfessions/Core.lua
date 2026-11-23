-- MGA Professions, the logic: what you have, what the route says to do next, what it costs, who trains the
-- next rank and where to gather. No frames here; Window.lua draws and MGAProfessions.lua wires the game.
--
-- Data.lua holds every profession's guide from the site (route steps, ranks, trainers, nodes, beasts).
-- A step is {kind, from, to, name, spell, yellow, grey, mats = {{id, name, count}}, learn, learnSkill,
-- acquire, text, source, note, options, rank, places, confirmed}. A place is {name, map, x, y, where}.

MGAProfessions = MGAProfessions or {}
local M = MGAProfessions
local Data = MGAProfessionsData

M.WRAP = 78
M.STEPS_SHOWN = 4
M.ZONES_SHOWN = 3
M.MOBS_PER_ZONE = 3
M.MIN_ZONE_SPAWNS = 5
M.UNKNOWN_LEVEL_GAP = 99
M.NOTE_UNCONFIRMED = "not confirmed in Forever"
M.NO_PRICES = "Install MGA Prices for costs."
M.LEARN_UNKNOWN = "open your profession window once so MGA can see what you know"

M.TABS = {
  { id = "route", label = "Route" },
  { id = "trainers", label = "Trainers" },
  { id = "where", label = "Where" },
  { id = "notes", label = "Notes" },
}

function M.Settings()
  MGAProfessionsSettings = MGAProfessionsSettings or {}
  local s = MGAProfessionsSettings
  s.skills = s.skills or {}
  s.known = s.known or {}
  s.bank = s.bank or {}
  return s
end

function M.Say(text)
  if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage("|cff33ff99MGA Professions:|r " .. text) end
end

function M.Side() return UnitFactionGroup("player") == "Horde" and "H" or "A" end

function M.Profession(key) return Data.professions[key] end

-- A faction-split text is { A = ..., H = ... }; anything else is the same for both.
function M.SideText(value)
  if type(value) == "table" then return value[M.Side()] end
  return value
end

function M.Wrap(text, width)
  width = width or M.WRAP
  local lines, current = {}, ""
  for word in tostring(text):gmatch("%S+") do
    if current == "" then
      current = word
    elseif #current + 1 + #word <= width then
      current = current .. " " .. word
    else
      table.insert(lines, current)
      current = word
    end
  end
  if current ~= "" then table.insert(lines, current) end
  return lines
end

function M.Money(copper)
  copper = math.floor(copper + 0.5)
  local gold, silver, rest = math.floor(copper / 10000), math.floor(copper / 100) % 100, copper % 100
  local parts = {}
  if gold > 0 then table.insert(parts, gold .. "g") end
  if silver > 0 then table.insert(parts, silver .. "s") end
  if rest > 0 or #parts == 0 then table.insert(parts, rest .. "c") end
  return table.concat(parts, " ")
end

-- Your skills ---------------------------------------------------------------------------------

-- { [skillLine] = { skill, max } } from the game. Tries the modern list first, then the old skills list by name.
function M.GameSkills()
  local found = {}
  if GetProfessions and GetProfessionInfo then
    pcall(function()
      local count = select("#", GetProfessions())
      for i = 1, count do
        local index = select(i, GetProfessions())
        if index then
          local _, _, skill, max, _, _, line = GetProfessionInfo(index)
          if line then found[line] = { skill = skill, max = max } end
        end
      end
    end)
  end
  if next(found) == nil and GetNumSkillLines and GetSkillLineInfo then
    pcall(function()
      for i = 1, GetNumSkillLines() do
        local name, header, _, rank, _, _, maxRank = GetSkillLineInfo(i)
        if not header then
          for _, p in pairs(Data.professions) do
            if p.label == name then found[p.skillLine] = { skill = rank, max = maxRank } end
          end
        end
      end
    end)
  end
  return found
end

-- The skill to plan from: the game's, else the one typed in the window, else 1. Second value: where it came from.
function M.Skill(key)
  local p = Data.professions[key]
  local game = p and M.GameSkills()[p.skillLine]
  if game and game.skill then return game.skill, "game", game.max end
  local typed = M.Settings().skills[key]
  if typed then return typed, "typed" end
  return 1, "none"
end

function M.SetSkill(key, skill)
  M.Settings().skills[key] = skill
end

-- Your professions first (in the guide's order), then the rest.
function M.ProfessionOrder()
  local mine, others = {}, {}
  local game = M.GameSkills()
  for _, key in ipairs(Data.order) do
    if game[Data.professions[key].skillLine] then table.insert(mine, key) else table.insert(others, key) end
  end
  for _, key in ipairs(others) do table.insert(mine, key) end
  return mine, #mine - #others
end

function M.DefaultKey()
  local order, ownCount = M.ProfessionOrder()
  return ownCount > 0 and order[1] or Data.order[1]
end

function M.KeyForSkillLine(line)
  for key, p in pairs(Data.professions) do
    if p.skillLine == line then return key end
  end
end

-- What the route needs -------------------------------------------------------------------------

-- Crafts it takes to get from `skill` to the end of the row: one per point while the row is orange,
-- then 1 / chance per point as the chance of a skill-up falls from yellow to grey.
function M.CraftsNeeded(skill, step)
  local sum = 0
  for s = math.max(skill, step.from), step.to - 1 do
    if s < step.yellow or step.grey <= step.yellow then
      sum = sum + 1
    else
      local chance = math.max((step.grey - s) / (step.grey - step.yellow), 0.05)
      sum = sum + 1 / chance
    end
  end
  return math.ceil(sum - 1e-9)
end

-- The rows still ahead of `skill`, in the guide's order.
function M.Upcoming(key, skill)
  local rows = {}
  for _, step in ipairs(Data.professions[key].steps) do
    if step.to > skill then table.insert(rows, step) end
  end
  return rows
end

local function itemCount(id, withBank)
  local count = C_Item and C_Item.GetItemCount or GetItemCount
  return count and count(id, withBank) or 0
end

-- Bags, plus whatever the bank held when you last opened it.
function M.Have(id)
  return itemCount(id, false) + (M.Settings().bank[id] or 0)
end

function M.AllMatIds(key)
  local ids, seen = {}, {}
  local function add(mats)
    for _, mat in ipairs(mats or {}) do
      if not seen[mat.id] then seen[mat.id] = true; table.insert(ids, mat.id) end
    end
  end
  for _, step in ipairs(Data.professions[key].steps) do
    add(step.mats)
    for _, option in ipairs(step.options or {}) do add(option.mats) end
  end
  return ids
end

-- Saves what the bank holds of every material in the guides; call with the bank open.
function M.SaveBank()
  local bank = M.Settings().bank
  for _, key in ipairs(Data.order) do
    for _, id in ipairs(M.AllMatIds(key)) do
      local held = itemCount(id, true) - itemCount(id, false)
      bank[id] = held > 0 and held or nil
    end
  end
end

function M.HasBankCounts() return next(M.Settings().bank) ~= nil end

-- { {id, name, per, need, have} } for `crafts` crafts of a row's recipe.
function M.Mats(mats, crafts)
  local out = {}
  for _, mat in ipairs(mats or {}) do
    if mat.count then
      table.insert(out, { id = mat.id, name = mat.name, per = mat.count, need = mat.count * crafts, have = M.Have(mat.id) })
    else
      table.insert(out, { id = mat.id, name = mat.name, have = M.Have(mat.id) })
    end
  end
  return out
end

-- Prices ----------------------------------------------------------------------------------------

function M.PricesLoaded()
  return MGAPricesData ~= nil and MGAPricesData.houses ~= nil
end

function M.PriceOf(id)
  local house = M.Side() == "H" and "horde" or "alliance"
  local data = MGAPricesData and MGAPricesData.houses and MGAPricesData.houses[house]
  local row = data and data.items and data.items[id]
  return row and row[1] or nil
end

-- Copper for the mats, or nil when the prices addon is missing; second value = how many mats have no price.
function M.Cost(mats)
  if not M.PricesLoaded() then return nil end
  local total, unpriced = 0, 0
  for _, mat in ipairs(mats) do
    local price = mat.need and M.PriceOf(mat.id)
    if price then total = total + price * mat.need elseif mat.need then unpriced = unpriced + 1 end
  end
  return total, unpriced
end

-- Recipes ----------------------------------------------------------------------------------------

-- true / false, or nil when the game hasn't told us.
function M.Knows(spell)
  if not spell then return nil end
  if M.Settings().known[spell] then return true end
  local check = (C_SpellBook and C_SpellBook.IsSpellKnown) or IsPlayerSpell or IsSpellKnown
  if check then
    local ok, known = pcall(check, spell)
    if ok and known then return true end
  end
  return nil
end

-- Records every recipe the open trade-skill window lists as learned.
function M.ScanKnown()
  if not (C_TradeSkillUI and C_TradeSkillUI.GetAllRecipeIDs and C_TradeSkillUI.GetRecipeInfo) then return 0 end
  local known, added = M.Settings().known, 0
  local ok, ids = pcall(C_TradeSkillUI.GetAllRecipeIDs)
  if not (ok and type(ids) == "table") then return 0 end
  for _, id in ipairs(ids) do
    local good, info = pcall(C_TradeSkillUI.GetRecipeInfo, id)
    if good and type(info) == "table" and info.learned and not known[id] then known[id] = true; added = added + 1 end
  end
  return added
end

-- Ranks and trainers ------------------------------------------------------------------------------

-- The first rank above your cap (or above your skill when the game gives no cap); nil at the top.
function M.NextRank(key, skill, cap)
  for _, rank in ipairs(Data.professions[key].ranks) do
    if cap and rank.cap > cap then return rank end
    if not cap and rank.skill > skill then return rank end
  end
end

-- Gathering -----------------------------------------------------------------------------------------

local function hostile(side)
  return side ~= nil and side ~= "C" and side ~= M.Side()
end

local function levelGap(levels, level)
  if not levels then return M.UNKNOWN_LEVEL_GAP end
  return math.max(0, levels[1] - level, level - levels[2])
end

-- Nodes worth picking at this skill: common ones still orange or yellow; else the rare ones; else the best you can pick.
function M.TargetNodes(prof, skill)
  local common, rare, gatherable = {}, {}, {}
  for _, node in ipairs(prof.nodes) do
    if skill >= node.orange and skill < node.grey then
      table.insert(gatherable, node)
      if not node.rare and skill < node.green then table.insert(common, node) end
      if node.rare then table.insert(rare, node) end
    end
  end
  if #common > 0 then return common end
  if #rare > 0 then return rare end
  local best
  for _, node in ipairs(gatherable) do
    if not best or node.orange > best.orange then best = node end
  end
  return best and { best } or {}
end

-- Zones to pick them in: not enemy ground, zones above your level last, then the nearest level, then the most spawns.
function M.NodeZones(prof, skill, level)
  local byMap, list = {}, {}
  for _, node in ipairs(M.TargetNodes(prof, math.max(skill, 1))) do
    for _, zone in ipairs(node.zones) do
      if not hostile(zone.side) then
        local entry = byMap[zone.map]
        if not entry then
          entry = { map = zone.map, name = zone.name, levels = zone.levels, count = 0, nodes = {}, best = 0 }
          byMap[zone.map] = entry
          table.insert(list, entry)
        end
        entry.count = entry.count + zone.count
        table.insert(entry.nodes, node.name)
        if zone.count > entry.best then entry.best, entry.x, entry.y, entry.subzone = zone.count, zone.x, zone.y, zone.subzone end
      end
    end
  end
  table.sort(list, function(a, b)
    local aAbove = a.levels ~= nil and a.levels[1] > level
    local bAbove = b.levels ~= nil and b.levels[1] > level
    if aAbove ~= bAbove then return not aAbove end
    local ag, bg = levelGap(a.levels, level), levelGap(b.levels, level)
    if ag ~= bg then return ag < bg end
    return a.count > b.count
  end)
  local shown = {}
  for i = 1, math.min(M.ZONES_SHOWN, #list) do shown[i] = list[i] end
  return shown
end

-- The highest beast level your skill can skin.
function M.MaxSkinnable(skill)
  if skill <= 100 then return math.floor(skill / 10) + 10 end
  return math.floor(skill / 5)
end

-- Beast levels worth skinning now: the five below your cap, the cap being 2 above your level at most.
function M.SkinBand(skill, level)
  local top = math.min(M.MaxSkinnable(skill), level + 2)
  return math.max(1, top - 5), top
end

function M.SkinZones(prof, skill, level)
  local low, high = M.SkinBand(skill, level)
  local byMap, list = {}, {}
  for _, mob in ipairs(prof.mobs) do
    if mob.minLevel >= low and mob.maxLevel <= high and not hostile(mob.side) then
      local entry = byMap[mob.map]
      if not entry then
        entry = { map = mob.map, name = mob.zone, levels = mob.levels, count = 0, mobs = {} }
        byMap[mob.map] = entry
        table.insert(list, entry)
      end
      entry.count = entry.count + mob.spawns
      table.insert(entry.mobs, mob)
    end
  end
  local kept = {}
  for _, entry in ipairs(list) do
    if entry.count >= M.MIN_ZONE_SPAWNS then
      table.sort(entry.mobs, function(a, b) return a.spawns > b.spawns end)
      table.insert(kept, entry)
    end
  end
  table.sort(kept, function(a, b)
    local ag, bg = levelGap(a.levels, level), levelGap(b.levels, level)
    if ag ~= bg then return ag < bg end
    return a.count > b.count
  end)
  local shown = {}
  for i = 1, math.min(M.ZONES_SHOWN, #kept) do shown[i] = kept[i] end
  return shown, low, high
end

-- Pins ----------------------------------------------------------------------------------------------

function M.PlaceText(place)
  return string.format("%s, %s (%.1f, %.1f)", place.name, place.where or "", place.x, place.y)
end

-- Points MGA Waypoints at a place when it is loaded; otherwise says the zone and coordinates.
function M.Pin(place)
  if MGAWaypoints and MGAWaypoints.SetTarget then
    MGAWaypoints.SetTarget({ name = place.name, kind = place.kind or "prof", map = place.map, x = place.x, y = place.y, zone = place.where or "" })
    M.Say("Guiding you to " .. place.name .. ". Right-click the arrow to clear it.")
    return true
  end
  M.Say(M.PlaceText(place) .. ". Install MGA Waypoints for an arrow.")
  return false
end

-- Lines ------------------------------------------------------------------------------------------------
-- The window shows a list of { text, place?, head? }; a row with a place pins it when clicked.

local function add(lines, text, extra)
  for i, part in ipairs(M.Wrap(text)) do
    local line = { text = part }
    if extra then for k, v in pairs(extra) do line[k] = v end end
    if i > 1 then line.head = nil end
    table.insert(lines, line)
  end
end

local function placeLines(lines, places, indent)
  for _, place in ipairs(places or {}) do
    table.insert(lines, { text = indent .. M.PlaceText(place), place = place })
  end
end

local function matLines(lines, mats, indent)
  for _, mat in ipairs(mats) do
    if mat.need then
      local mark = mat.have >= mat.need and "|cff55ff55" or "|cffff6666"
      table.insert(lines, { text = string.format("%s%s x %d  %s(have %d)|r", indent, mat.name, mat.need, mark, mat.have) })
    else
      table.insert(lines, { text = string.format("%s%s  (have %d)", indent, mat.name, mat.have) })
    end
  end
end

local function costLine(lines, mats, indent)
  local total, unpriced = M.Cost(mats)
  if not total then return end
  local text = indent .. "Mats cost about " .. M.Money(total)
  if unpriced > 0 then text = text .. " (" .. unpriced .. " with no auction price)" end
  table.insert(lines, { text = text })
end

local function learnLine(lines, step)
  local state
  local known = M.Knows(step.spell)
  if step.acquire then state = "Find the recipe first" elseif known then state = "Learned" elseif step.spell then state = "Not learned yet (" .. M.LEARN_UNKNOWN .. ")" end
  local text = "  Learn: " .. (step.learn or "")
  if state and state ~= "Learned" then text = text .. ". " .. state elseif state then text = text .. ". Learned." end
  add(lines, text)
end

local function craftLines(lines, step, skill)
  local crafts = M.CraftsNeeded(skill, step)
  add(lines, string.format("Craft %d x %s (skill %d-%d)", crafts, step.name, math.max(skill, step.from), step.to), { head = true })
  learnLine(lines, step)
  local mats = M.Mats(step.mats, crafts)
  matLines(lines, mats, "  ")
  costLine(lines, mats, "  ")
  if step.note then add(lines, "  " .. step.note) end
end

local function optionsLines(lines, step, skill)
  add(lines, string.format("%s (skill %d-%d)", step.name, math.max(skill, step.from), step.to), { head = true })
  if step.text then add(lines, "  " .. M.SideText(step.text)) end
  for _, option in ipairs(step.options) do
    add(lines, string.format("  - %s (yellow %d, grey %d)", option.name, option.yellow, option.grey))
    local mats = M.Mats(option.mats, 1)
    matLines(lines, mats, "      ")
  end
end

local function textLines(lines, step, skill)
  add(lines, string.format("%s (skill %d-%d)", step.name, math.max(skill, step.from), step.to), { head = true })
  if step.text then add(lines, "  " .. M.SideText(step.text)) end
  if step.source then add(lines, "  " .. step.source) end
end

local function milestoneLines(lines, step)
  add(lines, string.format("%s (at skill %d)", step.name, step.from), { head = true })
  if step.text then add(lines, "  " .. M.SideText(step.text)) end
  if step.places then placeLines(lines, step.places[M.Side()], "  ") end
end

local STEP_LINES = { craft = craftLines, options = optionsLines, text = textLines }

function M.RouteLines(key, full)
  local prof = Data.professions[key]
  local skill, from, cap = M.Skill(key)
  local lines = {}
  local source = from == "game" and "from the game" or (from == "typed" and "typed in" or "unknown: type your skill below")
  add(lines, string.format("%s: skill %d (%s)", prof.label, skill, source), { head = true })
  if not M.PricesLoaded() then add(lines, M.NO_PRICES) end
  if M.HasBankCounts() then add(lines, "Bank counts are as of your last bank visit.") end
  if cap and skill >= cap then
    local rank = M.NextRank(key, skill, cap)
    add(lines, "You are at your rank cap (" .. cap .. ")." .. (rank and (" Train " .. rank.name .. " next: see Trainers.") or ""), { head = true })
  end
  if full then add(lines, prof.intro) end
  local rows = M.Upcoming(key, skill)
  local shown = full and #rows or math.min(M.STEPS_SHOWN, #rows)
  if #rows == 0 then add(lines, "Nothing left on the route: you are past its last row.") end
  for i = 1, shown do
    local step = rows[i]
    if step.kind == "milestone" then milestoneLines(lines, step) else (STEP_LINES[step.kind] or textLines)(lines, step, skill) end
  end
  if shown < #rows then add(lines, (#rows - shown) .. " more rows. Tick \"Full route\" to see them.") end
  return lines
end

function M.TrainerLines(key)
  local prof = Data.professions[key]
  local skill, _, cap = M.Skill(key)
  local next = M.NextRank(key, skill, cap)
  local lines = {}
  add(lines, "Skills, levels and trainers are Classic data and may differ in Forever.")
  for _, rank in ipairs(prof.ranks) do
    local title = string.format("%s: skill %d%s, cap %d", rank.name, rank.skill, rank.level and (", level " .. rank.level) or "", rank.cap)
    if next and next.name == rank.name then title = title .. "  <- next" end
    add(lines, title, { head = true })
    if rank.how then add(lines, "  " .. M.SideText(rank.how)) end
    if rank.headsUp then add(lines, "  " .. rank.headsUp) end
    placeLines(lines, rank.trainers and rank.trainers[M.Side()], "  ")
  end
  return lines
end

function M.WhereLines(key)
  local prof = Data.professions[key]
  local skill, _ = M.Skill(key)
  local level = UnitLevel("player") or 1
  local lines = {}
  if #prof.nodes > 0 then
    local names = {}
    for _, node in ipairs(M.TargetNodes(prof, math.max(skill, 1))) do table.insert(names, node.name) end
    add(lines, "Best now at skill " .. skill .. ": " .. (#names > 0 and table.concat(names, ", ") or "nothing you can pick yet"), { head = true })
    for _, zone in ipairs(M.NodeZones(prof, skill, level)) do
      local range = zone.levels and (" (levels " .. zone.levels[1] .. "-" .. zone.levels[2] .. ")") or ""
      add(lines, string.format("%s%s: %s", zone.name, range, table.concat(zone.nodes, ", ")), { head = true })
      table.insert(lines, { text = string.format("  Thickest around %s (%.1f, %.1f)", zone.subzone ~= "" and zone.subzone or zone.name, zone.x, zone.y),
        place = { name = zone.nodes[1], kind = "place", map = zone.map, x = zone.x, y = zone.y, where = zone.name } })
    end
  elseif #prof.mobs > 0 then
    local zones, low, high = M.SkinZones(prof, skill, level)
    add(lines, string.format("Beasts level %d-%d at skill %d, your level %d", low, high, skill, level), { head = true })
    if #zones == 0 then add(lines, "No zone has enough of them off enemy ground.") end
    for _, zone in ipairs(zones) do
      add(lines, zone.name .. " (" .. zone.count .. " spawns)", { head = true })
      for i = 1, math.min(M.MOBS_PER_ZONE, #zone.mobs) do
        local mob = zone.mobs[i]
        table.insert(lines, { text = string.format("  %s, level %d-%d, skins %s (%.1f, %.1f)", mob.name, mob.minLevel, mob.maxLevel, mob.leather, mob.x, mob.y),
          place = { name = mob.name, kind = "place", map = mob.map, x = mob.x, y = mob.y, where = mob.zone } })
      end
    end
  else
    add(lines, prof.label .. " has nothing to gather. See Route.")
  end
  return lines
end

function M.NotesLines(key)
  local prof = Data.professions[key]
  local lines = {}
  for _, note in ipairs(prof.notes) do
    add(lines, "- " .. note.text .. (note.confirmed and "" or " (" .. M.NOTE_UNCONFIRMED .. ")"))
  end
  if #lines == 0 then add(lines, "No notes for " .. prof.label .. ".") end
  return lines
end

function M.HasWhere(key)
  local prof = Data.professions[key]
  return #prof.nodes > 0 or #prof.mobs > 0
end

function M.Lines(key, tab, full)
  if tab == "trainers" then return M.TrainerLines(key) end
  if tab == "where" then return M.WhereLines(key) end
  if tab == "notes" then return M.NotesLines(key) end
  return M.RouteLines(key, full)
end
