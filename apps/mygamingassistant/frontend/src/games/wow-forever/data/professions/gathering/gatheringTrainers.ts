import type { CraftingTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import type { TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";

/**
 * Mining trainers. Ids, areas and coordinates are the World Map's Classic
 * (cmangos) rows — `wowWorldMapSearch.test.ts` checks every one against
 * `classicServices.json`. Forever's Junior trainers aren't in that data, so
 * they're only mentioned in text (`trainerNote`).
 */
const PIKKLE: TrainerNpc = { name: "Pikkle", npcId: 8128, where: "Gadgetzan, Tanaris", x: 51.1, y: 28.1 };

export const MINING_TRAINERS: CraftingTrainers = {
  cities: {
    // Darnassus has no mining trainer.
    A: [
      { city: "Stormwind", npc: { name: "Gelman Stonehand", npcId: 5513, where: "Stormwind City", x: 59.3, y: 37.8 } },
      { city: "Ironforge", npc: { name: "Geofram Bouldertoe", npcId: 4254, where: "Ironforge", x: 50.0, y: 26.3 } },
    ],
    H: [
      { city: "Orgrimmar", npc: { name: "Makaru", npcId: 3357, where: "Orgrimmar", x: 73.1, y: 26.1 } },
      { city: "Thunder Bluff", npc: { name: "Brek Stonehoof", npcId: 3001, where: "Thunder Bluff", x: 34.4, y: 57.9 } },
      { city: "Undercity", npc: { name: "Brom Killian", npcId: 4598, where: "Undercity", x: 56.0, y: 37.5 } },
    ],
  },
  towns: {
    A: [
      { name: "Yarr Hammerstone", npcId: 5392, where: "Kharanos, Dun Morogh", x: 50.0, y: 50.3 },
      { name: "Dank Drizzlecut", npcId: 1701, where: "Gol'Bolar Quarry, Dun Morogh", x: 69.3, y: 55.5 },
      { name: "Brock Stoneseeker", npcId: 1681, where: "Thelsamar, Loch Modan", x: 37.0, y: 47.8 },
      { name: "Kurdram Stonehammer", npcId: 6297, where: "Auberdine, Darkshore", x: 38.2, y: 41.0 },
      { name: "Matt Johnson", npcId: 3137, where: "Darkshire, Duskwood", x: 74.1, y: 49.6 },
      PIKKLE,
    ],
    H: [
      { name: "Krunn", npcId: 3175, where: "Razor Hill, Durotar", x: 51.8, y: 40.9 },
      { name: "Johan Focht", npcId: 3555, where: "The Sepulcher, Silverpine Forest", x: 43.4, y: 40.5 },
      PIKKLE,
    ],
  },
};
