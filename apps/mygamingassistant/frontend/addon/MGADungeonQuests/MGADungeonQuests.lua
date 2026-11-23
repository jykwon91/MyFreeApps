-- MGA Dungeon Quests: a dungeon journal. Every dungeon on a grid; open one for its bosses, what they
-- drop, and every quest to pick up for it, in order, with who gives each and where, ticked with the
-- quests the game says you've done (or have in your log). The data comes from Data.lua
-- (MyGamingAssistant's dungeon pages). Every client API is feature-checked: Forever's are undocumented.

MGADungeonQuests = {}
local M = MGADungeonQuests

local PREFIX = "|cff66bbffMGA Dungeon Quests|r: "
local ICON_DONE = "|TInterface\\RaidFrame\\ReadyCheck-Ready:14|t"
local ICON_LOG = "|TInterface\\RaidFrame\\ReadyCheck-Waiting:14|t"
local ICON_TODO = "|TInterface\\Buttons\\UI-CheckBox-Up:14|t"
-- Ink for the journal's parchment page.
local GREY, WHITE, SOFT, GOLD, GREEN, RED, BLUE = "|cff5f4b36", "|cff2a1708", "|cff46331f", "|cff7a4300", "|cff1d6b1d", "|cffa01414", "|cff1d4a8c"
local FRAME_WIDTH, FRAME_HEIGHT, TEXT_WIDTH = 800, 496, 316

local function say(text)
  if DEFAULT_CHAT_FRAME then DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. text) else print(PREFIX .. text) end
end

-- The game's record of the quests you've turned in.
function M.QuestDone(id)
  if C_QuestLog and C_QuestLog.IsQuestFlaggedCompleted then return C_QuestLog.IsQuestFlaggedCompleted(id) and true or false end
  if IsQuestFlaggedCompleted then return IsQuestFlaggedCompleted(id) and true or false end
  return false
end

-- One quest asked by id, so a quest under a collapsed header in your log still counts; nil when the
-- client can't answer by id (the log scan below then decides).
local function askInLog(id)
  local onQuest
  if C_QuestLog and C_QuestLog.IsOnQuest then
    onQuest = C_QuestLog.IsOnQuest(id) and true or false
  elseif GetQuestLogIndexByID then
    onQuest = (GetQuestLogIndexByID(id) or 0) > 0
  else
    return nil
  end
  if not onQuest then return false end
  local complete = C_QuestLog and C_QuestLog.IsComplete and C_QuestLog.IsComplete(id)
  if complete == nil and IsQuestComplete then complete = IsQuestComplete(id) end
  return complete and "complete" or true
end

