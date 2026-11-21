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
--            Whether to sell it on the AH or vendor it: what the house pays after
--            its cut against what a vendor pays.
--   Chat:    hover an item link to see its tooltip (priced like any other), and
--            each item link in chat gets your house's price after it.
--   /mgaprices       which prices are loaded and how old they are
--   /mgaprices chat  turn the prices after chat links off or on

local ADDON = "MGA Prices"
local PREFIX = "|cff33aaff" .. ADDON .. ":|r "
local SITE = "mygamingassistant.myfreeapps.org/wow-forever/auction-house"
local OLD_AFTER_SECONDS = 24 * 60 * 60
local HOUSES = { "alliance", "horde", "neutral" }
local HOUSE_LABEL = { alliance = "Alliance", horde = "Horde", neutral = "Blackwater" }
local BIND_ON_PICKUP = 1
-- The auction house only wins when it nets this much more than a vendor: an
-- unsold auction loses its deposit, and selling takes a trip back to the mailbox.
local AH_BEATS_VENDOR_BY = 1.1
-- Disenchanting only wins when it nets this much more than the next option.
local DE_BEATS_NEXT_BY = 1.1

local LABEL = { 0.2, 0.67, 1 }
local VALUE = { 1, 1, 1 }
local MUTED = { 0.6, 0.6, 0.6 }
local WARN = { 1, 0.5, 0.25 }
local GOOD = { 0.25, 1, 0.25 }

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

-- WoW Forever's client only has C_Item.GetItemInfo; older clients only the global.
local getItemInfo = (C_Item and C_Item.GetItemInfo) or GetItemInfo

local function canBeAuctioned(itemId)
  if not getItemInfo then return true end
  local bindType = select(14, getItemInfo(itemId))
  return bindType ~= BIND_ON_PICKUP
end

local function vendorPrice(itemId)
  if not getItemInfo then return nil end
  return select(11, getItemInfo(itemId))
end

-- Returns the player's current Enchanting skill level, or nil if they have none.
local function enchantingSkill()
  local n = GetNumSkillLines and GetNumSkillLines() or 0
  for i = 1, n do
    local name, isHeader, _, rank = GetSkillLineInfo(i)
    if not isHeader and name == "Enchanting" then return rank end
  end
  return nil
end

-- Returns the disenchant expected value (EV) in copper per item and whether any
-- result material prices were missing from this house.
local function disenchantEV(itemId, house)
  local de = MGAPricesData and MGAPricesData.deItems and MGAPricesData.deItems[itemId]
  if not de then return nil, false end
  local tableId = de[1]
  local deTable = MGAPricesData.deTables and MGAPricesData.deTables[tableId]
  if not deTable then return nil, false end
  local houseData = MGAPricesData.houses and MGAPricesData.houses[house]
  local cut = houseData and houseData.cut or 0
  local ev, anyMissing = 0, false
  for resultId, entry in pairs(deTable) do
    local minCount, maxCount, chance = entry[1], entry[2], entry[3]
    local avgCount = (minCount + maxCount) / 2
    local priceRow = houseData and houseData.items and houseData.items[resultId]
    if priceRow then
      -- The house takes its cut of each material we sell.
      local netsEach = priceRow[1] - floor(priceRow[1] * cut)
      ev = ev + (chance / 100) * avgCount * netsEach
    else
      anyMissing = true
    end
  end
  return ev, anyMissing
end

