-- MGA hub: the one minimap button, menu and settings window every MGA addon shares.
--
-- SOURCE OF TRUTH. This file is copied, byte for byte, into every MGA addon folder
-- (addon/<Addon>/MGAHub.lua) and listed FIRST in each .toc, because the addons install
-- on their own and the hub has to work with any of them, with no extra addon to install.
-- A test fails when a copy differs: edit this file, then copy it over the others.
--
-- Whichever addon loads first defines the global MGAHub; a later copy only replaces it
-- when its VERSION is higher (keeping what was registered). Each addon then calls
--
--   MGAHub.Register({
--     name = "Loot",                      -- the menu heading and settings section title
--     order = 20,                         -- where it sits among the others (lower is first)
--     menu = { { text = "...", func = fn } },   -- text may be a function; omit for no menu entries
--     settings = function(section, top) ... return height end,
--   })
--
-- `settings` fills `section` (a frame) with widgets anchored below `top` (the section's
-- heading) and returns how tall they are; it may set section.refresh to re-read its
-- saved values whenever the window opens. MGAHub.UI has the widgets (Label, Check,
-- Button, Dropdown) so every section looks the same.
--
-- Saved: MGAHubSettings (angle = where the button sits on the minimap ring, hidden).
-- Every addon's .toc lists it, so it is saved whichever addons are installed.
--
-- Written for the WoW Forever client (Classic Era interface 16001). The key bindings
-- (Bindings.xml, in every addon folder) call MGAHub.OpenMenu and MGAHub.OpenSettings.

local VERSION = 2

local previous = _G.MGAHub
if previous and previous.version >= VERSION then return end

local Hub = { version = VERSION, addons = {} }
if previous then
  for _, spec in ipairs(previous.addons) do table.insert(Hub.addons, spec) end
  if previous.events then previous.events:SetScript("OnEvent", nil) end
end
_G.MGAHub = Hub

local TITLE = "MGA"
local PREFIX = "|cff33aaff" .. TITLE .. ":|r "
local DEFAULT_ANGLE = math.rad(165) -- left edge: clear of the 225° spot LibDBIcon buttons (Questie) default to
local RING_GAP = 10 -- how far the button's centre sits outside the minimap's edge
local MENU_WIDTH, ROW_HEIGHT, GAP_HEIGHT, PAD = 240, 22, 8, 8
local SECTION_WIDTH, HEADING_HEIGHT, SECTION_GAP = 560, 28, 18
local GOLD = "|cffffd100"

BINDING_HEADER_MGA = TITLE
BINDING_CATEGORY_MGA = TITLE
BINDING_NAME_MGA_MENU = "Open MGA menu"
BINDING_NAME_MGA_SETTINGS = "Open MGA settings"

local function say(text)
  DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. text)
end

local function settings()
  MGAHubSettings = MGAHubSettings or {}
  return MGAHubSettings
end

function Hub.Register(spec)
  for i, existing in ipairs(Hub.addons) do
    if existing.name == spec.name then
      Hub.addons[i] = spec
      return
    end
  end
  table.insert(Hub.addons, spec)
  table.sort(Hub.addons, function(a, b)
    local ao, bo = a.order or 100, b.order or 100
    if ao ~= bo then return ao < bo end
    return a.name < b.name
  end)
end

-- Frames ----------------------------------------------------------------------------

-- A frame with the tooltip-style border: newer clients need the BackdropTemplate for it.
local function backdropFrame(name, parent)
  local ok, frame = pcall(CreateFrame, "Frame", name, parent, "BackdropTemplate")
  if not (ok and frame) then frame = CreateFrame("Frame", name, parent) end
  if frame.SetBackdrop then
    frame:SetBackdrop({
      bgFile = "Interface\\Tooltips\\UI-Tooltip-Background",
      edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
      tile = true, tileSize = 16, edgeSize = 14,
      insets = { left = 3, right = 3, top = 3, bottom = 3 },
    })
    frame:SetBackdropColor(0, 0, 0, 0.95)
  end
  return frame
