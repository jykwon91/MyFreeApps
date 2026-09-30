import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";
import type { CityTrainers, TownTrainers } from "@/games/wow-forever/data/professions/professionTypes";

/**
 * Capital-city trainers. All six cities list them in the Forever beta client;
 * coordinates are Classic (cmangos) and may differ slightly in Forever.
 */
export const CITY_TRAINERS: readonly CityTrainers[] = [
  { city: "Stormwind", faction: "A", cooking: { name: "Stephen Ryback", coords: "78, 53" }, fishing: { name: "Arnold Leland", coords: "55, 70" } },
  { city: "Ironforge", faction: "A", cooking: { name: "Daryl Riknussun", coords: "60, 36" }, fishing: { name: "Grimnur Stonebrand", coords: "48, 7" } },
  { city: "Darnassus", faction: "A", cooking: { name: "Alegorn", coords: "49, 21" }, fishing: { name: "Astaia", coords: "48, 57" } },
  { city: "Orgrimmar", faction: "H", cooking: { name: "Zamja", coords: "57, 54" }, fishing: { name: "Lumak", coords: "70, 29" } },
  { city: "Thunder Bluff", faction: "H", cooking: { name: "Aska Mistrunner", coords: "51, 53" }, fishing: { name: "Kah Mistrunner", coords: "56, 46" } },
  { city: "Undercity", faction: "H", cooking: { name: "Eunice Burch", coords: "62, 45" }, fishing: { name: "Armand Cromwell", coords: "81, 31" } },
];

/** Trainers in leveling towns, so you don't have to run back to a city. */
export const TOWN_TRAINERS: Readonly<Record<PlayerFaction, TownTrainers>> = {
  A: {
    cooking: ["Tomas (Goldshire)", "Gremlock Pilsnor (Kharanos)", "Zarrin (Dolanaar)", "Crystal Boughman (Lakeshire)"],
    fishing: ["Lee Brown (Crystal Lake, Elwynn)", "Matthew Hooper (Lakeshire)", "Harold Riggs (Menethil Harbor)", "Myizz Luckycatch (Booty Bay)"],
  },
  H: {
    cooking: ["Pyall Silentstride (Bloodhoof Village)", "Mudduk (Grom'gol)", "Slagg (Hammerfall)"],
    fishing: ["Lau'Tiki (Durotar)", "Myizz Luckycatch (Booty Bay)"],
  },
};