-- Disenchant / Sell on AH / Vendor it: pick the best option.
-- market=nil means the item can't be auctioned (BoP or not listed).
-- Shows at most one verdict line and one detail line.
local function addVerdict(tooltip, itemId, market, cut, count)
  local vendor = vendorPrice(itemId)
  if vendor == nil then return end  -- item info not in client cache yet

  local house = playerHouse()
  local deEntry = MGAPricesData and MGAPricesData.deItems and MGAPricesData.deItems[itemId]

  -- AH net value (nil when item can't be auctioned or has no price).
  local ahNets
  if market and cut then
    local total = market * count
    ahNets = total - floor(total * cut)
  end
  local vendorTotal = vendor * count

  if deEntry then
    local skill = enchantingSkill()
    local requiredSkill = deEntry[2]

    if skill == nil then
      -- Player has no Enchanting — best AH/vendor verdict plus a DE info line.
      if vendor == 0 then
        if ahNets then line(tooltip, "Sell on AH", "vendors won't buy it", GOOD, MUTED) end
      elseif ahNets and ahNets > vendorTotal * AH_BEATS_VENDOR_BY then
        line(tooltip, "Sell on AH", "+" .. money(ahNets - vendorTotal) .. " over vendor", GOOD, VALUE)
        line(tooltip, "Disenchant", "need Enchanting", MUTED, MUTED)
      else
        line(tooltip, "Vendor it", ahNets and ("AH nets " .. money(ahNets) .. " · vendor " .. money(vendorTotal)) or ("vendor " .. money(vendorTotal)), WARN, MUTED)
        line(tooltip, "Disenchant", "need Enchanting", MUTED, MUTED)
      end
      return
    end

    if skill < requiredSkill then
      -- Player has Enchanting but insufficient skill.
      if vendor == 0 then
        if ahNets then line(tooltip, "Sell on AH", "vendors won't buy it", GOOD, MUTED) end
      elseif ahNets and ahNets > vendorTotal * AH_BEATS_VENDOR_BY then
        line(tooltip, "Sell on AH", "+" .. money(ahNets - vendorTotal) .. " over vendor", GOOD, VALUE)
        line(tooltip, "Disenchant", "need " .. requiredSkill .. " Enchanting", MUTED, MUTED)
      else
        line(tooltip, "Vendor it", ahNets and ("AH nets " .. money(ahNets) .. " · vendor " .. money(vendorTotal)) or ("vendor " .. money(vendorTotal)), WARN, MUTED)
        line(tooltip, "Disenchant", "need " .. requiredSkill .. " Enchanting", MUTED, MUTED)
      end
      return
    end

    -- Player CAN disenchant — three-way verdict.
    local deEV, deMissing = disenchantEV(itemId, house)
    if deEV then deEV = deEV * count end
    local prefix = (deEV and deMissing) and "~" or ""

    if vendor == 0 then
      -- No vendor: compare DE vs AH only.
      if deEV and ahNets then
        if deEV > ahNets * DE_BEATS_NEXT_BY then
          line(tooltip, "Disenchant", prefix .. money(floor(deEV)), GOOD, VALUE)
        else
          line(tooltip, "Sell on AH", "vendors won't buy it", GOOD, MUTED)
        end
      elseif deEV then
        line(tooltip, "Disenchant", prefix .. money(floor(deEV)), GOOD, VALUE)
      elseif ahNets then
        line(tooltip, "Sell on AH", "vendors won't buy it", GOOD, MUTED)
      else
        line(tooltip, "Disenchant", deMissing and "~ prices not loaded" or "not priced", MUTED, MUTED)
      end
      return
    end

    -- Full three-way: Disenchant / AH / Vendor.
    if deEV and deEV > math.max(ahNets or 0, vendorTotal) * DE_BEATS_NEXT_BY then
      line(tooltip, "Disenchant", prefix .. money(floor(deEV)), GOOD, VALUE)
      return
    end
    -- DE didn't win; fall through to AH vs Vendor.
    if ahNets and ahNets > vendorTotal * AH_BEATS_VENDOR_BY then
      line(tooltip, "Sell on AH", "+" .. money(ahNets - vendorTotal) .. " over vendor", GOOD, VALUE)
    else
      line(tooltip, "Vendor it", ahNets and ("AH nets " .. money(ahNets) .. " · vendor " .. money(vendorTotal)) or ("vendor " .. money(vendorTotal)), WARN, MUTED)
    end
    return
  end

  -- No DE entry — existing two-way AH vs Vendor verdict.
  if vendor == 0 then
    if ahNets then line(tooltip, "Sell on AH", "vendors won't buy it", GOOD, MUTED) end
    return
  end
  if ahNets and ahNets > vendorTotal * AH_BEATS_VENDOR_BY then
    line(tooltip, "Sell on AH", "+" .. money(ahNets - vendorTotal) .. " over vendor", GOOD, VALUE)
  elseif ahNets then
    line(tooltip, "Vendor it", "AH nets " .. money(ahNets) .. " · vendor " .. money(vendorTotal), WARN, MUTED)
  end
end

local function addYourHouse(tooltip, itemId)
  local house = playerHouse()
  local row, data = houseRow(house, itemId)
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
  addVerdict(tooltip, itemId, market, data.cut, count)
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

-- Crafting demand for a material: leveling routes, a craft that pays and what it's wanted for on your house, else how many recipes use it.
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
  -- What holds the price up: the most valuable thing it goes into here, even when the craft no longer pays.
  local wanted = house and house.wanted and house.wanted[itemId]
  if wanted and not (craft and craft[1] == wanted[1]) then
    line(tooltip, "Wanted for", wanted[1] .. " x" .. wanted[2] .. " · sells " .. money(wanted[3]), LABEL, VALUE)
  end
  if reagent.leveling == "" and not craft and not wanted then
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
  if not anywhere and not canBeAuctioned(itemId) then
    -- BoP: can't auction. Show a disenchant verdict if the item is disenchantable,
    -- otherwise fall back to the original chat-link message.
    local deEntry = MGAPricesData.deItems and MGAPricesData.deItems[itemId]
    if deEntry then
      addVerdict(tooltip, itemId, nil, nil, stackCount(tooltip))
    elseif tooltip == ItemRefTooltip then
      line(tooltip, "Auction", "can't be sold (binds when picked up)", LABEL, MUTED)
    end
    return
  end
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

-- The client can build an item tooltip three ways, and which ones fire differs by
-- client build, so hook all of them; addPrice's per-item guard prices each item once.
if TooltipDataProcessor and Enum and Enum.TooltipDataType then
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
    if PRICED_TOOLTIPS[tooltip:GetName() or ""] then
      addPrice(tooltip, data and data.id)
    end
  end)