end

-- Opens `frame` beside `anchor`, on the side of it with room on screen.
local function placeBeside(frame, anchor)
  frame:ClearAllPoints()
  if not (anchor and anchor:IsShown() and anchor:GetCenter()) then
    frame:SetPoint("CENTER", UIParent, "CENTER", 0, 0)
    return
  end
  local x, y = anchor:GetCenter()
  local right, top = x > UIParent:GetWidth() / 2, y > UIParent:GetHeight() / 2
  local side = right and "RIGHT" or "LEFT"
  frame:SetPoint((top and "TOP" or "BOTTOM") .. side, anchor, (top and "BOTTOM" or "TOP") .. side, 0, top and -2 or 2)
end

-- Menu (also the pop-up list of a dropdown) ---------------------------------------------
-- entries: { text = string|function, func = fn, header = true, gap = true, checked = true }

local menu, catcher, rows = nil, nil, {}

local function closeMenu()
  if menu then menu:Hide() end
end

local function buildMenu()
  -- A click anywhere else closes the menu: this invisible frame covers the screen behind it.
  catcher = CreateFrame("Button", "MGAHubMenuCatcher", UIParent)
  catcher:SetAllPoints(UIParent)
  catcher:SetFrameStrata("DIALOG")
  catcher:RegisterForClicks("AnyUp")
  catcher:SetScript("OnClick", closeMenu)
  catcher:Hide()
  menu = backdropFrame("MGAHubMenu", UIParent)
  menu:SetFrameStrata("FULLSCREEN_DIALOG")
  menu:SetClampedToScreen(true)
  menu:SetScript("OnHide", function() catcher:Hide() end)
  menu:Hide()
  table.insert(UISpecialFrames, "MGAHubMenu")
end

local function menuRow(i)
  if rows[i] then return rows[i] end
  local row = CreateFrame("Button", "MGAHubMenuRow" .. i, menu)
  row.label = row:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
  row.label:SetJustifyH("LEFT")
  row.highlight = row:CreateTexture(nil, "BACKGROUND")
  row.highlight:SetAllPoints(row)
  row.highlight:SetColorTexture(1, 1, 1, 0.15)
  row.highlight:Hide()
  row:SetScript("OnEnter", function(self) if self.entry and self.entry.func then self.highlight:Show() end end)
  row:SetScript("OnLeave", function(self) self.highlight:Hide() end)
  row:SetScript("OnClick", function(self)
    local entry = self.entry
    closeMenu()
    if entry and entry.func then entry.func() end
  end)
  rows[i] = row
  return row
end

local function showMenu(anchor, entries)
  if not menu then buildMenu() end
  local y = -PAD
  for i, entry in ipairs(entries) do
    local row = menuRow(i)
    row.entry = entry
    local height = entry.gap and GAP_HEIGHT or ROW_HEIGHT
    row:ClearAllPoints()
    row:SetPoint("TOPLEFT", menu, "TOPLEFT", PAD, y)
    row:SetSize(MENU_WIDTH - 2 * PAD, height)
    row:EnableMouse(entry.func ~= nil)
    row.label:ClearAllPoints()
    row.label:SetPoint("LEFT", row, "LEFT", entry.header and 4 or 14, 0)
    local text = type(entry.text) == "function" and entry.text() or entry.text or ""
    if entry.header then text = GOLD .. text .. "|r" elseif entry.checked then text = GOLD .. text .. "|r" end
    row.label:SetText(text)
    row.highlight:Hide()
    row:Show()
    y = y - height
  end
  for i = #entries + 1, #rows do rows[i]:Hide() end
  menu:SetSize(MENU_WIDTH, -y + PAD)
  placeBeside(menu, anchor)
  catcher:Show()
  menu:Show()
