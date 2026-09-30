/**
 * Hand-written place names the generated data doesn't carry. Names only — no
 * coordinates — so nothing here can put a marker in the wrong spot.
 *
 * - Districts: the sub-zone a capital's minimap shows ("Old Town"). The NPC
 *   data has no sub-zones inside capitals, but coordinates read there are on
 *   the city's own map, so a district name tells us which map they're on.
 * - Aliases: what players type instead of the full name.
 */

/** Capital city (zone name in zones.json) -> its districts. */
export const CITY_DISTRICTS: Readonly<Record<string, readonly string[]>> = {
  "Stormwind City": [
    "Trade District",
    "Old Town",
    "Cathedral Square",
    "Dwarven District",
    "Mage Quarter",
    "The Park",
    "Stormwind Keep",
    "The Canals",
    "Valley of Heroes",
  ],
  Ironforge: ["The Commons", "The Great Forge", "Military Ward", "Mystic Ward", "Tinker Town", "The Forlorn Cavern", "Hall of Explorers"],
  Darnassus: ["Tradesmen's Terrace", "Warrior's Terrace", "Craftsmen's Terrace", "Temple of the Moon", "Cenarion Enclave", "The Temple Gardens"],
  Orgrimmar: ["Valley of Strength", "Valley of Wisdom", "Valley of Honor", "Valley of Spirits", "The Drag", "Cleft of Shadow"],
  "Thunder Bluff": ["Hunter Rise", "Spirit Rise", "Elder Rise"],
  Undercity: ["Trade Quarter", "Magic Quarter", "War Quarter", "Rogues' Quarter", "The Apothecarium", "Royal Quarter"],
};

/** Zone name -> other names players use for it. */
export const ZONE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "Stormwind City": ["Stormwind", "SW"],
  Ironforge: ["IF"],
  Darnassus: ["Darn"],
  Orgrimmar: ["Org", "Orgri"],
  "Thunder Bluff": ["TB"],
  Undercity: ["UC"],
  "Stranglethorn Vale": ["STV", "Stranglethorn"],
  "The Barrens": ["Barrens"],
  "Elwynn Forest": ["Elwynn"],
  "Tirisfal Glades": ["Tirisfal"],
  "Hillsbrad Foothills": ["Hillsbrad"],
  "Eastern Plaguelands": ["EPL"],
  "Western Plaguelands": ["WPL"],
  "Un'Goro Crater": ["Ungoro"],
};