-- The quests listed in your quest log (a collapsed header hides its own): { {id, title, complete} }.
local function scanLog()
  local out = {}
  local numEntries = (C_QuestLog and C_QuestLog.GetNumQuestLogEntries) or GetNumQuestLogEntries
  local count = numEntries and numEntries() or 0
  for i = 1, count do
    local id, title, complete
    if C_QuestLog and C_QuestLog.GetInfo then
      local info = C_QuestLog.GetInfo(i)
      if info and not info.isHeader then
        id, title = info.questID, info.title
        complete = C_QuestLog.IsComplete and C_QuestLog.IsComplete(id)
      end
    elseif GetQuestLogTitle then
      local name, _, _, isHeader, _, isComplete, _, questId = GetQuestLogTitle(i)
      if not isHeader then id, title, complete = questId, name, isComplete == 1 end
    end
    if id and id > 0 then out[#out + 1] = { id = id, title = title or ("Quest " .. id), complete = complete and true or false } end
  end
  return out
end

-- The quests in your quest log: id -> "complete" (ready to turn in), true, or false (not in it).
function M.QuestsInLog()
  local scanned = {}
  for _, q in ipairs(scanLog()) do scanned[q.id] = q.complete and "complete" or true end
  return setmetatable({}, { __index = function(t, id)
    local state = askInLog(id)
    if state == nil then state = scanned[id] or false end
    rawset(t, id, state)
    return state
  end })
end

local function playerFaction()
  local group = UnitFactionGroup and UnitFactionGroup("player")
  return group and group:lower() or nil
end

local function playerClass()
  local _, class = UnitClass("player")
  return class and class:lower() or nil
end

local function forYourClass(line, class)
  if not line.classes then return true end
  for _, c in ipairs(line.classes) do
    if c == class then return true end
  end
  return false
end

-- Your skill in each profession you have, by its enUS name, or nil when that can't be read in full
-- -- no skill API, a non-English client (the quest data names professions in English), or nothing
-- listed yet -- which then hides no profession quest. The hub reads them (Forever has no
-- GetSkillLineInfo).
local function playerSkills()
  if not (MGAHub and MGAHub.GetProfessionSkills) then return nil end
  local locale = GetLocale and GetLocale() or "enUS"
  if locale ~= "enUS" and locale ~= "enGB" then return nil end
  local list = MGAHub.GetProfessionSkills()
  if not list then return nil end
  local out, rows = {}, 0
  for _, s in ipairs(list) do
    if s.name then
      out[s.name] = s.skill or 0
      rows = rows + 1
    end
  end
  return rows > 0 and out or nil
end

-- A line that needs a profession you don't have never comes: its giver won't offer it.
local function forYourProfessions(line, skills)
  return not line.skill or not skills or skills[line.skill.name] ~= nil
end

-- "Needs Leatherworking 225 (you have 200)" when your skill is still too low, else nil.
function M.SkillNote(line, skills)
  if not line.skill or not skills then return nil end
  local rank = skills[line.skill.name]
  if not rank or rank >= line.skill.level then return nil end
  return "Needs " .. line.skill.name .. " " .. line.skill.level .. " (you have " .. rank .. ")"
end

-- Your faction's quest lines for a dungeon that your class and professions get.
function M.LinesFor(dungeon)
  local out, class, skills = {}, playerClass(), playerSkills()
  for _, line in ipairs(dungeon[playerFaction() or ""] or {}) do
    if forYourClass(line, class) and forYourProfessions(line, skills) then out[#out + 1] = line end
  end
  return out
end

-- Each step done: done in the game, or implied by a later step done or in your log (you can't have
-- step 3 without 1 and 2; the dungeon quests at the end of a line stand side by side, so one doesn't
-- imply another).
function M.DoneSteps(line, inLog)
  local before = #line.steps - #line.titles
  local done = {}
  for i, step in ipairs(line.steps) do
    local turnedIn = M.QuestDone(step.id)
    if turnedIn then done[i] = true end
    if turnedIn or inLog[step.id] then
      for j = 1, math.min(i - 1, before) do done[j] = true end
    end
  end
  return done
end

-- How many steps of a dungeon's lines you still have to pick up (not done, not in your log).
function M.ToPickUp(dungeon, inLog)
  local left = 0
  for _, line in ipairs(M.LinesFor(dungeon)) do
    local done = M.DoneSteps(line, inLog)
    for i, step in ipairs(line.steps) do
      if not done[i] and not inLog[step.id] then left = left + 1 end
    end
  end
  return left
end

local function levels(d)
  return d.levelMin == d.levelMax and ("level " .. d.levelMin) or ("levels " .. d.levelMin .. "-" .. d.levelMax)
end

local function giverText(step)
  if not step.giver then return nil end
  local from = step.item and ("from the item " .. step.giver) or ("from " .. step.giver)
  return step.where and (from .. ", " .. step.where) or from
end

local function stepLines(step, state, level, isNext)
  local out = {}
  local tag = step.dungeon and (BLUE .. "  (done in the dungeon)|r") or ""
  if state == "done" then
    out[1] = ICON_DONE .. " " .. GREY .. step.title .. "|r" .. tag
    return out
  end
  local icon = state and ICON_LOG or ICON_TODO
  local colour = isNext and WHITE or SOFT
  local note = ""
  if state == "complete" then note = GREEN .. "  ready to turn in|r"
  elseif state then note = GOLD .. "  in your quest log|r"
  elseif (step.minLevel or 0) > level then note = RED .. "  needs level " .. step.minLevel .. "|r" end
  -- A quest of a dungeon Forever added has no level until the game has shown it to us.
  local lvl = step.level and (" " .. GREY .. "(" .. step.level .. ")|r") or ""
  out[1] = icon .. " " .. colour .. step.title .. "|r" .. lvl .. tag .. note
  local from = not state and giverText(step)
  if from then out[2] = "      " .. GREY .. from .. "|r" end
  return out
end

-- What to do next for a step: get it (from whom, where, at what level), finish it (its objectives), or
-- turn it in (to whom). state = nil (not picked up), true (in your log) or "complete".
function M.NextText(step, state, level)
  local title = '"' .. step.title .. '"'
  local turnIn = step.turnIn and (" to " .. step.turnIn) or ""
  if state == "complete" then return "Turn in " .. title .. turnIn .. "." end
  if state then
    local todo = step.objectives and (": " .. table.concat(step.objectives, ", ")) or " (its goals are in your quest log)"
    local inside = step.dungeon and " in the dungeon" or ""
    return "Finish " .. title .. inside .. todo .. ". Then turn it in" .. turnIn .. "."
  end
  local when = (step.minLevel or 0) > level and ("At level " .. step.minLevel .. ", get ") or "Get "
  if not step.giver then return when .. title .. ". Who gives it isn't in our data." end
  return when .. title .. " " .. giverText(step) .. "."
end

-- A step's giver can be pinned on the World Map: we know where, and the client has user waypoints.
function M.CanPin(step)
  return step.map ~= nil and C_Map ~= nil and C_Map.SetUserWaypoint ~= nil
    and UiMapPoint ~= nil and UiMapPoint.CreateFromCoordinates ~= nil
end

-- Puts a World Map pin (and the on-screen arrow, where the client has one) on a step's giver.
function M.Pin(step)
  if not M.CanPin(step) or (C_Map.CanSetUserWaypointOnMap and not C_Map.CanSetUserWaypointOnMap(step.map)) then
    say("the map can't take a pin there. " .. step.giver .. " is at " .. step.where .. ".")
    return
  end
  C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(step.map, step.x / 100, step.y / 100))
  if C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then C_SuperTrack.SetSuperTrackedUserWaypoint(true) end
  say("map pin on " .. step.giver .. ", " .. step.where .. ". Open your map (M) to see it.")
end

-- Routes --------------------------------------------------------------------------------------
-- The quickest way from where you stand to a spot: on foot, by flight path, boat, zeppelin or tram.
-- The same travel-time search as the World Map's directions, in straight lines: the addon has no walk graph.

local RUN_SPEED, FLY_SPEED, WALK_DETOUR, FLIGHT_WAIT, TRACK_SECONDS = 7, 20, 1.5, 30, 1
local RIDE_WAIT = { boat = 240, zeppelin = 240, tram = 150 }
local ARRIVED = { walk = 25, fly = 80, boat = 150, zeppelin = 150, tram = 150 }

local route = nil -- the route being followed: { target, legs, at }
local tour = nil -- while handing in your finished quests: { stop = the stop being routed to }
local routeFrame

local function worldSpot(map, x, y)
  local zone = MGADungeonQuestsTravel and MGADungeonQuestsTravel.zones[map]
  if not zone then return nil end
  return { c = zone[1], wx = zone[3] - (y / 100) * (zone[3] - zone[2]), wy = zone[5] - (x / 100) * (zone[5] - zone[4]) }
end

-- Where you stand in the world; nil inside an instance, where the client doesn't say.
local function playerSpot()
  if not UnitPosition then return nil end
  local wx, wy, _, continent = UnitPosition("player")
  if not wx then return nil end
  return { c = continent, wx = wx, wy = wy }
end

local function yardsApart(a, b)
  if a.c ~= b.c then return math.huge end
  return math.sqrt((a.wx - b.wx) ^ 2 + (a.wy - b.wy) ^ 2)
end

local function character()
  MGADungeonQuestsCharacter = MGADungeonQuestsCharacter or {}
  local saved = MGADungeonQuestsCharacter
  saved.flights, saved.flightsSeen = saved.flights or {}, saved.flightsSeen or {}
  return saved
end

-- Opening any flight master tells us every flight path you know on that continent.
local function rememberFlights()
  local spot = playerSpot()
  if not (spot and C_TaxiMap and C_TaxiMap.GetAllTaxiNodes and GetTaxiMapID) then return end
  local nodes = C_TaxiMap.GetAllTaxiNodes(GetTaxiMapID())
  if not nodes or #nodes == 0 then return end
  local saved = character()
  local unreachable = Enum and Enum.FlightPathState and Enum.FlightPathState.Unreachable or 2
  saved.flightsSeen[spot.c] = true
  for _, node in ipairs(nodes) do
    if node.state ~= unreachable then saved.flights[node.nodeID] = true end
  end
end

local function playerSide()
  return (UnitFactionGroup("player") or ""):sub(1, 1)
end

local function usable(thing, side)
  return thing.side == side or thing.side == "N"
end

-- A flight path counts once you know it; on a continent we haven't seen a flight master on, we can't tell yet.
local function canFly(flight, side)
  local saved = character()
  return usable(flight, side) and (not saved.flightsSeen[flight.c] or saved.flights[flight.id] == true)
end

-- Adds every flight master (on the ground and in the air) and ride stop your faction can use to `nodes`.
local function withTransit(nodes, side)
  for _, flight in ipairs(MGADungeonQuestsTravel.flights) do
    if canFly(flight, side) then
      nodes[#nodes + 1] = { spot = flight, flight = flight, label = "the flight master at " .. flight.name }
      nodes[#nodes + 1] = { spot = flight, flight = flight, air = true }
    end
  end
  for _, ride in ipairs(MGADungeonQuestsTravel.rides) do
    if usable(ride, side) then
      for _, stop in ipairs(ride.stops) do nodes[#nodes + 1] = { spot = stop, ride = ride, label = stop.label } end
    end
  end
  return nodes
end

local function travelNodes(from, to, side)
  return withTransit({ { spot = from }, { spot = to } }, side)
end

local function flightLinks()
  local links = {}
  for _, link in ipairs(MGADungeonQuestsTravel.links) do
    links[link[1]] = links[link[1]] or {}
    links[link[1]][link[2]] = true
  end
  return links
end

-- Seconds from a to b, and whether that's aboard a ride; nil when there's no direct way.
local function travelSeconds(a, b, links)
  if a.air then
    if not b.air then return a.flight == b.flight and 0 or nil end
    if links[a.flight.id] and links[a.flight.id][b.flight.id] then return yardsApart(a.spot, b.spot) / FLY_SPEED end
    return nil
  end
  if b.air then return a.flight == b.flight and FLIGHT_WAIT or nil end
  local yards = yardsApart(a.spot, b.spot)
  local walk = yards < math.huge and yards * WALK_DETOUR / RUN_SPEED or nil
  if a.ride and a.ride == b.ride and (not walk or RIDE_WAIT[a.ride.vehicle] < walk) then return RIDE_WAIT[a.ride.vehicle], true end
  return walk
end

-- Seconds from nodes[start] to each node it reaches (all of them, or until `goal`), and the node before each.
local function quickestFrom(nodes, start, goal, links)
  local seconds, previous, settled = { [start] = 0 }, {}, {}
  while true do
    local current
    for i in pairs(seconds) do
      if not settled[i] and (not current or seconds[i] < seconds[current]) then current = i end
    end
    if not current or current == goal then break end
    settled[current] = true
    for i, node in ipairs(nodes) do
      local cost = not settled[i] and travelSeconds(nodes[current], node, links)
      if cost and (not seconds[i] or seconds[current] + cost < seconds[i]) then
        seconds[i], previous[i] = seconds[current] + cost, current
      end
    end
  end
  return seconds, previous
end

-- The nodes of the quickest way from node 1 to node 2, and its seconds; nil when none joins them.
local function quickestPath(nodes)
  local seconds, previous = quickestFrom(nodes, 1, 2, flightLinks())
  if not seconds[2] then return nil end
  local path, at = {}, 2
  while at do
    table.insert(path, 1, nodes[at])
    at = previous[at]
  end
  return path, seconds[2]
end

local function aboutYards(yards)
  return math.max(10, math.floor(yards / 10 + 0.5) * 10) .. " yd"
end

local function legsAlong(path, target)
  local links, legs = flightLinks(), {}
  local function add(kind, text, spot) legs[#legs + 1] = { kind = kind, text = text, spot = spot } end
  for i = 2, #path do
    local a, b = path[i - 1], path[i]
    local _, aboard = travelSeconds(a, b, links)
    if a.air and not b.air then
      add("fly", "Take the flight to " .. b.flight.name, b.spot)
    elseif aboard then
      add(a.ride.vehicle, "Take the " .. a.ride.vehicle .. " to " .. b.label, b.spot)
    elseif not a.air and not b.air and yardsApart(a.spot, b.spot) > ARRIVED.walk then
      local place = b.label or (target.giver .. ", " .. target.where)
      add("walk", "Walk to " .. place .. " (about " .. aboutYards(yardsApart(a.spot, b.spot)) .. ")", b.spot)
    end
  end
  return legs
end

-- The legs from one spot to a target, and the minutes they take; nil when no road joins them.
function M.PlanRoute(from, target)
  local to = worldSpot(target.map, target.x, target.y)
  if not (from and to) then return nil end
  to.map, to.x, to.y = target.map, target.x, target.y
  local path, seconds = quickestPath(travelNodes(from, to, playerSide()))
  if not path then return nil end
  return legsAlong(path, target), math.max(1, math.floor(seconds / 60 + 0.5))
end

local function pinLeg(leg)
  local spot = leg.spot
  if not M.CanPin(spot) then return end
  if C_Map.CanSetUserWaypointOnMap and not C_Map.CanSetUserWaypointOnMap(spot.map) then return end
  C_Map.SetUserWaypoint(UiMapPoint.CreateFromCoordinates(spot.map, spot.x / 100, spot.y / 100))
  if C_SuperTrack and C_SuperTrack.SetSuperTrackedUserWaypoint then C_SuperTrack.SetSuperTrackedUserWaypoint(true) end
  route.pinned = true
end

-- Ends the route and takes its own pin away; a pin you placed yourself stays.
local function endRoute()
  local pinned = route and route.pinned
  route = nil
  if routeFrame then routeFrame:Hide() end
  if pinned and C_Map and C_Map.ClearUserWaypoint then C_Map.ClearUserWaypoint() end
end

-- Stops the route, and the turn-in run if one is going.
function M.StopRoute()
  tour = nil
  endRoute()
end

local function handInText(stop)
  return "hand in " .. table.concat(stop.quests, ", ") .. " to " .. stop.giver .. "."
end

-- Moves on to the furthest leg you've reached the end of; the last one ends the route.
function M.TrackRoute()
  local spot = route and playerSpot()
  if not spot then return end
  for i = #route.legs, route.at, -1 do
    local leg = route.legs[i]
    if yardsApart(spot, leg.spot) <= ARRIVED[leg.kind] then
      if i == #route.legs then
        say("you've reached " .. route.target.giver .. "." .. (tour and (" Now " .. handInText(tour.stop)) or ""))
        endRoute()
      else
        route.at = i + 1
        M.ShowRouteLeg()
      end
      return
    end
  end
end

local function newRouteFrame()
  local f = CreateFrame("Frame", "MGADungeonQuestsRouteFrame", UIParent)
  f:SetSize(340, 62)
  f:SetPoint("TOP", 0, -120)
  f:SetFrameStrata("MEDIUM")
  f:SetMovable(true)
  f:EnableMouse(true)
  f:RegisterForDrag("LeftButton")
  f:SetScript("OnDragStart", f.StartMoving)
  f:SetScript("OnDragStop", f.StopMovingOrSizing)
  local back = f:CreateTexture(nil, "BACKGROUND")
  back:SetAllPoints()
  back:SetColorTexture(0, 0, 0, 0.75)
  f.heading = f:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  f.heading:SetPoint("TOPLEFT", 10, -8)
  f.heading:SetWidth(270)
  f.heading:SetJustifyH("LEFT")
  f.heading:SetWordWrap(false)
  f.leg = f:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  f.leg:SetPoint("TOPLEFT", 10, -28)
  f.leg:SetWidth(320)
  f.leg:SetJustifyH("LEFT")
  local stop = CreateFrame("Button", "MGADungeonQuestsRouteStop", f, "UIPanelButtonTemplate")
  stop:SetSize(50, 20)
  stop:SetPoint("TOPRIGHT", -6, -5)
  stop:SetText("Stop")
  stop:SetScript("OnClick", M.StopRoute)
  local waited = 0
  f:SetScript("OnUpdate", function(_, elapsed)
    waited = waited + elapsed
    if waited < TRACK_SECONDS then return end
    waited = 0
    M.TrackRoute()
  end)
  return f
end

function M.ShowRouteLeg()
  routeFrame = routeFrame or newRouteFrame()
  local leg = route.legs[route.at]
  routeFrame.heading:SetText((route.target.heading or ("Route to " .. route.target.giver)) .. " (about " .. route.minutes .. " min)")
  routeFrame.leg:SetText(route.at .. " of " .. #route.legs .. ": " .. leg.text)
  routeFrame:Show()
  pinLeg(leg)
end

local function follow(target, legs, minutes)
  -- A replan keeps knowing it pinned, so ending it still clears its old pin.
  route = { target = target, legs = legs, at = 1, minutes = minutes, pinned = route and route.pinned }
  M.ShowRouteLeg()
end

-- Whether a route flies on a continent where we haven't seen which flight paths you know.
function M.FliesUnchecked(legs)
  for _, leg in ipairs(legs) do
    if leg.kind == "fly" and not character().flightsSeen[leg.spot.c] then return true end
  end
  return false
end

-- Routes you to a target, or pins it when the way there can't be worked out (inside an instance, say).
-- Returns true when you're already there.
local function routeTo(target)
  endRoute()
  local legs, minutes = M.PlanRoute(playerSpot(), target)
  if not legs then return M.Pin(target) end
  if #legs == 0 then
    say("you're already at " .. target.giver .. ".")
    return true
  end
  say("route to " .. target.giver .. ", about " .. minutes .. " min:")
  for i, leg in ipairs(legs) do say(i .. ". " .. leg.text) end
  if M.FliesUnchecked(legs) then
    say("It counts every flight path until you open a flight master here, which shows the ones you know.")
  end
  follow(target, legs, minutes)
end

function M.StartRoute(target)
  tour = nil
  routeTo(target)
end

-- After a loading screen or a new flight path, the quickest way may have changed. Going into an instance ends it.
function M.ReplanRoute()
  if not route then return end
  local _, instanceType = GetInstanceInfo()
  if instanceType ~= "none" then return M.StopRoute() end
  local legs, minutes = M.PlanRoute(playerSpot(), route.target)
  if not legs then return end
  if #legs == 0 then return endRoute() end
  follow(route.target, legs, minutes)
end

M.RememberFlights = rememberFlights

-- Where a quest needs you next: its giver, whoever takes it back, or the dungeon's door.
function M.RouteTarget(step, state, dungeon)
  if not state then
    return step.map and { giver = step.giver, where = step.where, map = step.map, x = step.x, y = step.y } or nil
  end
  if state == "complete" then
    if not step.turnInMap then return nil end
    return { giver = step.turnIn, where = step.turnInWhere, map = step.turnInMap, x = step.turnInX, y = step.turnInY }
  end
  return step.dungeon and M.DoorTarget(dungeon) or nil
end

function M.DoorTarget(dungeon)
  local door = dungeon.door
  return door and { giver = dungeon.name .. " entrance", where = door.where, map = door.map, x = door.x, y = door.y } or nil
end

-- Turn-ins ------------------------------------------------------------------------------------
-- Your finished quests (any quest, not only dungeon ones): a World Map pin on whoever takes each back,
-- and the quickest order to hand them all in. Who and where come from TurnIns.lua.

local TURN_IN_ICON = "Interface\\GossipFrame\\ActiveQuestIcon"
local CONTINENT_MAP = 2 -- Enum.UIMapType.Continent: this and the world above it show every pin

-- The places to hand in your finished quests, one per NPC: { {giver, where, map, x, y, quests = {titles}} },
-- and the titles of finished quests we don't know where to hand in.
function M.TurnInStops()
  local stops, byKey, unknown = {}, {}, {}
  for _, q in ipairs(scanLog()) do
    if q.complete then
      local t = MGADungeonQuestsTurnIns and MGADungeonQuestsTurnIns[q.id]
      if t then
        local key = t[1] .. "|" .. t[2] .. "|" .. t[3] .. "|" .. t[4]
        local stop = byKey[key]
        if not stop then
          stop = { key = key, giver = t[1], map = t[2], x = t[3], y = t[4], where = t[5], quests = {}, ids = {} }
          byKey[key], stops[#stops + 1] = stop, stop
        end
        stop.quests[#stop.quests + 1] = q.title
        stop.ids[#stop.ids + 1] = q.id
      else
        unknown[#unknown + 1] = q.title
      end
    end
  end
  return stops, unknown
end

-- Seconds of a run through `order` (indexes into secs) starting at 1. A leg with no way there costs
-- UNREACHABLE, so the reachable stops are still put in their best order (and the unreachable ones last).
local UNREACHABLE = 1e7
local function runSeconds(order, secs)
  local total, at = 0, 1
  for _, i in ipairs(order) do
    total, at = total + (secs[at][i] or UNREACHABLE), i
  end
  return total
end

-- The stops in the quickest order from where you stand, and the minutes it takes (nil when one can't be
-- reached): the nearest stop each time, then any swap of a stretch that shortens the run (2-opt).
function M.TurnInOrder(from, stops)
  local nodes = { { spot = from } }
  for _, stop in ipairs(stops) do
    local spot = worldSpot(stop.map, stop.x, stop.y)
    nodes[#nodes + 1] = { spot = spot or { c = -1, wx = 0, wy = 0 } }
  end
  local n, links = #stops, flightLinks()
  withTransit(nodes, playerSide())
  local secs = {}
  for i = 1, n + 1 do secs[i] = quickestFrom(nodes, i, nil, links) end
  local order, left, at = {}, {}, 1
  for i = 2, n + 1 do left[i] = true end
  for _ = 1, n do
    local best
    for i in pairs(left) do
      local s = secs[at][i] or math.huge
      if not best or s < (secs[at][best] or math.huge) or (s == (secs[at][best] or math.huge) and i < best) then best = i end
    end
    order[#order + 1], left[best], at = best, nil, best
  end
  local improved = true
  while improved do
    improved = false
    for i = 1, n - 1 do
      for j = i + 1, n do
        local tried = {}
        for k = 1, n do tried[k] = order[k] end
        for k = 0, j - i do tried[i + k] = order[j - k] end
        if runSeconds(tried, secs) < runSeconds(order, secs) then order, improved = tried, true end
      end
    end
  end
  local out = {}
  for k, i in ipairs(order) do out[k] = stops[i - 1] end
  local seconds = runSeconds(order, secs)
  return out, seconds < UNREACHABLE and math.max(1, math.floor(seconds / 60 + 0.5)) or nil
end

local function questCount(stops)
  local count = 0
  for _, stop in ipairs(stops) do count = count + #stop.quests end
  return count
end

local function stopTarget(stop, i, total)
  return { giver = stop.giver, where = stop.where, map = stop.map, x = stop.x, y = stop.y,
    heading = total > 1 and ("Turn-in " .. i .. " of " .. total .. ": " .. stop.giver) or ("Turn in at " .. stop.giver) }
end

-- Plans the run from where you stand and routes you to its first stop; quiet = only say the next stop.
local function runTurnIns(quiet)
  local stops, unknown = M.TurnInStops()
  if not quiet and #unknown > 0 then
    say(#unknown .. " finished " .. (#unknown == 1 and "quest has" or "quests have") .. " no turn-in spot in our data: " .. table.concat(unknown, ", ") .. ".")
  end
  if #stops == 0 then
    if tour then M.StopRoute() end
    if quiet then
      say(#unknown == 0 and "that's every quest handed in." or
        ("that's every turn-in we know the spot of. Still finished: " .. table.concat(unknown, ", ") .. "."))
    elseif #unknown == 0 then
      say("no finished quests in your quest log.")
    end
    return
  end
  local from = playerSpot()
  if not from then
    if tour then M.StopRoute() end
    return say("inside an instance the game doesn't say where you are. Try again outside; your turn-ins are pinned on the World Map.")
  end
  local ordered, minutes = M.TurnInOrder(from, stops)
  if not quiet then
    local count = questCount(ordered)
    say("hand in " .. count .. (count == 1 and " quest" or " quests") .. " at " .. #ordered .. (#ordered == 1 and " stop" or " stops") ..
      (minutes and (", about " .. minutes .. " min of travel") or "") .. ", in this order:")
    for i, stop in ipairs(ordered) do say(i .. ". " .. stop.giver .. ", " .. stop.where .. ": " .. table.concat(stop.quests, ", ")) end
  else
    say("next: " .. handInText(ordered[1]))
  end
  local here = routeTo(stopTarget(ordered[1], 1, #ordered))
  tour = { stop = ordered[1] }
  if here then say("Now " .. handInText(ordered[1])) end
end

function M.StartTurnIns()
  runTurnIns(false)
end

-- After your quest log changes: once the stop you're on is handed in, on to the next one.
-- The stop counts as handed in only when the game, asked by id, says none of its quests is still in your
-- log: missing from the listed log alone (a collapsed header, a log still loading) proves nothing.
function M.CheckTurnIns()
  if not tour then return end
  for _, stop in ipairs((M.TurnInStops())) do
    if stop.key == tour.stop.key then
      tour.stop = stop
      return
    end
  end
  for _, id in ipairs(tour.stop.ids) do
    if askInLog(id) then return end
  end
  runTurnIns(true)
end

-- The World Map pins.
local function pinsOn()
  return not (MGADungeonQuestsSettings and MGADungeonQuestsSettings.turnInPins == false)
end

local turnInPins, mapButton = {}, nil

-- Where a stop falls on the map being shown (0-1), or nil when it isn't on it: its own zone map, or a
-- continent (or the world) when the client can place it there.
local function onMap(stop, mapId)
  if mapId == stop.map then return stop.x / 100, stop.y / 100 end
  local info = C_Map and C_Map.GetMapInfo and C_Map.GetMapInfo(mapId)
  if not (info and info.mapType and info.mapType <= CONTINENT_MAP) then return nil end
  if not (C_Map.GetWorldPosFromMapPos and C_Map.GetMapPosFromWorldPos and CreateVector2D) then return nil end
  local continent, world = C_Map.GetWorldPosFromMapPos(stop.map, CreateVector2D(stop.x / 100, stop.y / 100))
  if not (continent and world) then return nil end
  local _, pos = C_Map.GetMapPosFromWorldPos(continent, world, mapId)
  if not pos then return nil end
  local x, y = pos:GetXY()
  if x < 0 or x > 1 or y < 0 or y > 1 then return nil end
  return x, y
end

local function mapCanvas()
  if not WorldMapFrame then return nil end
  if WorldMapFrame.GetCanvas then return WorldMapFrame:GetCanvas() end
  return WorldMapFrame.ScrollContainer and WorldMapFrame.ScrollContainer.Child
end

local function newTurnInPin(i, canvas)
  local pin = CreateFrame("Button", "MGADungeonQuestsTurnInPin" .. i, canvas)
  pin:SetSize(22, 22)
  if WorldMapFrame.GetFrameStrata then pin:SetFrameStrata(WorldMapFrame:GetFrameStrata()) end
  pin:SetFrameLevel(canvas:GetFrameLevel() + 100)
  local icon = pin:CreateTexture(nil, "OVERLAY")
  icon:SetAllPoints()
  icon:SetTexture(TURN_IN_ICON)
  pin:SetScript("OnEnter", function(self)
    if not GameTooltip then return end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:AddLine(self.stop.giver)
    GameTooltip:AddLine(self.stop.where, 0.7, 0.7, 0.7)
    for _, title in ipairs(self.stop.quests) do GameTooltip:AddLine("Turn in: " .. title, 0.2, 1, 0.2) end
    GameTooltip:AddLine("Click to route here.", 0.4, 0.73, 1)
    GameTooltip:Show()
  end)
  pin:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  pin:SetScript("OnClick", function(self) M.StartRoute(stopTarget(self.stop, 1, 1)) end)
  return pin
end

local function newMapButton()
  local b = CreateFrame("Button", "MGADungeonQuestsTurnInButton", WorldMapFrame, "UIPanelButtonTemplate")
  b:SetSize(150, 22)
  b:SetPoint("TOPRIGHT", WorldMapFrame.ScrollContainer or WorldMapFrame, "TOPRIGHT", -8, -8)
  b:SetFrameLevel((mapCanvas() or WorldMapFrame):GetFrameLevel() + 110)
  b:SetScript("OnClick", M.StartTurnIns)
  return b
end

-- Draws a pin on each turn-in spot on the map you're looking at, and the "Route turn-ins" button.
function M.DrawTurnInPins()
  local canvas = mapCanvas()
  if not canvas then return end
  local stops = (pinsOn() and WorldMapFrame:IsShown()) and M.TurnInStops() or {}
  local mapId = WorldMapFrame.GetMapID and WorldMapFrame:GetMapID()
  local used = 0
  for _, stop in ipairs(stops) do
    local x, y
    if mapId then x, y = onMap(stop, mapId) end
    if x then
      used = used + 1
      local pin = turnInPins[used] or newTurnInPin(used, canvas)
      turnInPins[used], pin.stop = pin, stop
      pin:ClearAllPoints()
      pin:SetPoint("CENTER", canvas, "TOPLEFT", x * canvas:GetWidth(), -y * canvas:GetHeight())
      pin:Show()
    end
  end
  for i = used + 1, #turnInPins do turnInPins[i]:Hide() end
  if #stops > 0 then
    mapButton = mapButton or newMapButton()
    local count = questCount(stops)
    mapButton:SetText("Route " .. count .. (count == 1 and " turn-in" or " turn-ins"))
    mapButton:Show()
  elseif mapButton then
    mapButton:Hide()
  end
end

local mapHooked = false
function M.HookWorldMap()
  if mapHooked or not WorldMapFrame then return end
  mapHooked = true
  if WorldMapFrame.HookScript then WorldMapFrame:HookScript("OnShow", M.DrawTurnInPins) end
  if not hooksecurefunc then return end
  -- OnMapChanged is the map canvas's own hook; SetMapID covers a client whose map lacks it.
  if WorldMapFrame.OnMapChanged then hooksecurefunc(WorldMapFrame, "OnMapChanged", M.DrawTurnInPins)
  elseif WorldMapFrame.SetMapID then hooksecurefunc(WorldMapFrame, "SetMapID", M.DrawTurnInPins) end
end

-- One quest line's block: its heading and "Next:" line (top), the steps (body), and where to route to.
local function lineBlock(n, line, inLog, level, dungeon)
  local done = M.DoneSteps(line, inLog)
  local doneCount, nextIndex = 0, nil
  for i in ipairs(line.steps) do
    if done[i] then doneCount = doneCount + 1 elseif not nextIndex then nextIndex = i end
  end
  local status = nextIndex and (doneCount .. " of " .. #line.steps .. " done") or (GREEN .. "all done|r")
  local top = WHITE .. n .. ". " .. table.concat(line.titles, " / ") .. "|r  " .. GREY .. status .. "|r"
  local skillNote = M.SkillNote(line, playerSkills())
  if skillNote then top = top .. "\n" .. RED .. skillNote .. "|r" end
  local pin = nil
  if nextIndex then
    local step = line.steps[nextIndex]
    local state = inLog[step.id]
    top = top .. "\n" .. GOLD .. "Next:|r " .. M.NextText(step, state, level)
    local target = M.RouteTarget(step, state, dungeon)
    if target and M.CanPin(target) then pin = target end
  end
  local body = {}
  for i, step in ipairs(line.steps) do
    local state = done[i] and "done" or inLog[step.id]
    for _, text in ipairs(stepLines(step, state, level, i == nextIndex)) do body[#body + 1] = text end
  end
  return { top = top, body = table.concat(body, "\n"), pin = pin }
end

-- The checklist for one dungeon: its title, a block per quest line, and a footnote.
function M.Checklist(dungeon)
  local inLog, level = M.QuestsInLog(), UnitLevel("player") or 1
  local out = { title = GOLD .. dungeon.name .. "|r  " .. GREY .. levels(dungeon) .. "|r", blocks = {} }
  local lines = M.LinesFor(dungeon)
  if #lines == 0 then
    out.footer = "No quests to pick up for this dungeon for your faction and class."
    return out
  end
  for n, line in ipairs(lines) do out.blocks[n] = lineBlock(n, line, inLog, level, dungeon) end
  out.footer = GREY .. "Quest lines are Classic's; Forever may differ. Quests you turn in tick when the game records them.|r"
  return out
end

-- The journal's grid: every dungeon, lowest level first, with how many of its quests you still need.
function M.ListRows()
  local rows, inLog, level = {}, M.QuestsInLog(), UnitLevel("player") or 1
  for _, d in ipairs(MGADungeonQuestsData) do
    local left, status = M.ToPickUp(d, inLog), ""
    if #M.LinesFor(d) > 0 then
      status = left == 0 and "all picked up" or (left == 1 and "1 quest to pick up" or (left .. " quests to pick up"))
    end
    rows[#rows + 1] = { dungeon = d, name = d.name, range = levels(d), status = status, inRange = level >= d.levelMin - 3 and level <= d.levelMax }
  end
  return rows
end

-- The Overview tab's facts about a dungeon.
function M.Overview(dungeon)
  local facts = { (levels(dungeon):gsub("^%l", string.upper)) }
  if dungeon.players then facts[#facts + 1] = "Up to " .. dungeon.players .. " players" end
  local bosses = #(dungeon.bosses or {})
  if bosses > 0 then facts[#facts + 1] = bosses .. (bosses == 1 and " boss" or " bosses") end
  if #M.LinesFor(dungeon) > 0 then
    local left = M.ToPickUp(dungeon, M.QuestsInLog())
    facts[#facts + 1] = left == 0 and "All its quests picked up" or (left .. (left == 1 and " quest" or " quests") .. " to pick up")
  end
  if dungeon.isNew then facts[#facts + 1] = "New in WoW Forever" end
  return facts
end

local function chanceText(chance)
  return string.format(chance >= 10 and "%.0f%%" or "%.1f%%", chance)
end

-- The Loot tab's rows: one boss's drops, or the whole dungeon's boss by boss.
function M.LootRows(dungeon, boss)
  local rows = {}
  for _, b in ipairs(boss and { boss } or dungeon.bosses or {}) do
    for _, item in ipairs(b.loot or {}) do
      local kind = item.kind and item.slot and (item.slot .. ", " .. item.kind) or item.slot or item.kind or ""
      local sub = boss and kind or (kind == "" and b.name or (kind .. " - " .. b.name))
      rows[#rows + 1] = { id = item.id, name = item.name, sub = sub, chance = chanceText(item.chance) }
    end
  end
  return rows
end

-- A dungeon by instance id, key or part of its name.
function M.Find(query)
  if type(query) == "number" then
    for _, d in ipairs(MGADungeonQuestsData) do
      if d.instanceId == query then return d end
    end
    return nil
  end
  local q = query:lower()
  for _, d in ipairs(MGADungeonQuestsData) do
    if d.key == q or d.name:lower() == q then return d end
    for _, alias in ipairs(d.aliases or {}) do
      if alias:lower() == q then return d end
    end
  end
  for _, d in ipairs(MGADungeonQuestsData) do
    if d.name:lower():find(q, 1, true) or d.key:find(q, 1, true) then return d end
  end
  return nil
end

local function currentDungeon()
  if not GetInstanceInfo then return nil end
  local _, instanceType, _, _, _, _, _, instanceId = GetInstanceInfo()
  if instanceType ~= "party" and instanceType ~= "raid" then return nil end
  return instanceId and M.Find(instanceId) or nil
end

-- The window ---------------------------------------------------------------------------------
-- The Dungeon Journal's layout, drawn with the game's own journal art (by file id, so no path can miss).

local ART = { BOOK = 521750, ATLAS = 522972, HOME = 605327, BUTTON = 521746, LORE = 521743, BOSS = 521744 }
-- left, right, top, bottom in the journal's texture sheet
local SHEET = {
  dungeonUp = { 0.00195313, 0.34179688, 0.42871094, 0.52246094 },
  dungeonDown = { 0.00195313, 0.34179688, 0.33300781, 0.42675781 },
  dungeonLit = { 0.34570313, 0.68554688, 0.33300781, 0.42675781 },
  bossUp = { 0.00195313, 0.63671875, 0.21386719, 0.26757813 },
  bossDown = { 0.00195313, 0.63671875, 0.10253906, 0.15625000 },
  bossLit = { 0.00195313, 0.63671875, 0.15820313, 0.21191406 },
  tabOff = { 0.25585938, 0.37890625, 0.90332031, 0.95898438 },
  tabOn = { 0.12890625, 0.25195313, 0.90332031, 0.95898438 },
  tabLit = { 0.00195313, 0.12500000, 0.90332031, 0.95898438 },
  skullOff = { 0.85546875, 0.94921875, 0.52441406, 0.56640625 },
  skullOn = { 0.90234375, 0.99609375, 0.26953125, 0.31152344 },
  chestOff = { 0.73046875, 0.82421875, 0.61816406, 0.66015625 },
  chestOn = { 0.63281250, 0.72656250, 0.61816406, 0.66015625 },
  lootRow = { 0.00195313, 0.62890625, 0.61816406, 0.66210938 },
  nameBar = { 0.34570313, 0.84570313, 0.42871094, 0.49121094 },
  pageHeader = { 0, 0.755859375, 0.9599609375, 1 },
}
local TABS = {
  { key = "quests", tip = "Quests", file = "Interface\\GossipFrame\\AvailableQuestIcon" },
  { key = "overview", tip = "Overview", off = SHEET.skullOff, on = SHEET.skullOn },
  { key = "loot", tip = "Loot", off = SHEET.chestOff, on = SHEET.chestOn },
}
local NO_ICON = "Interface\\Icons\\INV_Misc_QuestionMark"
local PIN_WIDTH, GAP, LORE_HEIGHT, LOOT_HEIGHT = 64, 6, 250, 47

local frame, scroll, child, grid, gridChild, book, bossChild, lorePicture, loreBar, loreTitle
local crumbs, tabs = {}, {}
local dungeonButtons, bossButtons, lootButtons = {}, {}, {}
local texts, pins = {}, {} -- pooled font strings and Route buttons for the right-hand page
local doorButton
local shown, shownBoss, shownTab = nil, nil, "quests" -- the dungeon on screen (nil = the grid), its boss, its tab
local render

local function fromSheet(parent, layer, coords)
  local t = parent:CreateTexture(nil, layer)
  t:SetTexture(ART.ATLAS)
  t:SetTexCoord(coords[1], coords[2], coords[3], coords[4])
  return t
end

-- A button drawn with three pieces of the sheet: up, pressed and lit.
local function skin(button, up, down, lit)
  local normal, pushed, highlight = fromSheet(button, "ARTWORK", up), fromSheet(button, "ARTWORK", down), fromSheet(button, "HIGHLIGHT", lit)
  normal:SetAllPoints()
  pushed:SetAllPoints()
  highlight:SetAllPoints()
  button:SetNormalTexture(normal)
  button:SetPushedTexture(pushed)
  button:SetHighlightTexture(highlight)
end

local function resetScroll()
  if scroll.SetVerticalScroll then scroll:SetVerticalScroll(0) end
end

local function openTab(key)
  shownTab = key
  if key ~= "loot" then shownBoss = nil end
  render()
  resetScroll()
end

local function newCrumb(name, width, x, onClick)
  local b = CreateFrame("Button", name, frame, "UIPanelButtonTemplate")
  b:SetSize(width, 22)
  b:SetPoint("TOPLEFT", x, -30)
  b:SetScript("OnClick", onClick)
  return b
end

local function newTab(i, tab)
  local b = CreateFrame("Button", "MGADungeonQuestsTab" .. i, book)
  b:SetSize(63, 57)
  b:SetPoint("TOPLEFT", book, "TOPRIGHT", -12, -35 - (i - 1) * 55)
  b:SetFrameLevel(book:GetFrameLevel() + 5)
  b.back = fromSheet(b, "BACKGROUND", SHEET.tabOff)
  b.back:SetAllPoints()
  local lit = fromSheet(b, "HIGHLIGHT", SHEET.tabLit)
  lit:SetAllPoints()
  lit:SetBlendMode("ADD")
  b.icon = b:CreateTexture(nil, "OVERLAY")
  if tab.file then
    b.icon:SetTexture(tab.file)
    b.icon:SetSize(24, 24)
    b.icon:SetPoint("RIGHT", -18, 0)
  else
    b.icon:SetTexture(ART.ATLAS)
    b.icon:SetSize(48, 43)
    b.icon:SetPoint("RIGHT", -6, 0)
  end
  b:SetScript("OnClick", function() openTab(tab.key) end)
  b:SetScript("OnEnter", function(self)
    if not GameTooltip then return end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetText(tab.tip)
    GameTooltip:Show()
  end)
  b:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  return b
end

local function newScroll(name, parent)
  local s = CreateFrame("ScrollFrame", name, parent, "UIPanelScrollFrameTemplate")
  local c = CreateFrame("Frame", nil, s)
  s:SetScrollChild(c)
  return s, c
end

local function newGrid()
  grid = CreateFrame("Frame", nil, frame)
  grid:SetSize(785, 425)
  grid:SetPoint("TOPLEFT", 6, -58)
  local back = grid:CreateTexture(nil, "BACKGROUND")
  back:SetTexture(ART.HOME)
  back:SetAllPoints()
  local s, c = newScroll("MGADungeonQuestsGridScroll", grid)
  s:SetPoint("TOPLEFT", 14, -12)
  s:SetPoint("BOTTOMRIGHT", -30, 10)
  c:SetSize(738, 10)
  gridChild = c
end

local function newBook()
  book = CreateFrame("Frame", nil, frame)
  book:SetSize(785, 425)
  book:SetPoint("TOPLEFT", 6, -58)
  local page = book:CreateTexture(nil, "BACKGROUND")
  page:SetTexture(ART.BOOK)
  page:SetTexCoord(0, 0.766601562, 0, 0.830078125)
  page:SetAllPoints()
  local header = fromSheet(book, "BORDER", SHEET.pageHeader)
  header:SetSize(386, 39)
  header:SetPoint("TOPLEFT", 0, -11)
  local title = book:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", 24, -22)
  title:SetTextColor(0.902, 0.788, 0.671)
  title:SetText("Bosses")

  local bossScroll
  bossScroll, bossChild = newScroll("MGADungeonQuestsBossScroll", book)
  bossScroll:SetPoint("TOPLEFT", 10, -50)
  bossScroll:SetSize(338, 362)
  bossChild:SetSize(330, 10)

  scroll, child = newScroll("MGADungeonQuestsScroll", book)
  scroll:SetPoint("TOPLEFT", 398, -18)
  scroll:SetSize(336, 392)
  child:SetSize(TEXT_WIDTH + 8, 10)

  lorePicture = child:CreateTexture(nil, "BACKGROUND")
  lorePicture:SetSize(TEXT_WIDTH, LORE_HEIGHT)
  lorePicture:SetPoint("TOPLEFT", 4, -4)
  lorePicture:SetTexCoord(0, 0.7617187, 0, 0.65625)
  loreBar = fromSheet(child, "ARTWORK", SHEET.nameBar)
  loreBar:SetSize(256, 64)
  loreBar:SetPoint("TOP", lorePicture, "TOP", 0, -24)
  loreTitle = child:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  loreTitle:SetWidth(230)
  loreTitle:SetPoint("CENTER", loreBar, "CENTER", 0, 0)

  for i, tab in ipairs(TABS) do tabs[i] = newTab(i, tab) end
end

local function newFrame()
  local ok, f = pcall(CreateFrame, "Frame", "MGADungeonQuestsFrame", UIParent, "BasicFrameTemplateWithInset")
  if not ok or not f then
    f = CreateFrame("Frame", "MGADungeonQuestsFrame", UIParent)
    local bg = f:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints()
    bg:SetColorTexture(0, 0, 0, 0.85)
  end
  frame = f
  f:SetSize(FRAME_WIDTH, FRAME_HEIGHT)
  f:SetPoint("CENTER")
  f:SetFrameStrata("HIGH")
  f:SetMovable(true)
  f:EnableMouse(true)
  f:RegisterForDrag("LeftButton")
  f:SetScript("OnDragStart", f.StartMoving)
  f:SetScript("OnDragStop", f.StopMovingOrSizing)
  f:Hide()
  if f.TitleText then f.TitleText:SetText("MGA Dungeon Quests") end
  if UISpecialFrames then table.insert(UISpecialFrames, "MGADungeonQuestsFrame") end -- Escape closes it

  crumbs.home = newCrumb("MGADungeonQuestsHome", 70, 12, function() M.Show(nil) end)
  crumbs.home:SetText("Home")
  crumbs.dungeon = newCrumb("MGADungeonQuestsCrumbDungeon", 190, 84, function()
    shownBoss = nil
    openTab(shownTab)
  end)
  crumbs.boss = newCrumb("MGADungeonQuestsCrumbBoss", 210, 276, function() end)
  newGrid()
  newBook()
  return f
end

-- The i-th pooled font string on the right-hand page, placed at y and width wide.
local function textAt(i, y, width)
  local t = texts[i]
  if not t then
    t = child:CreateFontString(nil, "OVERLAY", "GameFontBlack")
    t:SetJustifyH("LEFT")
    t:SetSpacing(3)
    texts[i] = t
  end
  t:ClearAllPoints()
  t:SetPoint("TOPLEFT", 4, y)
  t:SetWidth(width)
  t:Show()
  return t
end

local function pinButton(i)
  if pins[i] then return pins[i] end
  local b = CreateFrame("Button", "MGADungeonQuestsPin" .. i, child, "UIPanelButtonTemplate")
  b:SetSize(PIN_WIDTH, 22)
  b:SetText("Route")
  pins[i] = b
  return b
end

local function dungeonButton(i)
  if dungeonButtons[i] then return dungeonButtons[i] end
  local b = CreateFrame("Button", "MGADungeonQuestsDungeon" .. i, gridChild)
  b:SetSize(174, 96)
  b:SetPoint("TOPLEFT", (i - 1) % 4 * 188, -math.floor((i - 1) / 4) * 108)
  b.art = b:CreateTexture(nil, "BACKGROUND")
  b.art:SetAllPoints()
  b.art:SetTexCoord(0, 0.68359375, 0, 0.7421875)
  skin(b, SHEET.dungeonUp, SHEET.dungeonDown, SHEET.dungeonLit)
  b.title = b:CreateFontString(nil, "OVERLAY", "GameFontNormalLarge")
  b.title:SetWidth(150)
  b.title:SetPoint("TOP", 0, -15)
  b.status = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  b.status:SetPoint("BOTTOMLEFT", 8, 21)
  b.range = b:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
  b.range:SetPoint("BOTTOMLEFT", 8, 8)
  dungeonButtons[i] = b
  return b
end

local function bossButton(i)
  if bossButtons[i] then return bossButtons[i] end
  local b = CreateFrame("Button", "MGADungeonQuestsBoss" .. i, bossChild)
  b:SetSize(325, 55)
  b:SetPoint("TOPLEFT", 4, -14 - (i - 1) * 57)
  skin(b, SHEET.bossUp, SHEET.bossDown, SHEET.bossLit)
  b.portrait = b:CreateTexture(nil, "OVERLAY")
  b.portrait:SetSize(128, 64)
  b.portrait:SetPoint("TOPLEFT", -4, 13)
  b.label = b:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  b.label:SetSize(205, 40)
  b.label:SetPoint("LEFT", 105, -3)
  b.label:SetJustifyH("LEFT")
  b.label:SetTextColor(0.827, 0.659, 0.463)
  bossButtons[i] = b
  return b
end

local function itemIcon(id)
  local icon = C_Item and C_Item.GetItemIconByID and C_Item.GetItemIconByID(id)
  if not icon and GetItemIcon then icon = GetItemIcon(id) end
  return icon or NO_ICON
end

-- What the client knows of an item, under whichever name this client has it.
local function itemInfo(id)
  local get = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  if get then return get(id) end
end

-- The colour code of the item's quality, once the client has the item.
local function itemColour(id)
  local quality = select(3, itemInfo(id))
  local colour = quality and ITEM_QUALITY_COLORS and ITEM_QUALITY_COLORS[quality]
  return colour and colour.hex or nil
end

local function linkItem(id)
  local link = select(2, itemInfo(id))
  if link and IsShiftKeyDown and IsShiftKeyDown() and ChatEdit_InsertLink then ChatEdit_InsertLink(link) end
end

local function lootButton(i)
  if lootButtons[i] then return lootButtons[i] end
  local b = CreateFrame("Button", "MGADungeonQuestsLoot" .. i, child)
  b:SetSize(TEXT_WIDTH, 45)
  b.icon = b:CreateTexture(nil, "BACKGROUND")
  b.icon:SetSize(42, 42)
  b.icon:SetPoint("TOPLEFT", 2, -2)
  local bar = fromSheet(b, "BORDER", SHEET.lootRow)
  bar:SetAllPoints()
  b.label = b:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  b.label:SetSize(215, 14)
  b.label:SetPoint("TOPLEFT", 51, -7)
  b.label:SetJustifyH("LEFT")
  b.sub = b:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  b.sub:SetSize(215, 12)
  b.sub:SetPoint("BOTTOMLEFT", 51, 7)
  b.sub:SetJustifyH("LEFT")
  b.sub:SetTextColor(0.902, 0.788, 0.671)
  b.chance = b:CreateFontString(nil, "OVERLAY", "GameFontBlack")
  b.chance:SetPoint("RIGHT", -6, 0)
  b:SetScript("OnEnter", function(self)
    if not GameTooltip then return end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetHyperlink("item:" .. self.itemId)
    GameTooltip:Show()
  end)
  b:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
  b:SetScript("OnClick", function(self) linkItem(self.itemId) end)
  lootButtons[i] = b
  return b
end

local function hideAll()
  for _, pool in ipairs({ dungeonButtons, bossButtons, lootButtons, texts, pins }) do
    for _, item in pairs(pool) do item:Hide() end -- pairs: a line with no Route button leaves a gap
  end
  if doorButton then doorButton:Hide() end
  lorePicture:Hide()
  loreBar:Hide()
  loreTitle:Hide()
end

-- A writer that stacks text down the right-hand page from y.
local function pageWriter(y)
  local page = { y = y, used = 0 }
  function page.put(text, width)
    page.used = page.used + 1
    local t = textAt(page.used, page.y, width or TEXT_WIDTH)
    t:SetText(text)
    page.y = page.y - t:GetStringHeight() - GAP
  end
  return page
end

-- Stacks the checklist's title, each line's heading + "Next:" (a Route button beside it) and its steps.
local function renderChecklist(list)
  local page = pageWriter(-4)
  page.put(list.title)
  for n, block in ipairs(list.blocks) do
    page.y = page.y - GAP
    local topY = page.y
    page.put(block.top, block.pin and (TEXT_WIDTH - PIN_WIDTH - GAP) or TEXT_WIDTH)
    if block.pin then
      local b, step = pinButton(n), block.pin
      b:ClearAllPoints()
      b:SetPoint("TOPRIGHT", child, "TOPRIGHT", -4, topY)
      b:SetScript("OnClick", function() M.StartRoute(step) end)
      b:Show()
    end
    page.put(block.body)
  end
  page.y = page.y - GAP
  page.put(list.footer)
  child:SetHeight(-page.y + 8)
end

local function renderOverview(dungeon)
  lorePicture:SetTexture(dungeon.art and dungeon.art.lore or ART.LORE)
  lorePicture:Show()
  loreBar:Show()
  loreTitle:SetText(dungeon.name)
  loreTitle:Show()
  local page = pageWriter(-LORE_HEIGHT - 12)
  for _, fact in ipairs(M.Overview(dungeon)) do page.put(WHITE .. fact .. "|r") end
  local door = M.DoorTarget(dungeon)
  if door and M.CanPin(door) then
    doorButton = doorButton or CreateFrame("Button", "MGADungeonQuestsDoorRoute", child, "UIPanelButtonTemplate")
    doorButton:SetSize(170, 24)
    doorButton:SetText("Route to the entrance")
    doorButton:ClearAllPoints()
    doorButton:SetPoint("TOPLEFT", 4, page.y)
    doorButton:SetScript("OnClick", function() M.StartRoute(door) end)
    doorButton:Show()
    page.y = page.y - 30
  end
  child:SetHeight(-page.y + 8)
end

local function renderLoot(dungeon, boss)
  local page = pageWriter(-4)
  page.put(GOLD .. (boss and boss.name or (dungeon.name .. " loot")) .. "|r")
  local rows = M.LootRows(dungeon, boss)
  for i, row in ipairs(rows) do
    local b = lootButton(i)
    b:ClearAllPoints()
    b:SetPoint("TOPLEFT", 4, page.y)
    b.itemId = row.id
    b.icon:SetTexture(itemIcon(row.id))
    local colour = itemColour(row.id)
    b.label:SetText(colour and (colour .. row.name .. "|r") or row.name)
    b.sub:SetText(row.sub)
    b.chance:SetText(row.chance)
    b:Show()
    page.y = page.y - LOOT_HEIGHT
  end
  page.y = page.y - GAP
  page.put(GREY .. (#rows == 0 and "No loot listed here." or "Drop chances are Classic's; Forever may differ.") .. "|r")
  child:SetHeight(-page.y + 8)
end

local function renderGrid()
  local rows = M.ListRows()
  for i, row in ipairs(rows) do
    local b = dungeonButton(i)
    local art = row.dungeon.art
    b.art:SetTexture(art and art.button or ART.BUTTON)
    b.title:SetText(row.name)
    b.status:SetText(row.status)
    b.range:SetText(row.range)
    if row.inRange then b.range:SetTextColor(0.25, 1, 0.25) else b.range:SetTextColor(1, 0.82, 0) end
    b:SetScript("OnClick", function() M.Show(row.dungeon) end)
    b:Show()
  end
  gridChild:SetHeight(math.ceil(#rows / 4) * 108)
end

local function renderBosses(dungeon)
  local list = dungeon.bosses or {}
  for i, boss in ipairs(list) do
    local b = bossButton(i)
    b.portrait:SetTexture(boss.portrait or ART.BOSS)
    b.label:SetText(boss.name)
    if boss == shownBoss then b:LockHighlight() else b:UnlockHighlight() end
    b:SetScript("OnClick", function()
      shownBoss = boss
      openTab("loot")
    end)
    b:Show()
  end
  bossChild:SetHeight(#list * 57 + 20)
end

local function renderTabs()
  for i, tab in ipairs(TABS) do
    local on, b = tab.key == shownTab, tabs[i]
    local back = on and SHEET.tabOn or SHEET.tabOff
    b.back:SetTexCoord(back[1], back[2], back[3], back[4])
    if tab.file then
      b.icon:SetAlpha(on and 1 or 0.6)
    else
      local c = on and tab.on or tab.off
      b.icon:SetTexCoord(c[1], c[2], c[3], c[4])
    end
  end
end

local function renderCrumbs()
  if shown then
    crumbs.dungeon:SetText(shown.name)
    crumbs.dungeon:Show()
  else
    crumbs.dungeon:Hide()
  end
  if shown and shownBoss then
    crumbs.boss:SetText(shownBoss.name)
    crumbs.boss:Show()
  else
    crumbs.boss:Hide()
  end
end

render = function()
  hideAll()
  renderCrumbs()
  if not shown then
    book:Hide()
    grid:Show()
    renderGrid()
    return
  end
  grid:Hide()
  book:Show()
  renderBosses(shown)
  renderTabs()
  if shownTab == "overview" then
    renderOverview(shown)
  elseif shownTab == "loot" then
    renderLoot(shown, shownBoss)
  else
    renderChecklist(M.Checklist(shown))
  end
end

-- Opens the journal on a dungeon's quests (nil = the grid of dungeons).
function M.Show(dungeon)
  frame = frame or newFrame()
  shown, shownBoss, shownTab = dungeon, nil, "quests"
  render()
  resetScroll()
  frame:Show()
end

-- Dungeon focus -------------------------------------------------------------------------------
-- Inside a dungeon, a tracker lists only that dungeon's quests: each one's objectives live from your
-- quest log, what's ready to turn in, and what you never picked up. Your quest tracker shows only those
-- quests while you're inside, and goes back to what it showed when you leave. A boss kill, and leaving,
-- name anything still to do, so nothing is missed and the dungeon needn't be run again.

local FOCUS_TODO, FOCUS_DONE = "|cffffd100-|r", "|TInterface\\RaidFrame\\ReadyCheck-Ready:12|t"
local focusFrame, focused = nil, nil -- the tracker, and the dungeon it's for (nil = not in one)
local focusClosed = false -- closed with its X: stays closed for this visit

local function focusOn()
  return not (MGADungeonQuestsSettings and MGADungeonQuestsSettings.focus == false)
end

local function logIndex(id)
  if GetQuestLogIndexByID then
    local i = GetQuestLogIndexByID(id)
    if i and i > 0 then return i end
  end
  return nil
end

-- A quest's objectives as the game tracks them: { {text, done} }, or nil when the client can't say.
function M.QuestObjectives(id)
  if C_QuestLog and C_QuestLog.GetQuestObjectives then
    local list = C_QuestLog.GetQuestObjectives(id)
    if list and #list > 0 then
      local out = {}
      for i, o in ipairs(list) do out[i] = { text = o.text or "", done = o.finished and true or false } end
      return out
    end
  end
  local index = logIndex(id)
  if index and GetNumQuestLeaderBoards and GetQuestLogLeaderBoard then
    local out = {}
    for j = 1, GetNumQuestLeaderBoards(index) or 0 do
      local text, _, finished = GetQuestLogLeaderBoard(j, index)
      out[#out + 1] = { text = text or "", done = finished and true or false }
    end
    if #out > 0 then return out end
  end
  return nil
end

-- The quests done inside a dungeon that you haven't turned in, in your lines' order:
-- { step, state, objectives }, state = "complete", true (in your log) or false (not picked up).
function M.FocusQuests(dungeon)
  local out, inLog = {}, M.QuestsInLog()
  for _, line in ipairs(M.LinesFor(dungeon)) do
    local done = M.DoneSteps(line, inLog)
    for i, step in ipairs(line.steps) do
      if step.dungeon and not done[i] then
        local state = inLog[step.id] or false
        local objectives = nil
        if state == true then
          objectives = M.QuestObjectives(step.id)
          if not objectives then
            objectives = {}
            for j, text in ipairs(step.objectives or {}) do objectives[j] = { text = text, done = false } end
          end
        end
        out[#out + 1] = { step = step, state = state, objectives = objectives }
      end
    end
  end
  return out
end

-- What's still to do here: one line per quest you have that isn't finished, with its open objectives.
function M.LeftToDo(dungeon)
  local left = {}
  for _, q in ipairs(M.FocusQuests(dungeon)) do
    if q.state == true then
      local open = {}
      for _, o in ipairs(q.objectives) do
        if not o.done then open[#open + 1] = o.text end
      end
      if #open > 0 then left[#left + 1] = q.step.title .. " (" .. table.concat(open, ", ") .. ")"
      elseif #q.objectives == 0 then left[#left + 1] = q.step.title end
    end
  end
  return left
end

-- The tracker's text: what to do here (objective by objective), what's done, what you never picked up.
function M.FocusText(dungeon)
  local doing, ready, missing = {}, {}, {}
  for _, q in ipairs(M.FocusQuests(dungeon)) do
    if q.state == "complete" then
      ready[#ready + 1] = FOCUS_DONE .. " " .. q.step.title
    elseif q.state then
      doing[#doing + 1] = "|cffffffff" .. q.step.title .. "|r"
      for _, o in ipairs(q.objectives) do
        doing[#doing + 1] = o.done and ("   " .. FOCUS_DONE .. " |cff808080" .. o.text .. "|r") or ("   " .. FOCUS_TODO .. " " .. o.text)
      end
      if #q.objectives == 0 then doing[#doing + 1] = "   |cff808080its goals are in your quest log|r" end
    else
      local from = giverText(q.step)
      missing[#missing + 1] = "|cffff6060" .. q.step.title .. "|r" .. (from and ("\n   |cff808080" .. from .. "|r") or "")
    end
  end
  local out = {}
  local function group(heading, rows)
    if #rows == 0 then return end
    out[#out + 1] = "|cffffd100" .. heading .. "|r"
    for _, r in ipairs(rows) do out[#out + 1] = r end
  end
  group("To do here", doing)
  group("Done - turn in when you're out", ready)
  group("Not picked up - you'd miss these", missing)
  if #out == 0 then out[1] = "|cff20ff20Every quest for this dungeon is done.|r" end
  return table.concat(out, "\n")
end

local function newFocusFrame()
  local f = CreateFrame("Frame", "MGADungeonQuestsFocus", UIParent)
  f:SetSize(300, 60)
  f:SetPoint("TOPRIGHT", -40, -220)
  f:SetFrameStrata("MEDIUM")
  f:SetMovable(true)
  f:EnableMouse(true)
  f:RegisterForDrag("LeftButton")
  f:SetScript("OnDragStart", f.StartMoving)
  f:SetScript("OnDragStop", f.StopMovingOrSizing)
  local back = f:CreateTexture(nil, "BACKGROUND")
  back:SetAllPoints()
  back:SetColorTexture(0, 0, 0, 0.7)
  f.heading = f:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  f.heading:SetPoint("TOPLEFT", 10, -8)
  f.heading:SetWidth(250)
  f.heading:SetJustifyH("LEFT")
  f.body = f:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  f.body:SetPoint("TOPLEFT", 10, -28)
  f.body:SetWidth(280)
  f.body:SetJustifyH("LEFT")
  local close = CreateFrame("Button", "MGADungeonQuestsFocusClose", f, "UIPanelCloseButton")
  close:SetSize(24, 24)
  close:SetPoint("TOPRIGHT", 0, 0)
  close:SetScript("OnClick", function()
    focusClosed = true
    f:Hide()
  end)
  return f
end

-- Draws the tracker for the dungeon you're in, or hides it.
function M.DrawFocus()
  if not focused or not focusOn() or focusClosed or #M.LinesFor(focused) == 0 then
    if focusFrame then focusFrame:Hide() end
    return
  end
  focusFrame = focusFrame or newFocusFrame()
  focusFrame.heading:SetText(focused.name .. " quests")
  focusFrame.body:SetText(M.FocusText(focused))
  focusFrame:SetHeight(40 + (focusFrame.body:GetStringHeight() or 0))
  focusFrame:Show()
end

-- The quest tracker. Forever's watch list is by quest id (C_QuestLog); the classic one by quest log index.
-- Questie draws its own tracker and follows only the C_QuestLog calls, and it can show quests the game
-- doesn't watch (its "auto track"), so what it shows is asked of Questie itself.
local modernWatch = C_QuestLog and C_QuestLog.AddQuestWatch and C_QuestLog.RemoveQuestWatch
  and C_QuestLog.GetNumQuestWatches and C_QuestLog.GetQuestIDForQuestWatchIndex

local function canWatch()
  return modernWatch or (GetNumQuestWatches and GetQuestIndexForWatch and GetQuestLogTitle and AddQuestWatch and RemoveQuestWatch)
end

local function questieTracker()
  if not (QuestieLoader and QuestieLoader.ImportModule) then return nil end
  local ok, tracker = pcall(QuestieLoader.ImportModule, QuestieLoader, "QuestieTracker")
  return ok and tracker and tracker.IsTrackedByQuestie and tracker or nil
end

-- The quest ids the tracker shows now.
local function watchedIds()
  local ids, seen = {}, {}
  local function add(id)
    if id and id > 0 and not seen[id] then
      seen[id] = true
      ids[#ids + 1] = id
    end
  end
  if modernWatch then
    for i = 1, C_QuestLog.GetNumQuestWatches() or 0 do add(C_QuestLog.GetQuestIDForQuestWatchIndex(i)) end
  else
    for i = 1, GetNumQuestWatches() or 0 do
      local index = GetQuestIndexForWatch(i)
      add(index and select(8, GetQuestLogTitle(index)))
    end
  end
  local questie = questieTracker()
  if questie then
    for _, q in ipairs(scanLog()) do
      local ok, tracked = pcall(questie.IsTrackedByQuestie, q.id)
      if ok and tracked then add(q.id) end
    end
  end
  return ids
end

local function setWatch(id, on)
  if modernWatch then
    if on then C_QuestLog.AddQuestWatch(id) else C_QuestLog.RemoveQuestWatch(id) end
    return
  end
  local index = logIndex(id)
  if not index then return end
  if on then AddQuestWatch(index) else RemoveQuestWatch(index) end
end

local function trackerChanged()
  if QuestWatch_Update then pcall(QuestWatch_Update) end
end

-- Shows only this dungeon's quests in the quest tracker, keeping what it showed per character, so a
-- disconnect inside still puts it back the next time you're out.
local function focusTracker(dungeon)
  if not canWatch() then return end
  local before = watchedIds()
  MGADungeonQuestsCharacter = MGADungeonQuestsCharacter or {}
  if not MGADungeonQuestsCharacter.watchedBefore then MGADungeonQuestsCharacter.watchedBefore = before end
  local mine = {}
  for _, q in ipairs(M.FocusQuests(dungeon)) do
    if q.state then mine[#mine + 1] = q.step.id end
  end
  local isMine = {}
  for _, id in ipairs(mine) do isMine[id] = true end
  for _, id in ipairs(before) do
    if not isMine[id] then setWatch(id, false) end
  end
  for _, id in ipairs(mine) do setWatch(id, true) end
  trackerChanged()
end

-- Puts the quest tracker back as it was before the dungeon.
local function restoreTracker()
  local before = MGADungeonQuestsCharacter and MGADungeonQuestsCharacter.watchedBefore
  if not before or not canWatch() then return end
  MGADungeonQuestsCharacter.watchedBefore = nil
  local keep = {}
  for _, id in ipairs(before) do keep[id] = true end
  for _, id in ipairs(watchedIds()) do
    if not keep[id] then setWatch(id, false) end
  end
  for _, id in ipairs(before) do setWatch(id, true) end
  trackerChanged()
end

-- A dungeon quest picked up inside joins the tracker.
function M.QuestAccepted(id)
  if not focused or not focusOn() or not (MGADungeonQuestsCharacter and MGADungeonQuestsCharacter.watchedBefore) then return end
  for _, q in ipairs(M.FocusQuests(focused)) do
    if q.step.id == id then
      setWatch(id, true)
      trackerChanged()
      return
    end
  end
end

local function warnScreen(text)
  if RaidNotice_AddMessage and RaidWarningFrame and ChatTypeInfo and ChatTypeInfo.RAID_WARNING then
    RaidNotice_AddMessage(RaidWarningFrame, text, ChatTypeInfo.RAID_WARNING)
  end
end

-- After a boss dies, what's still to do here; after the dungeon's last boss, on screen as well.
function M.BossKilled(bossName)
  if not focused or not focusOn() then return end
  local left = M.LeftToDo(focused)
  if #left == 0 then return end
  local bosses = focused.bosses or {}
  local last = bosses[#bosses] ~= nil and bosses[#bosses].name == bossName
  say((last and "don't leave yet. " or "") .. "Still to do in " .. focused.name .. ": " .. table.concat(left, "; ") .. ".")
  if last then warnScreen("Don't leave yet: " .. #left .. (#left == 1 and " quest" or " quests") .. " unfinished here") end
end

-- Entering, leaving, or moving between instances.
function M.UpdateFocus()
  local d = currentDungeon()
  if d == focused then return M.DrawFocus() end
  local left = (focused and focusOn()) and M.LeftToDo(focused) or {}
  if #left > 0 and not d then
    say("you left " .. focused.name .. " with these unfinished: " .. table.concat(left, "; ") .. ".")
    warnScreen("You left " .. focused.name .. " with quests unfinished")
  end
  focused, focusClosed = d, false
  if d and focusOn() then focusTracker(d) else restoreTracker() end
  M.DrawFocus()
end

function M.SetFocus(on)
  MGADungeonQuestsSettings = MGADungeonQuestsSettings or {}
  MGADungeonQuestsSettings.focus = on
  focusClosed = false
  if focused and on then focusTracker(focused) elseif not on then restoreTracker() end
  M.DrawFocus()
end

-- Slash command and events -------------------------------------------------------------------

local function remindersOn()
  return not (MGADungeonQuestsSettings and MGADungeonQuestsSettings.remind == false)
end

local reminded = nil -- the dungeon last reminded about; cleared once you're out, so each visit reminds once

local function remind()
  local d = currentDungeon()
  if not d then reminded = nil return end
  if not remindersOn() or d == reminded or #M.LinesFor(d) == 0 then return end
  reminded = d
  local left = M.ToPickUp(d, M.QuestsInLog())
  if left > 0 then
    say(d.name .. ": " .. left .. (left == 1 and " quest" or " quests") .. " for it you haven't picked up. The MGA menu opens the journal.")
  end
end

-- Craftsman's Writs: where each is delivered is in no game data, only marked on your map while you
-- hold it. Note each writ quest's marker in writSpots (account-wide) for the site's Crafting writs page.
local WRIT_PREFIX = "Craftsman's Writ: "
local AZEROTH_MAP = 947
local ZONE_MAP_TYPE = 3
local SAME_WRIT_SPOT = 1
local WRIT_RETRY_SECONDS = 5
local writNoted, writTried = {}, {}

local function writMarker(id)
  if C_QuestLog and C_QuestLog.GetNextWaypoint then
    local map, x, y = C_QuestLog.GetNextWaypoint(id)
    if map and x and y then return map, x, y end
  end
  if not (C_QuestLog and C_QuestLog.GetQuestsOnMap and C_Map and C_Map.GetMapChildrenInfo) then return nil end
  local zoneType = (Enum and Enum.UIMapType and Enum.UIMapType.Zone) or ZONE_MAP_TYPE
  for _, zone in ipairs(C_Map.GetMapChildrenInfo(AZEROTH_MAP, zoneType, true) or {}) do
    for _, q in ipairs(C_QuestLog.GetQuestsOnMap(zone.mapID) or {}) do
      if q.questID == id and q.x and q.y then return zone.mapID, q.x, q.y end
    end
  end
end

local function round1(v) return math.floor(v * 1000 + 0.5) / 10 end

-- One writ's spot into writSpots; true when it's a place not noted before.
-- nil: not saved (map or faction not known yet); false: a place already noted (its date refreshed); true, spot: a new place.
local function noteWritSpot(id, map, x, y)
  local info = C_Map and C_Map.GetMapInfo and C_Map.GetMapInfo(map)
  local faction = UnitFactionGroup and UnitFactionGroup("player")
  if not (info and info.name and faction) then return nil end
  MGADungeonQuestsSettings = MGADungeonQuestsSettings or {}
  MGADungeonQuestsSettings.writSpots = MGADungeonQuestsSettings.writSpots or {}
  local spots = MGADungeonQuestsSettings.writSpots[id] or {}
  MGADungeonQuestsSettings.writSpots[id] = spots
  local spot = { zone = info.name, map = map, x = round1(x), y = round1(y), seen = date and date("%Y-%m-%d") or "", faction = faction:lower() }
  for _, s in ipairs(spots) do
    if s.map == map and s.faction == spot.faction and math.abs(s.x - spot.x) <= SAME_WRIT_SPOT and math.abs(s.y - spot.y) <= SAME_WRIT_SPOT then
      s.seen = spot.seen
      return false
    end
  end
  spots[#spots + 1] = spot
  return true, spot
end

-- Every writ in your log: note where it goes. Returns the writs whose marker the client didn't give.
function M.RecordWrits(force)
  local now = GetTime and GetTime() or 0
  local unplaced = {}
  for _, q in ipairs(scanLog()) do
    if q.title:sub(1, #WRIT_PREFIX) == WRIT_PREFIX and not writNoted[q.id] then
      if force or not writTried[q.id] or now - writTried[q.id] >= WRIT_RETRY_SECONDS then
        writTried[q.id] = now
        local map, x, y = writMarker(q.id)
        if map then
          local new, spot = noteWritSpot(q.id, map, x, y)
          if new == nil then
            unplaced[#unplaced + 1] = q.title
          else
            writNoted[q.id] = true
            if new then say(string.format("noted where %s goes: %s %.1f, %.1f.", q.title, spot.zone, spot.x, spot.y)) end
          end
        else
          unplaced[#unplaced + 1] = q.title
        end
      else
        unplaced[#unplaced + 1] = q.title
      end
    end
  end
  return unplaced
end

local function writsCommand()
  local unplaced = M.RecordWrits(true)
  local count = 0
  for _ in pairs((MGADungeonQuestsSettings and MGADungeonQuestsSettings.writSpots) or {}) do count = count + 1 end
  say(string.format("%d writ%s noted so far. Pick up a writ and it's noted on its own; the site's Crafting writs page shows them after the next data refresh.", count, count == 1 and "" or "s"))
  if #unplaced > 0 then say("the game hasn't marked where these go yet: " .. table.concat(unplaced, ", ") .. ".") end
end

-- The settings the slash command and the MGA settings window both change.
local function setPins(on)
  MGADungeonQuestsSettings = MGADungeonQuestsSettings or {}
  MGADungeonQuestsSettings.turnInPins = on
  M.DrawTurnInPins()
end

local function setRemind(on)
  MGADungeonQuestsSettings = MGADungeonQuestsSettings or {}
  MGADungeonQuestsSettings.remind = on
end

SLASH_MGADUNGEONQUESTS1 = "/mgadq"
SLASH_MGADUNGEONQUESTS2 = "/mgadungeonquests"
SlashCmdList.MGADUNGEONQUESTS = function(msg)
  msg = (msg or ""):match("^%s*(.-)%s*$")
  local word, rest = msg:match("^(%S+)%s*(.*)$")
  word = word and word:lower()
  if word == "help" then
    say("/mgadq opens the dungeon you're in, else the journal. /mgadq <dungeon> (deadmines, sfk, vc...) opens one. /mgadq list. " ..
      "/mgadq turnin routes you through your finished quests. /mgadq pins on|off shows them on the World Map. /mgadq writs: the writs noted so far. /mgadq remind on|off. " ..
      "/mgadq focus on|off: inside a dungeon, track only its quests.")
  elseif word == "list" then
    M.Show(nil)
  elseif word == "writs" or word == "writ" then
    writsCommand()
  elseif word == "turnin" or word == "turnins" or word == "turn-in" or word == "turn-ins" then
    M.StartTurnIns()
  elseif word == "pins" then
    setPins(rest:lower() ~= "off")
    say("World Map pins on your finished quests " .. (pinsOn() and "on." or "off."))
  elseif word == "remind" then
    setRemind(rest:lower() ~= "off")
    say("reminder on entering a dungeon " .. (remindersOn() and "on." or "off."))
  elseif word == "focus" then
    M.SetFocus(rest:lower() ~= "off")
    say("dungeon focus " .. (focusOn() and "on: inside a dungeon you'll see only its quests." or "off."))
  elseif msg == "" then
    M.Show(currentDungeon())
  else
    local d = M.Find(msg)
    if d then M.Show(d) else say("no dungeon matches \"" .. msg .. "\". /mgadq list shows them all.") end
  end
end

-- The MGA button's menu and settings window.
local UI = MGAHub.UI

MGAHub.Register({
  name = "Dungeon Quests",
  order = 10,
  menu = {
    { text = "Dungeon journal", func = function() M.Show(currentDungeon()) end },
    { text = "Turn in finished quests", func = M.StartTurnIns },
    { text = "Crafting writs", func = writsCommand },
  },
  settings = function(section, top)
    local pins = UI.Check(section, "MGADungeonQuestsOptions_pins", "Show finished quests on the World Map", "A pin where each one is handed in", top, -10, setPins)
    local remind = UI.Check(section, "MGADungeonQuestsOptions_remind", "Remind me of a dungeon's quests when I walk in", nil, pins, -6, setRemind)
    local focus = UI.Check(section, "MGADungeonQuestsOptions_focus", "Inside a dungeon, track only its quests", nil, remind, -6, M.SetFocus)
    function section.refresh()
      pins:SetChecked(pinsOn())
      remind:SetChecked(remindersOn())
      focus:SetChecked(focusOn())
    end
    section.refresh()
    return 130
  end,
})

-- Items arrive from the server one by one: redraw the Loot tab once for a batch of them.
local lootRedrawQueued = false
local function redrawLoot()
  lootRedrawQueued = false
  if frame and frame:IsShown() and shown and shownTab == "loot" then render() end
end

local function itemArrived()
  if not (C_Timer and C_Timer.After) then return redrawLoot() end
  if lootRedrawQueued then return end
  lootRedrawQueued = true
  C_Timer.After(0.2, redrawLoot)
end

local events = CreateFrame("Frame")
for _, e in ipairs({ "PLAYER_ENTERING_WORLD", "ADDON_LOADED", "QUEST_ACCEPTED", "QUEST_TURNED_IN", "QUEST_REMOVED", "QUEST_LOG_UPDATE", "PLAYER_LEVEL_UP", "GET_ITEM_INFO_RECEIVED", "TAXIMAP_OPENED" }) do
  events:RegisterEvent(e)
end
-- A boss kill; an event the client doesn't have is left out rather than erroring.
pcall(events.RegisterEvent, events, "ENCOUNTER_END")
local QUEST_EVENTS = { QUEST_ACCEPTED = true, QUEST_TURNED_IN = true, QUEST_REMOVED = true, QUEST_LOG_UPDATE = true }

local function later(seconds, fn)
  if C_Timer and C_Timer.After then C_Timer.After(seconds, fn) else fn() end
end

events:SetScript("OnEvent", function(_, event, arg1, arg2, ...)
  if QUEST_EVENTS[event] then
    M.RecordWrits()
    M.CheckTurnIns()
    if WorldMapFrame and WorldMapFrame:IsShown() then M.DrawTurnInPins() end
    if event == "QUEST_ACCEPTED" and arg2 then M.QuestAccepted(arg2) end
    M.DrawFocus()
  end
  if event == "ENCOUNTER_END" then
    local success = select(3, ...)
    -- The kill's quest credit lands just after the encounter ends.
    if success == 1 or success == true then later(1, function() M.BossKilled(arg2) end) end
    return
  end
  if event == "ADDON_LOADED" then
    if arg1 == "Blizzard_WorldMap" then M.HookWorldMap() end
  elseif event == "TAXIMAP_OPENED" then
    M.RememberFlights()
    M.ReplanRoute()
  elseif event == "PLAYER_ENTERING_WORLD" then
    M.HookWorldMap()
    M.ReplanRoute()
    if arg2 then return M.UpdateFocus() end -- a reload
    -- The quest log and completed quests may not be filled in yet as the loading screen ends.
    later(3, function()
      remind()
      M.UpdateFocus()
    end)
  elseif event == "GET_ITEM_INFO_RECEIVED" then
    itemArrived()
  elseif frame and frame:IsShown() then
    render()
  end
end)