end

-- Widgets the settings sections share ---------------------------------------------------
-- Built from the plainest pieces every client has (checkboxes, buttons, text), so they don't
-- depend on templates that differ between game versions.

local UI = {}
Hub.UI = UI

-- Text under `anchor` (or at the top of `parent` when anchor is parent), y points down.
function UI.Label(parent, text, font, anchor, y)
  local fs = parent:CreateFontString(nil, "ARTWORK", font)
  if anchor == parent then
    fs:SetPoint("TOPLEFT", parent, "TOPLEFT", 16, y)
  else
    fs:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", 0, y)
  end
  fs:SetJustifyH("LEFT")
  fs:SetText(text)
  return fs
end

function UI.Check(parent, name, text, hint, anchor, y, onClick)
  local box = CreateFrame("CheckButton", name, parent, "UICheckButtonTemplate")
  box:SetPoint("TOPLEFT", anchor, "BOTTOMLEFT", 0, y)
  local title = box:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
  title:SetPoint("LEFT", box, "RIGHT", 4, hint and 6 or 0)
  title:SetText(text)
  if hint then
    local small = box:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
    small:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -2)
    small:SetText(hint)
  end
  box:SetScript("OnClick", function(self) onClick(self:GetChecked() and true or false) end)
  return box
end

function UI.Button(parent, name, text, width, onClick)
  local b = CreateFrame("Button", name, parent, "UIPanelButtonTemplate")
  b:SetSize(width, 24)
  b:SetText(text)
  if onClick then b:SetScript("OnClick", onClick) end
  return b
end

-- A button showing the current choice; clicking lists them. choices() = { { value, text } },
-- selected() = the current value, onPick(value). Call .refresh() to re-read the choice.
function UI.Dropdown(parent, name, width, choices, selected, onPick)
  local b = UI.Button(parent, name, "", width)
  function b.refresh()
    for _, choice in ipairs(choices()) do
      if choice.value == selected() then return b:SetText(choice.text) end
    end
    b:SetText("")
  end
  b:SetScript("OnClick", function(self)
    local entries = {}
    for _, choice in ipairs(choices()) do
      local value = choice.value
      table.insert(entries, {
        text = choice.text,
        checked = value == selected(),
        func = function() onPick(value); b.refresh() end,
      })
    end
    showMenu(self, entries)
  end)
  return b
end

-- Settings window (Interface > AddOns > MGA) -----------------------------------------------

local panel, openCategory = nil, nil
local sections = {}

local function refreshPanel()
  for _, section in ipairs(sections) do
    if section.refresh then section.refresh() end
  end
  if panel and panel.minimap then panel.minimap:SetChecked(not settings().hidden) end
end

local function buildSections(content)
  local above, total = nil, 0
  for _, spec in ipairs(Hub.addons) do
    if spec.settings then
      local section = CreateFrame("Frame", nil, content)
      if above then
        section:SetPoint("TOPLEFT", above, "BOTTOMLEFT", 0, -SECTION_GAP)
      else
        section:SetPoint("TOPLEFT", content, "TOPLEFT", 0, 0)
      end
      local heading = UI.Label(section, spec.name, "GameFontNormalLarge", section, 0)
      local built, height = pcall(spec.settings, section, heading)
      if not built then
        say(spec.name .. " settings unavailable: " .. tostring(height))
        height = 0
      end
      section:SetSize(SECTION_WIDTH, HEADING_HEIGHT + (height or 0))
      total = total + HEADING_HEIGHT + (height or 0) + (above and SECTION_GAP or 0)
      above = section
      table.insert(sections, section)
    end
  end
  content:SetSize(SECTION_WIDTH, math.max(total, 1))
end

