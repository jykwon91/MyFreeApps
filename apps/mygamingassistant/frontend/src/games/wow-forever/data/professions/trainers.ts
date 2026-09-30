import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { CityTrainers, TownTrainers } from "@/games/wow-forever/data/professions/professionTypes";

/**
 * Capital-city trainers. All six cities list them in the Forever beta client;
 * ids and coordinates are the World Map's Classic (cmangos) rows — a test
 * checks every one against `classicServices.json`.
 */
export const CITY_TRAINERS: readonly CityTrainers[] = [
  {
    city: "Stormwind",
    faction: "A",
    cooking: { name: "Stephen Ryback", npcId: 5482, where: "Stormwind City", x: 78.2, y: 53.1 },
    fishing: { name: "Arnold Leland", npcId: 5493, where: "Stormwind City", x: 55.0, y: 69.6 },
  },
  {
    city: "Ironforge",
    faction: "A",
    cooking: { name: "Daryl Riknussun", npcId: 5159, where: "Ironforge", x: 60.1, y: 36.4 },
    fishing: { name: "Grimnur Stonebrand", npcId: 5161, where: "Ironforge", x: 48.1, y: 6.9 },
  },
  {
    city: "Darnassus",
    faction: "A",
    cooking: { name: "Alegorn", npcId: 4210, where: "Darnassus", x: 49.0, y: 21.2 },
    fishing: { name: "Astaia", npcId: 4156, where: "Darnassus", x: 47.9, y: 56.7 },
  },
  {
    city: "Orgrimmar",
    faction: "H",
    cooking: { name: "Zamja", npcId: 3399, where: "Orgrimmar", x: 57.4, y: 54.0 },
    fishing: { name: "Lumak", npcId: 3332, where: "Orgrimmar", x: 69.8, y: 29.2 },
  },
  {
    city: "Thunder Bluff",
    faction: "H",
    cooking: { name: "Aska Mistrunner", npcId: 3026, where: "Thunder Bluff", x: 50.7, y: 53.1 },
    fishing: { name: "Kah Mistrunner", npcId: 3028, where: "Thunder Bluff", x: 56.1, y: 46.4 },
  },
  {
    city: "Undercity",
    faction: "H",
    cooking: { name: "Eunice Burch", npcId: 4552, where: "Undercity", x: 62.1, y: 44.9 },
    fishing: { name: "Armand Cromwell", npcId: 4573, where: "Undercity", x: 80.7, y: 31.3 },
  },
];

const MYIZZ = { name: "Myizz Luckycatch", npcId: 2834, where: "Booty Bay, Stranglethorn Vale", x: 27.5, y: 77.1 };

/** Trainers in leveling towns, so you don't have to run back to a city. */
export const TOWN_TRAINERS: Readonly<Record<PlayerFaction, TownTrainers>> = {
  A: {
    cooking: [
      { name: "Tomas", npcId: 1430, where: "Goldshire, Elwynn Forest", x: 44.4, y: 66.0 },
      { name: "Gremlock Pilsnor", npcId: 1699, where: "Kharanos, Dun Morogh", x: 47.7, y: 52.3 },
      { name: "Zarrin", npcId: 6286, where: "Dolanaar, Teldrassil", x: 57.1, y: 61.3 },
      { name: "Crystal Boughman", npcId: 3087, where: "Lakeshire, Redridge Mountains", x: 17.7, y: 43.5 },
    ],
    fishing: [
      { name: "Lee Brown", npcId: 1651, where: "Crystal Lake, Elwynn Forest", x: 47.6, y: 62.3 },
      { name: "Matthew Hooper", npcId: 1680, where: "Lakeshire, Redridge Mountains", x: 21.9, y: 51.1 },
      { name: "Harold Riggs", npcId: 3179, where: "Menethil Harbor, Wetlands", x: 8.1, y: 58.6 },
      MYIZZ,
    ],
  },
  H: {
    cooking: [
      { name: "Pyall Silentstride", npcId: 3067, where: "Bloodhoof Village, Mulgore", x: 44.9, y: 61.7 },
      { name: "Mudduk", npcId: 1382, where: "Grom'gol Base Camp, Stranglethorn Vale", x: 31.3, y: 28.0 },
      { name: "Slagg", npcId: 2818, where: "Hammerfall, Arathi Highlands", x: 74.1, y: 33.8 },
    ],
    fishing: [{ name: "Lau'Tiki", npcId: 5941, where: "Kolkar Crag, Durotar", x: 53.2, y: 81.6 }, MYIZZ],
  },
};
