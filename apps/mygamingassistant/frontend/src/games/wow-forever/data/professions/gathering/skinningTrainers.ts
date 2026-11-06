import type { CraftingTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";

/**
 * Skinning trainers. Ids, areas and coordinates are the World Map's Classic
 * (cmangos) rows — `wowWorldMapSearch.test.ts` checks every one against
 * `classicServices.json`. Forever's Junior trainers aren't in that data, so
 * they're only mentioned in text (`trainerNote`).
 */
export const SKINNING_TRAINERS: CraftingTrainers = {
  cities: {
    A: [
      { city: "Stormwind", npc: { name: "Maris Granger", npcId: 1292, where: "Stormwind City", x: 72.1, y: 62.2 } },
      { city: "Ironforge", npc: { name: "Balthus Stoneflayer", npcId: 6291, where: "Ironforge", x: 39.9, y: 32.5 } },
      { city: "Darnassus", npc: { name: "Eladriel", npcId: 6292, where: "Darnassus", x: 64.1, y: 22.3 } },
    ],
    H: [
      { city: "Orgrimmar", npc: { name: "Thuwd", npcId: 7088, where: "Orgrimmar", x: 63.4, y: 45.4 } },
      { city: "Thunder Bluff", npc: { name: "Mooranta", npcId: 7089, where: "Thunder Bluff", x: 44.4, y: 43.2 } },
      { city: "Undercity", npc: { name: "Killian Hagey", npcId: 7087, where: "Undercity", x: 70.2, y: 59.2 } },
    ],
  },
  towns: {
    A: [{ name: "Wilma Ranthal", npcId: 6295, where: "Render's Valley, Redridge Mountains", x: 83.7, y: 71.3 }],
    H: [
      { name: "Malux", npcId: 12030, where: "Shadowprey Village, Desolace", x: 23.2, y: 69.7 },
      { name: "Kulleg Stonehorn", npcId: 8144, where: "Camp Mojache, Feralas", x: 74.5, y: 43.0 },
    ],
  },
};
