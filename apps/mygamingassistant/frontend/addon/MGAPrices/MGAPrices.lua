-- MGA Prices — the auction-house price of whatever item you mouse over.
--
-- Prices come from Data.lua, written by the "Download the addon" button on the
-- MyGamingAssistant Auction house page (US, PvP server). Addons can't go online,
-- so the prices are as fresh as your download: download again to refresh.
--
--   Tooltip: your faction's house price (×stack when you hover a stack), the
--            cheapest listing and how many are on sale. Hold Shift for every house.
--            On crafting materials: which profession leveling routes use it, and
--            the best craft that pays with it on your house right now — the
--            demand that can push its price up. Vendor-sold ones just say so.
--   /mgaprices  which prices are loaded and how old they are

local ADDON = "MGA Prices"
local PREFIX = "|cff33aaff" .. ADDON .. ":|r "
local SITE = "mygamingassistant.myfreeapps.org/wow-forever/auction-house"
local OLD_AFTER_SECONDS = 24 * 60 * 60
local HOUSES = { "alliance", "horde", "neutral" }
local HOUSE_LABEL = { alliance = "Alliance", horde = "Horde", neutral = "Blackwater" }
local BIND_ON_PICKUP = 1

local LABEL = { 0.2, 0.67, 1 }
local VALUE = { 1, 1, 1 }
local MUTED = { 0.6, 0.6, 0.6 }
local WARN = { 1, 0.5, 0.25 }

local function say(message)
  DEFAULT_CHAT_FRAME:AddMessage(PREFIX .. message)
end

local function money(copper)
  if GetCoinTextureString then
    return GetCoinTextureString(copper)
  end
  local gold, silver, rest = floor(copper / 10000), floor(copper / 100) % 100, copper % 100
  local parts = {}
  if gold > 0 then table.insert(parts, gold .. "g") end
  if silver > 0 then table.insert(parts, silver .. "s") end
  if rest > 0 or #parts == 0 then table.insert(parts, rest .. "c") end
  return table.concat(parts, " ")
end

local function ageText(updated)
  local hours = floor((time() - updated) / 3600)
  if hours < 1 then return "updated less than an hour ago" end
  if hours < 48 then return "updated " .. hours .. (hours == 1 and " hour ago" or " hours ago") end
  return "updated " .. floor(hours / 24) .. " days ago"
end

local function playerHouse()
  return UnitFactionGroup("player") == "Horde" and "horde" or "alliance"
end

local function houseRow(house, itemId)
  local data = MGAPricesData and MGAPricesData.houses and MGAPricesData.houses[house]
  return data and data.items and data.items[itemId], data
end

local function line(tooltip, left, right, leftColor, rightColor)
  tooltip:AddDoubleLine(left, right, leftColor[1], leftColor[2], leftColor[3], rightColor[1], rightColor[2], rightColor[3])
end

-- The stack size when hovering a bag or bank slot; 1 anywhere else.
local function stackCount(tooltip)
  local owner = tooltip.GetOwner and tooltip:GetOwner()
  local count = owner and tonumber(owner.count)
  return (count and count > 1) and count or 1
end

local function canBeAuctioned(itemId)
  local bindType = select(14, GetItemInfo(itemId))
  return bindType ~= BIND_ON_PICKUP
end

local function addYourHouse(tooltip, itemId)
  local house = playerHouse()
  local row = houseRow(house, itemId)
  if not row then
    line(tooltip, "Auction (" .. HOUSE_LABEL[house] .. ")", "not on sale", LABEL, MUTED)
    return
  end
  local market, cheapest, quantity = row[1], row[2], row[3]
  local count = stackCount(tooltip)
  if count > 1 then
    line(tooltip, "Auction (" .. HOUSE_LABEL[house] .. ") ×" .. count, money(market * count), LABEL, VALUE)
    line(tooltip, "Each", money(market), MUTED, VALUE)
  else
    line(tooltip, "Auction (" .. HOUSE_LABEL[house] .. ")", money(market), LABEL, VALUE)
  end
  line(tooltip, "Cheapest · on sale", money(cheapest) .. " · " .. quantity, MUTED, MUTED)
end

local function addEveryHouse(tooltip, itemId)
  for _, house in ipairs(HOUSES) do
    local row = houseRow(house, itemId)
    if row then
      line(tooltip, "Auction (" .. HOUSE_LABEL[house] .. ")", money(row[1]) .. " · " .. row[3] .. " on sale", LABEL, VALUE)
    else
      line(tooltip, "Auction (" .. HOUSE_LABEL[house] .. ")", "not on sale", LABEL, MUTED)
    end
  end