end
for name in pairs(PRICED_TOOLTIPS) do
  local tooltip = _G[name]
  watch(tooltip)
  if not tooltip.HasScript or tooltip:HasScript("OnTooltipSetItem") then
    tooltip:HookScript("OnTooltipSetItem", function(self)
      local _, link = self:GetItem()
      addPrice(self, itemIdFromLink(link))
    end)
  end
  -- Clicking a chat link opens ItemRefTooltip with SetHyperlink (hovering one uses
  -- GameTooltip's): price it there too, then Show() so the tooltip fits the new lines.
  if hooksecurefunc then
    hooksecurefunc(tooltip, "SetHyperlink", function(self, link)
      local itemId = type(link) == "string" and itemIdFromLink(link)
      if itemId and self.mgaPricedItem ~= itemId then
        addPrice(self, itemId)
        self:Show()
      end
    end)
  end
end

-- Shift switches between your house and every house while the tooltip is open.
local events = CreateFrame("Frame")
events:RegisterEvent("MODIFIER_STATE_CHANGED")
events:SetScript("OnEvent", function(_, _, key)
  if (key == "LSHIFT" or key == "RSHIFT") and GameTooltip:IsShown() and GameTooltip.RefreshData then
    GameTooltip.mgaPricedItem = nil
    GameTooltip:RefreshData()
  end
end)

-- Chat. MGAPricesSettings is saved between sessions (.toc SavedVariables).
local function chatPricesOn()
  return not (MGAPricesSettings and MGAPricesSettings.chat == false)
end

-- "1g 20s", "3s 5c", "29c": short enough to sit after a link in a chat line.
local function shortMoney(copper)
  local gold, silver, rest = floor(copper / 10000), floor(copper / 100) % 100, copper % 100
  if gold > 0 then return silver > 0 and (gold .. "g " .. silver .. "s") or (gold .. "g") end
  if silver > 0 then return rest > 0 and (silver .. "s " .. rest .. "c") or (silver .. "s") end
  return rest .. "c"
end

local ITEM_LINK = "(|Hitem:(%d+)[^|]*|h%[[^%]]*%]|h|r)"
local ITEM_LINK_NO_RESET = "(|Hitem:(%d+)[^|]*|h%[[^%]]*%]|h)"

-- The message with your house's price after each item link that has one.
local function withPrices(message)
  local function priced(link, id)
    local row = houseRow(playerHouse(), tonumber(id))
    if not row then return link end
    return link .. " |cff999999(" .. shortMoney(row[1]) .. ")|r"
  end
  local result, count = message:gsub(ITEM_LINK, priced)
  if count == 0 then result = message:gsub(ITEM_LINK_NO_RESET, priced) end
  return result
end

local CHAT_EVENTS = {
  "CHAT_MSG_CHANNEL", "CHAT_MSG_SAY", "CHAT_MSG_YELL", "CHAT_MSG_GUILD", "CHAT_MSG_OFFICER",
  "CHAT_MSG_PARTY", "CHAT_MSG_PARTY_LEADER", "CHAT_MSG_RAID", "CHAT_MSG_RAID_LEADER",
  "CHAT_MSG_RAID_WARNING", "CHAT_MSG_WHISPER", "CHAT_MSG_WHISPER_INFORM", "CHAT_MSG_LOOT",
}

-- Only changes what your chat window shows, never what anyone sends.
local function chatFilter(_, _, message, ...)
  if not MGAPricesData or not chatPricesOn() or type(message) ~= "string" then return false end
  local priced = withPrices(message)
  if priced == message then return false end
  return false, priced, ...
end

if ChatFrame_AddMessageEventFilter then
  for _, event in ipairs(CHAT_EVENTS) do ChatFrame_AddMessageEventFilter(event, chatFilter) end
end

-- Hovering an item link in a chat window shows its tooltip, which addPrice prices.
local hookedChatFrames = {}
local showingChatLink = false
local function hookChatFrame(frame)
  if not frame or hookedChatFrames[frame] then return end
  hookedChatFrames[frame] = true
  frame:HookScript("OnHyperlinkEnter", function(self, link)
    if type(link) ~= "string" or not link:match("^item:") then return end
    GameTooltip:SetOwner(self, "ANCHOR_CURSOR")
    GameTooltip:SetHyperlink(link)
    GameTooltip:Show()
    showingChatLink = true
  end)
  frame:HookScript("OnHyperlinkLeave", function()
    if showingChatLink then
      showingChatLink = false
      GameTooltip:Hide()
    end
  end)
end

for i = 1, (NUM_CHAT_WINDOWS or 10) do hookChatFrame(_G["ChatFrame" .. i]) end
-- Whisper windows open later.
if hooksecurefunc and FCF_OpenTemporaryWindow then
  hooksecurefunc("FCF_OpenTemporaryWindow", function()
    for _, name in ipairs(CHAT_FRAMES or {}) do hookChatFrame(_G[name]) end
  end)
end

SLASH_MGAPRICES1 = "/mgaprices"
SlashCmdList.MGAPRICES = function(message)
  local command = (message or ""):lower():match("^%s*(.-)%s*$")
  if command == "chat" then
    MGAPricesSettings = MGAPricesSettings or {}
    MGAPricesSettings.chat = not chatPricesOn()
    say("Prices after item links in chat: " .. (chatPricesOn() and "on" or "off") .. ".")
    return
  end
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
  say("Chat links show their price too; /mgaprices chat turns that " .. (chatPricesOn() and "off" or "on") .. ".")
end
