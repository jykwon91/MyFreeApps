import type { CampBlueprintDrop } from "@/games/wow-forever/types/campObjects/campBlueprintDrop";

/**
 * Blueprint item id (Forever game files) -> who drops it. Server-side, so not in
 * the game files: taken from player guides (wow-professions.com camping guide,
 * Warcraft Tavern camping objects, checked 2026-11-17) and shown as Unconfirmed.
 * A Blueprint missing here reads "where it drops isn't known yet" — never guess one.
 */
export const CAMP_BLUEPRINT_DROPS: Readonly<Record<number, CampBlueprintDrop>> = {
  273085: { boss: "Rath'mael", place: "Ruins of Lordaeron" },
  273112: { boss: "Ras Frostwhisper", place: "Scholomance" },
  273086: { boss: "Gilnid", place: "The Deadmines" },
  273113: { boss: "Golem Lord Argelmach", place: "Blackrock Depths" },
  273103: { boss: "Shade of the Archmage", place: "City of Dalaran" },
  273092: { boss: "Sneed", place: "The Deadmines" },
  273117: { boss: "Ezra Grimm", place: "Stratholme" },
  273096: { boss: "Razorclaw the Butcher", place: "Shadowfang Keep" },
  273121: { boss: "Vectus", place: "Scholomance" },
  273099: { boss: "Unstable Sentinel", place: "City of Dalaran" },
  273124: { boss: "Baroness Anastari", place: "Stratholme" },
  273105: { boss: "Commander Springvale", place: "Shadowfang Keep" },
  273118: { boss: "Doctor Theolen Krastinov", place: "Scholomance" },
};
