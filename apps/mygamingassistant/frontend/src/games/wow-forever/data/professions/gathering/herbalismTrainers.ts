import type { CraftingTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";

/**
 * Herbalism trainers. Ids, areas and coordinates are the World Map's Classic
 * (cmangos) rows — `wowWorldMapSearch.test.ts` checks every one against
 * `classicServices.json`. Forever's Junior trainers aren't in that data, so
 * they're only mentioned in text (`trainerNote`). Tanaris and Searing Gorge
 * have none.
 */
const FLORA: TrainerNpc = { name: "Flora Silverwind", npcId: 908, where: "Booty Bay, Stranglethorn Vale", x: 27.7, y: 77.9 };
const MALVOR: TrainerNpc = { name: "Malvor", npcId: 12025, where: "Moonglade", x: 45.4, y: 47.0 };

export const HERBALISM_TRAINERS: CraftingTrainers = {
  cities: {
    A: [
      { city: "Stormwind", npc: { name: "Tannysa", npcId: 5566, where: "Stormwind City", x: 54.3, y: 84.1 } },
      { city: "Ironforge", npc: { name: "Reyna Stonebranch", npcId: 5137, where: "Ironforge", x: 55.9, y: 59.1 } },
      { city: "Darnassus", npc: { name: "Firodren Mooncaller", npcId: 4204, where: "Darnassus", x: 47.9, y: 68.0 } },
    ],
    H: [
      { city: "Orgrimmar", npc: { name: "Jandi", npcId: 3404, where: "Orgrimmar", x: 55.6, y: 39.5 } },
      { city: "Thunder Bluff", npc: { name: "Komin Winterhoof", npcId: 3013, where: "Thunder Bluff", x: 50.0, y: 40.4 } },
      { city: "Undercity", npc: { name: "Martha Alliestar", npcId: 4614, where: "Undercity", x: 54.0, y: 49.5 } },
    ],
  },
  towns: {
    A: [
      { name: "Malorne Bladeleaf", npcId: 3604, where: "Dolanaar, Teldrassil", x: 57.7, y: 60.6 },
      { name: "Kali Healtouch", npcId: 1473, where: "Thelsamar, Loch Modan", x: 36.5, y: 48.5 },
      { name: "Alma Jainrose", npcId: 812, where: "Lakeshire, Redridge Mountains", x: 16.6, y: 45.8 },
      { name: "Cylania Rootstalker", npcId: 3965, where: "Mystral Lake, Ashenvale", x: 50.7, y: 67.2 },
      { name: "Telurinon Moonshadow", npcId: 1458, where: "Menethil Harbor, Wetlands", x: 8.0, y: 55.8 },
      { name: "Brant Jasperbloom", npcId: 4898, where: "Theramore Isle, Dustwallow Marsh", x: 64.0, y: 47.5 },
      FLORA,
      MALVOR,
    ],
    H: [
      { name: "Mishiki", npcId: 3185, where: "Sen'jin Village, Durotar", x: 55.4, y: 75.1 },
      { name: "Faruza", npcId: 2114, where: "Brill, Tirisfal Glades", x: 59.8, y: 52.1 },
      { name: "Aranae Venomblood", npcId: 2390, where: "Tarren Mill, Hillsbrad Foothills", x: 61.7, y: 19.5 },
      { name: "Angrun", npcId: 2856, where: "Grom'gol Base Camp, Stranglethorn Vale", x: 32.2, y: 27.4 },
      { name: "Ruw", npcId: 8146, where: "Camp Mojache, Feralas", x: 76.0, y: 43.3 },
      FLORA,
      MALVOR,
    ],
  },
};