end

-- Crafting demand for a material: leveling routes, a craft that pays on your house, else how many recipes use it.
local function addDemand(tooltip, itemId)
  local reagent = MGAPricesData.reagents and MGAPricesData.reagents[itemId]
  if not reagent then return end
  if reagent.vendor then
    line(tooltip, "Reagent", "sold by vendors", MUTED, MUTED)
    return
  end
  local _, house = houseRow(playerHouse(), itemId)
  local craft = house and house.crafts and house.crafts[itemId]
  if reagent.leveling ~= "" then
    line(tooltip, "Leveling demand", reagent.leveling, LABEL, VALUE)
  end
  if craft then
    line(tooltip, "Crafting pays", craft[1] .. " +" .. money(craft[2]), LABEL, VALUE)
  end
  if reagent.leveling == "" and not craft then
    line(tooltip, "Reagent", reagent.recipes .. (reagent.recipes == 1 and " recipe" or " recipes") .. " (" .. reagent.professions .. ")", MUTED, MUTED)
  end
end

local function addAge(tooltip)
  local updated = MGAPricesData.updated
  if not updated then return end
  if time() - updated > OLD_AFTER_SECONDS then
    tooltip:AddLine("MGA prices " .. ageText(updated) .. " — download again on the site", WARN[1], WARN[2], WARN[3])
  end
end

local function addPrice(tooltip, itemId)
  if not itemId or tooltip.mgaPricedItem == itemId then return end
  tooltip.mgaPricedItem = itemId
  if not MGAPricesData then
    tooltip:AddLine("MGA Prices: no prices loaded — /mgaprices", MUTED[1], MUTED[2], MUTED[3])
    return
  end
  local anywhere = houseRow("alliance", itemId) or houseRow("horde", itemId) or houseRow("neutral", itemId)
  if not anywhere and not canBeAuctioned(itemId) then return end
  if IsShiftKeyDown() then
    addEveryHouse(tooltip, itemId)
  else
    addYourHouse(tooltip, itemId)
  end
  addDemand(tooltip, itemId)
  addAge(tooltip)
end

local function itemIdFromLink(link)
  return link and tonumber(link:match("item:(%d+)"))
end

local function watch(tooltip)
  -- Each time the tooltip is cleared it may show a new item, so price it again.
  tooltip:HookScript("OnTooltipCleared", function(self) self.mgaPricedItem = nil end)
end

local PRICED_TOOLTIPS = { GameTooltip = true, ItemRefTooltip = true }

if TooltipDataProcessor and Enum and Enum.TooltipDataType then
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
    if PRICED_TOOLTIPS[tooltip:GetName() or ""] then
      addPrice(tooltip, data and data.id)
    end
  end)
else
  for name in pairs(PRICED_TOOLTIPS) do
    _G[name]:HookScript("OnTooltipSetItem", function(self)
      local _, link = self:GetItem()
      addPrice(self, itemIdFromLink(link))
    end)
  end
end
for name in pairs(PRICED_TOOLTIPS) do watch(_G[name]) end

-- Shift switches between your house and every house while the tooltip is open.
local events = CreateFrame("Frame")
events:RegisterEvent("MODIFIER_STATE_CHANGED")
events:SetScript("OnEvent", function(_, _, key)
  if (key == "LSHIFT" or key == "RSHIFT") and GameTooltip:IsShown() and GameTooltip.RefreshData then
    GameTooltip.mgaPricedItem = nil
    GameTooltip:RefreshData()
  end
end)

SLASH_MGAPRICES1 = "/mgaprices"
SlashCmdList.MGAPRICES = function()
  if not MGAPricesData then
    say("No prices loaded. Download the addon from " .. SITE .. ", replace this folder and /reload.")
    return
  end
  for _, house in ipairs(HOUSES) do
    local data = MGAPricesData.houses and MGAPricesData.houses[house]
    if data and data.updated then
      local count = 0
      for _ in pairs(data.items) do count = count + 1 end
      say(HOUSE_LABEL[house] .. ": " .. count .. (count == 1 and " item, " or " items, ") .. ageText(data.updated) .. ".")
    else
      say(HOUSE_LABEL[house] .. ": no prices.")
    end
  end
  say("Mouse over an item to see its price; hold Shift for every house. Refresh: download again from " .. SITE .. ".")
end
