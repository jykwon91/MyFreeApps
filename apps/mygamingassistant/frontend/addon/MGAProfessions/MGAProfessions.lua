-- MGA Professions: the site's profession guides in game. Open it from the MGA menu ("Professions"), the key
-- binding "Open MGA Professions", or the "MGA guide" button on the trade-skill window.
--
-- Everything is data from the site (Data.lua); the logic is Core.lua and the window is Window.lua.
-- The trade-skill button is attached to whichever profession window the client shows; if none is found the
-- button is simply not added (the menu and the key binding always work).

local M = MGAProfessions

BINDING_NAME_MGA_PROFESSIONS = "Open MGA Professions"

-- Windows the trade-skill button may sit on: Forever's ProfessionsFrame is the expected one.
local WINDOWS = { "ProfessionsFrame", "TradeSkillFrame", "CraftFrame" }

-- Which profession the open trade-skill window is, by skill line id (never by name: Mining's window says "Smelting").
function M.OpenTradeSkillKey()
  local line
  if C_TradeSkillUI and C_TradeSkillUI.GetBaseProfessionInfo then
    local ok, info = pcall(C_TradeSkillUI.GetBaseProfessionInfo)
    if ok and type(info) == "table" then line = info.professionID or info.parentProfessionID end
  end
  if not line and C_TradeSkillUI and C_TradeSkillUI.GetTradeSkillLine then
    local ok, id = pcall(C_TradeSkillUI.GetTradeSkillLine)
    if ok and type(id) == "number" then line = id end
  end
  return line and M.KeyForSkillLine(line) or nil
end

local button

local function openFromTradeSkill()
  local key = M.OpenTradeSkillKey()
  M.Open(key)
end

function M.AttachTradeSkillButton()
  if button then return button end
  for _, name in ipairs(WINDOWS) do
    local window = _G[name]
    if window then
      button = CreateFrame("Button", "MGAProfessionsTradeButton", window, "UIPanelButtonTemplate")
      button:SetSize(90, 22)
      button:SetText("MGA guide")
      button:SetPoint("TOPRIGHT", window, "TOPRIGHT", -60, -30)
      button:SetScript("OnClick", openFromTradeSkill)
      return button
    end
  end
end

local function onTradeSkill()
  M.AttachTradeSkillButton()
  if M.ScanKnown() > 0 then M.Refresh() end
end

MGAHub.Register({
  name = "Professions",
  order = 12,
  menu = {
    { text = "Professions", func = function() M.Toggle() end },
  },
})

local events = CreateFrame("Frame", "MGAProfessionsEvents")
events:RegisterEvent("TRADE_SKILL_SHOW")
events:RegisterEvent("TRADE_SKILL_LIST_UPDATE")
events:RegisterEvent("ADDON_LOADED")
events:RegisterEvent("BANKFRAME_OPENED")
events:RegisterEvent("BAG_UPDATE_DELAYED")
events:RegisterEvent("SKILL_LINES_CHANGED")
events:SetScript("OnEvent", function(_, event, addon)
  if event == "TRADE_SKILL_SHOW" or event == "TRADE_SKILL_LIST_UPDATE" then
    onTradeSkill()
  elseif event == "ADDON_LOADED" then
    if addon == "Blizzard_Professions" or addon == "Blizzard_TradeSkillUI" then M.AttachTradeSkillButton() end
  elseif event == "BANKFRAME_OPENED" then
    M.SaveBank()
    M.Refresh()
  else
    M.Refresh()
  end
end)
