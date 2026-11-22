/**
 * The frame side of the WoW client for the MGA hub (addon/shared/MGAHub.lua), in two parts.
 *
 * WOW_HUB_FRAME_STUBS: a complete, permissive frame engine (`CreateFrame` returns a frame that
 * stores its scripts, events, text, checked state and points, and ignores any method it doesn't
 * know), plus UIParent, Minimap and the cursor. `fire(event, ...)` runs every frame's OnEvent for
 * that event. Frames: `kind`, `name`, `scripts`, `shownFlag`, `text`, `checked`, `point`.
 * `UIParent.cx`/`cy`, `Minimap.cx`/`cy` and `cursor = { x, y }` position things on screen.
 *
 * WOW_HUB_HELPERS: what a test needs to drive the hub through any addon's own stubs (they only
 * have to keep `kind`, `scripts`, `shownFlag` and `text` on their frames): `click(frame, mouse)`,
 * `menuLines()` (the open menu: "[Heading]", items, "-" for a gap), `clickRow(text)`, and a
 * `Settings` window that records "options: ..." lines into `out`.
 */
export const WOW_HUB_FRAME_STUBS = `
hubFrames = {}
local noop = function() end
local methods = {}
local function newHubFrame(kind, name, parent, template)
  local f = { kind = kind, name = name, parent = parent, template = template, scripts = {}, events = {}, shownFlag = true, text = "", checked = false }
  setmetatable(f, { __index = function(_, k) return methods[k] or (k:match("^%u") and noop or nil) end })
  if name then _G[name] = f end
  table.insert(hubFrames, f)
  return f
end
function methods:SetScript(k, fn) self.scripts[k] = fn end
function methods:GetScript(k) return self.scripts[k] end
function methods:RegisterEvent(e) self.events[e] = true end
function methods:Show() self.shownFlag = true end
function methods:Hide()
  local was = self.shownFlag
  self.shownFlag = false
  if was and self.scripts.OnHide then self.scripts.OnHide(self) end
end
function methods:IsShown() return self.shownFlag end
function methods:SetText(t) self.text = t end
function methods:GetText() return self.text end
function methods:SetChecked(on) self.checked = on and true or false end
function methods:GetChecked() return self.checked end
function methods:SetPoint(...) self.point = { ... } end
function methods:SetSize(w, h) self.width, self.height = w, h end
function methods:SetWidth(w) self.width = w end
function methods:GetWidth() return self.width or 140 end
function methods:GetHeight() return self.height or 100 end
function methods:GetCenter() return self.cx or 500, self.cy or 400 end
function methods:GetEffectiveScale() return 1 end
function methods:CreateFontString(name) return newHubFrame("FontString", name, self) end
function methods:CreateTexture() return newHubFrame("Texture", nil, self) end
function methods:EnableMouse(on) self.mouse = on end
function CreateFrame(kind, name, parent, template) return newHubFrame(kind, name, parent, template) end
UIParent = newHubFrame("Frame", "UIParent")
UIParent.width, UIParent.height = 1920, 1080
Minimap = newHubFrame("Frame", "Minimap", UIParent)
Minimap.cx, Minimap.cy = 1700, 900
UISpecialFrames = {}
cursor = { x = 0, y = 0 }
function GetCursorPosition() return cursor.x, cursor.y end
function fire(event, ...)
  for _, f in ipairs(hubFrames) do
    if f.events[event] and f.scripts.OnEvent then f.scripts.OnEvent(f, event, ...) end
  end
end
`;

export const WOW_HUB_HELPERS = `
out = out or {}
-- A click the way the game does it: a checkbox flips first, then OnClick runs.
function click(f, mouse)
  if f.kind == "CheckButton" then f.checked = not f.checked end
  f.scripts.OnClick(f, mouse or "LeftButton")
end
local function stripped(text) return (text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end
function menuShown() return MGAHubMenu ~= nil and MGAHubMenu.shownFlag end
function menuLines()
  local lines = {}
  for i = 1, 60 do
    local row = _G["MGAHubMenuRow" .. i]
    if not row then break end
    if row.shownFlag then
      local text = stripped(row.label.text)
      table.insert(lines, row.entry.gap and "-" or (row.entry.header and ("[" .. text .. "]") or text))
    end
  end
  return lines
end
function clickRow(text)
  for i = 1, 60 do
    local row = _G["MGAHubMenuRow" .. i]
    if row and row.shownFlag and not row.entry.header and stripped(row.label.text) == text then
      return row.scripts.OnClick(row)
    end
  end
  error("no menu row " .. text)
end
-- The newer Settings window. \`Settings = nil\` leaves the older Interface Options list.
Settings = {
  RegisterCanvasLayoutCategory = function(panel, title)
    return { panel = panel, title = title, GetID = function() return "id:" .. title end }
  end,
  RegisterAddOnCategory = function(category) table.insert(out, "options: added " .. category.title); openedCategory = category end,
  OpenToCategory = function(id)
    table.insert(out, "options: opened " .. id)
    if openedCategory and openedCategory.panel.scripts.OnShow then openedCategory.panel.scripts.OnShow(openedCategory.panel) end
  end,
}
function InterfaceOptions_AddCategory(panel) table.insert(out, "options: added (old list) " .. panel.name) end
function InterfaceOptionsFrame_OpenToCategory(panel) table.insert(out, "options: opened (old list) " .. panel.name) end
`;
