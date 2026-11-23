import { WOW_HUB_FRAME_STUBS, WOW_HUB_HELPERS } from "@/test/addonLua/wowHubStubs.lua";

/**
 * Just enough of the WoW client API for the MGA Professions addon to run under fengari. Tests set `player`
 * (faction, level), `known` (the professions the client lists: { {line, skill, max} }), `bags` / `bankItems`
 * (item id -> count), `MGAPricesData` and `learned` (spell ids the open trade-skill window marks learned), then
 * call `fire(event)` or `MGAProfessions.*`. Chat lines go into `out` as "chat: ...".
 */
export const WOW_PROFESSION_STUBS = `
out = {}
${WOW_HUB_FRAME_STUBS}
${WOW_HUB_HELPERS}
DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) table.insert(out, "chat: " .. (tostring(m):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", ""))) end }
SlashCmdList = {}
player = { faction = "Alliance", level = 20 }
known = {}
bags = {}
bankItems = {}
learned = {}
tradeLine = nil
function UnitFactionGroup() return player.faction end
function UnitLevel() return player.level end
function GetProfessions()
  local n = #known
  if n == 0 then return end
  local list = {}
  for i = 1, n do list[i] = i end
  return table.unpack(list)
end
function GetProfessionInfo(i)
  local k = known[i]
  if not k then return end
  return "Profession", 0, k.skill, k.max, 0, 0, k.line
end
C_Item = {
  GetItemCount = function(id, withBank)
    return (bags[id] or 0) + (withBank and (bankItems[id] or 0) or 0)
  end,
}
C_TradeSkillUI = {
  GetBaseProfessionInfo = function() return { professionID = tradeLine } end,
  GetAllRecipeIDs = function()
    local ids = {}
    for spell in pairs(learned) do table.insert(ids, spell) end
    table.sort(ids)
    return ids
  end,
  GetRecipeInfo = function(id) return { learned = learned[id] == true } end,
}
function lines(key, tab, full)
  for _, l in ipairs(MGAProfessions.Lines(key, tab, full)) do table.insert(out, l.text) end
end
`;
