-- MGA PvP Log: logs the enemy players who fight or kill you, and the ones you kill. Open the window from the
-- MGA menu ("PvP log") or with /mgapvp. When you die to an enemy player it prints one chat line:
--   MGA PvP Log: Killed by <Name> (<Race> <Class> <level if known>) with <Spell> in <Zone>
--
-- The log is Core.lua, the window is Window.lua; this file listens for the game's events.
--   /mgapvp          open or close the window
--   /mgapvp chat     turn the death chat line off or on
--   /mgapvp track <name>    add a player to the kill-on-sight list (untrack <name> removes them)
-- Track.lua warns when a tracked player turns up near you.

local M = MGAPvPLog
local PREFIX = "|cff33aaffMGA PvP Log:|r "
local SWEEP_SECONDS = 5

local function say(text)
  DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. text)
end

local function setChat(on)
  M.DB().settings.chat = on and true or false
end

local optionsSection

local function setting(name)
  return function(on) M.DB().settings[name] = on and true or false end
end

local function buildOptions(section, top)
  local UI = MGAHub.UI
  local chat = UI.Check(section, "MGAPvPLogOptions_chat", "Say it in chat when an enemy player kills you", nil, top, -10, setChat)
  local auto = UI.Check(section, "MGAPvPLogOptions_autoTrack", "Track whoever kills you (kill-on-sight list)", nil, chat, -6, setting("autoTrack"))
  local fx = UI.Check(section, "MGAPvPLogOptions_alertFx", "Sound and banner when a tracked player is near", nil, auto, -6, setting("alertFx"))
  function section.refresh()
    local s = M.DB().settings
    chat:SetChecked(s.chat)
    auto:SetChecked(s.autoTrack ~= false)
    fx:SetChecked(s.alertFx ~= false)
  end
  optionsSection = section
  section.refresh()
  return 110
end

MGAHub.Register({
  name = "PvP Log",
  order = 35,
  menu = {
    { text = "PvP log", func = function() M.Toggle() end },
  },
  settings = buildOptions,
})

local events = CreateFrame("Frame", "MGAPvPLogEvents")
events:RegisterEvent("COMBAT_LOG_EVENT_UNFILTERED")
events:RegisterEvent("PLAYER_DEAD")
events:RegisterEvent("PLAYER_LOGOUT")
events:RegisterEvent("PLAYER_TARGET_CHANGED")
events:RegisterEvent("UPDATE_MOUSEOVER_UNIT")
events:RegisterEvent("NAME_PLATE_UNIT_ADDED")

local sinceSweep = 0
events:SetScript("OnUpdate", function(_, elapsed)
  sinceSweep = sinceSweep + elapsed
  if sinceSweep >= SWEEP_SECONDS then
    sinceSweep = 0
    M.Flush(time())
    M.ScanGroup()
  end
end)

local function onCombat(...)
  M.Combat(...)
  M.TrackCombat(...)
end

events:SetScript("OnEvent", function(_, event, unit)
  if event == "COMBAT_LOG_EVENT_UNFILTERED" then
    onCombat(CombatLogGetCurrentEventInfo())
  elseif event == "PLAYER_DEAD" then
    M.Died(time())
  elseif event == "PLAYER_LOGOUT" then
    M.Flush(time(), true)
  elseif event == "PLAYER_TARGET_CHANGED" then
    M.LearnUnit("target")
    M.TrackUnit("target")
  elseif event == "UPDATE_MOUSEOVER_UNIT" then
    M.LearnUnit("mouseover")
    M.TrackUnit("mouseover")
  elseif event == "NAME_PLATE_UNIT_ADDED" and unit then
    M.LearnUnit(unit)
    M.TrackUnit(unit)
  end
end)

SLASH_MGAPVPLOG1 = "/mgapvp"
SlashCmdList.MGAPVPLOG = function(message)
  local command, rest = (message or ""):match("^%s*(%S*)%s*(.-)%s*$")
  command = command:lower()
  if (command == "track" or command == "untrack") and rest ~= "" then
    M.SetTracked(rest, command == "track")
    say(rest .. (command == "track" and " is on the kill-on-sight list." or " is off the kill-on-sight list."))
  elseif command == "chat" then
    setChat(not M.DB().settings.chat)
    if optionsSection then optionsSection.refresh() end
    say("death chat line " .. (M.DB().settings.chat and "on" or "off") .. ".")
  else
    M.Toggle()
  end
end
