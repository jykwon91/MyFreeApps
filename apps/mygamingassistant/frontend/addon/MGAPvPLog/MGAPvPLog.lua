-- MGA PvP Log: logs the enemy players who fight or kill you, and the ones you kill. Open the window from the
-- MGA menu ("PvP log") or with /mgapvp. When you die to an enemy player it prints one chat line:
--   MGA PvP Log: Killed by <Name> (<Race> <Class> <level if known>) with <Spell> in <Zone>
--
-- The log is Core.lua, the window is Window.lua; this file listens for the game's events.
--   /mgapvp          open or close the window
--   /mgapvp chat     turn the death chat line off or on

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

local function buildOptions(section, top)
  local chat = MGAHub.UI.Check(section, "MGAPvPLogOptions_chat", "Say it in chat when an enemy player kills you", nil, top, -10, setChat)
  function section.refresh()
    chat:SetChecked(M.DB().settings.chat)
  end
  optionsSection = section
  section.refresh()
  return 60
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
  end
end)

events:SetScript("OnEvent", function(_, event, unit)
  if event == "COMBAT_LOG_EVENT_UNFILTERED" then
    M.Combat(CombatLogGetCurrentEventInfo())
  elseif event == "PLAYER_DEAD" then
    M.Died(time())
  elseif event == "PLAYER_LOGOUT" then
    M.Flush(time(), true)
  elseif event == "PLAYER_TARGET_CHANGED" then
    M.LearnUnit("target")
  elseif event == "UPDATE_MOUSEOVER_UNIT" then
    M.LearnUnit("mouseover")
  elseif event == "NAME_PLATE_UNIT_ADDED" and unit then
    M.LearnUnit(unit)
  end
end)

SLASH_MGAPVPLOG1 = "/mgapvp"
SlashCmdList.MGAPVPLOG = function(message)
  local command = (message or ""):lower():match("^%s*(%S*)")
  if command == "chat" then
    setChat(not M.DB().settings.chat)
    if optionsSection then optionsSection.refresh() end
    say("death chat line " .. (M.DB().settings.chat and "on" or "off") .. ".")
  else
    M.Toggle()
  end
end