local function buildPanel()
  panel = CreateFrame("Frame", "MGAHubPanel")
  panel.name = TITLE
  local title = UI.Label(panel, TITLE, "GameFontNormalLarge", panel, -16)
  local intro = UI.Label(panel, "One place for the settings of every MyGamingAssistant addon you have installed. Changes apply as you click.",
    "GameFontHighlightSmall", title, -6)
  panel.minimap = UI.Check(panel, "MGAHubOption_minimap", "Show the minimap button",
    "Keys: Esc > Key Bindings > MGA opens the menu or this window without it.", intro, -10, function(on)
      settings().hidden = not on
      Hub.PlaceButton()
    end)

  local scroll = CreateFrame("ScrollFrame", "MGAHubScroll", panel, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", panel.minimap, "BOTTOMLEFT", 0, -14)
  scroll:SetPoint("BOTTOMRIGHT", panel, "BOTTOMRIGHT", -32, 12)
  local content = CreateFrame("Frame", "MGAHubScrollContent", scroll)
  scroll:SetScrollChild(content)
  buildSections(content)

  panel:SetScript("OnShow", refreshPanel)
  refreshPanel()

  -- Newer clients have the Settings window; older ones the Interface Options list.
  if Settings and Settings.RegisterCanvasLayoutCategory and Settings.RegisterAddOnCategory then
    local category = Settings.RegisterCanvasLayoutCategory(panel, TITLE)
    Settings.RegisterAddOnCategory(category)
    openCategory = function() Settings.OpenToCategory(category:GetID()) end
  elseif InterfaceOptions_AddCategory then
    InterfaceOptions_AddCategory(panel)
    -- Called twice: the first call on the old Interface Options frame opens it without selecting the page.
    openCategory = function()
      InterfaceOptionsFrame_OpenToCategory(panel)
      InterfaceOptionsFrame_OpenToCategory(panel)
    end
  end
end

function Hub.OpenSettings()
  closeMenu()
  if not (openCategory and pcall(openCategory)) then
    say("this game version has no AddOns options page, so there are no settings to open.")
  end
end

-- Minimap button -------------------------------------------------------------------------

local button

local function atan2(y, x)
  if math.atan2 then return math.atan2(y, x) end
  return math.atan(y, x)
end

-- The button's spot on the ring around the minimap, for an angle in radians.
function Hub.PlaceButton()
  if not button then return end
  if settings().hidden then return button:Hide() end
  local angle = settings().angle or DEFAULT_ANGLE
  local reach = Minimap:GetWidth() / 2 + RING_GAP
  local x, y = math.cos(angle) * reach, math.sin(angle) * reach
  if GetMinimapShape and GetMinimapShape() == "SQUARE" then
    local stretch = 1 / math.max(math.abs(math.cos(angle)), math.abs(math.sin(angle)))
    x, y = x * stretch, y * stretch
  end
  button:ClearAllPoints()
  button:SetPoint("CENTER", Minimap, "CENTER", x, y)
  button:Show()
end

local function followCursor()
  local centerX, centerY = Minimap:GetCenter()
  local cursorX, cursorY = GetCursorPosition()
  local scale = Minimap:GetEffectiveScale()
  settings().angle = atan2(cursorY / scale - centerY, cursorX / scale - centerX)
  Hub.PlaceButton()
end

local function menuEntries()
  local entries = {}
  for _, spec in ipairs(Hub.addons) do
    if spec.menu and #spec.menu > 0 then
      table.insert(entries, { text = spec.name, header = true })
      for _, item in ipairs(spec.menu) do table.insert(entries, item) end
    end
  end
  if #entries > 0 then table.insert(entries, { gap = true }) end
  table.insert(entries, { text = "Settings", func = Hub.OpenSettings })
  return entries
end

function Hub.OpenMenu()
  showMenu(button, menuEntries()) -- no button (hidden, or it couldn't be built): the menu opens mid-screen
end

local function buildButton()
  button = CreateFrame("Button", "MGAHubMinimapButton", Minimap)
  button:SetSize(31, 31)
  button:SetFrameStrata("MEDIUM")
  button:SetFrameLevel(8)
  button:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  button:RegisterForDrag("LeftButton")
  local background = button:CreateTexture(nil, "BACKGROUND")
  background:SetSize(20, 20)
  background:SetPoint("TOPLEFT", button, "TOPLEFT", 7, -5)
  background:SetTexture("Interface\\Minimap\\UI-Minimap-Background")
  local icon = button:CreateTexture(nil, "ARTWORK")
  icon:SetSize(18, 18)
  icon:SetPoint("TOPLEFT", button, "TOPLEFT", 8, -6)
  icon:SetTexture("Interface\\Icons\\INV_Misc_Map_01")
  icon:SetTexCoord(0.07, 0.93, 0.07, 0.93)
  local border = button:CreateTexture(nil, "OVERLAY")
  border:SetSize(53, 53)
  border:SetPoint("TOPLEFT", button, "TOPLEFT", 0, 0)
  border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  button:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")

  button:SetScript("OnClick", function(_, mouse)
    if mouse == "RightButton" then return Hub.OpenSettings() end
    if menu and menu:IsShown() then closeMenu() else Hub.OpenMenu() end
  end)
  button:SetScript("OnDragStart", function(self)
    closeMenu()
    GameTooltip:Hide()
    self:SetScript("OnUpdate", followCursor)
  end)
  button:SetScript("OnDragStop", function(self) self:SetScript("OnUpdate", nil) end)
  button:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:SetText(TITLE)
    GameTooltip:AddLine("Click: menu \194\183 Right-click: settings", 1, 1, 1)
    GameTooltip:Show()
  end)
  button:SetScript("OnLeave", function() GameTooltip:Hide() end)
  Hub.PlaceButton()
end

-- Your professions ----------------------------------------------------------------------------

-- Your skills as { {name, line, skill, max} } (line = the skill line id, nil from the old skills
-- list), or nil when they can't be read in full. Forever has no GetSkillLineInfo, so this asks
-- GetProfessions/GetProfessionInfo first; the old Skills tab is only a guarded fallback, and gives
-- up on a collapsed header (its rows aren't listed). Nothing here errors on a client missing either.
function Hub.GetProfessionSkills()
  local out = {}
  if GetProfessions and GetProfessionInfo then
    pcall(function()
      local indexes = { GetProfessions() }
      for i = 1, 6 do
        local index = indexes[i]
        if index then
          local name, _, skill, max, _, _, line = GetProfessionInfo(index)
          if name or line then table.insert(out, { name = name, line = line, skill = skill, max = max }) end
        end
      end
    end)
    if #out > 0 then return out end
  end
  if not (GetNumSkillLines and GetSkillLineInfo) then return nil end
  local readable = pcall(function()
    for i = 1, GetNumSkillLines() do
      local name, header, expanded, rank, _, _, max = GetSkillLineInfo(i)
      if header and not expanded then error("collapsed") end
      if name and not header then table.insert(out, { name = name, skill = rank or 0, max = max }) end
    end
  end)
  if readable and #out > 0 then return out end
  return nil
end

-- Events and the one slash command ------------------------------------------------------------

-- Everything is built at login: by then every addon has loaded and registered.
local events = CreateFrame("Frame")
Hub.events = events
events:RegisterEvent("PLAYER_LOGIN")
events:SetScript("OnEvent", function()
  settings()
  -- One failing piece (on some client) must not take the other down.
  local built, problem = pcall(buildButton)
  if not built then say("minimap button unavailable: " .. tostring(problem)) end
  built, problem = pcall(buildPanel)
  if not built then say("settings page unavailable: " .. tostring(problem)) end
end)

SLASH_MGAHUB1 = "/mga"
SlashCmdList.MGAHUB = function(message)
  if (message or ""):lower():match("^%s*settings") then Hub.OpenSettings() else Hub.OpenMenu() end
end
