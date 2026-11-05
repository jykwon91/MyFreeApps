import type { Confidence, TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/**
 * Crafting trainers. Ids, areas and coordinates are the World
 * Map's Classic (cmangos) rows — a test checks every one against
 * `classicServices.json`. Who teaches which rank is Classic Era; Forever may differ.
 */
export interface CraftingTrainers {
  /** One trainer per capital city, for the chosen faction. */
  cities: Readonly<Record<PlayerFaction, readonly { city: string; npc: TrainerNpc }[]>>;
  /** Trainers in leveling towns. */
  towns: Readonly<Record<PlayerFaction, readonly TrainerNpc[]>>;
}

// Engineering: the city trainers who also teach Expert (Classic).
const SPRINGSPINDLE_FIZZLEGEAR: TrainerNpc = { name: "Springspindle Fizzlegear", npcId: 5174, where: "Ironforge", x: 68.5, y: 43.5 };
const ROXXIK: TrainerNpc = { name: "Roxxik", npcId: 11017, where: "Orgrimmar", x: 76.2, y: 25.2 };

export const CRAFTING_TRAINERS: Readonly<Record<CraftingProfession, CraftingTrainers>> = {
  tailoring: {
    cities: {
      A: [
        { city: "Stormwind", npc: { name: "Georgio Bolero", npcId: 1346, where: "Stormwind City", x: 53.1, y: 81.3 } },
        { city: "Ironforge", npc: { name: "Jormund Stonebrow", npcId: 5153, where: "Ironforge", x: 43.1, y: 29.4 } },
        { city: "Darnassus", npc: { name: "Me'lynn", npcId: 4159, where: "Darnassus", x: 63.4, y: 22.4 } },
      ],
      H: [
        { city: "Orgrimmar", npc: { name: "Magar", npcId: 3363, where: "Orgrimmar", x: 63.6, y: 49.9 } },
        { city: "Thunder Bluff", npc: { name: "Tepa", npcId: 3004, where: "Thunder Bluff", x: 44.5, y: 45.4 } },
        { city: "Undercity", npc: { name: "Josef Gregorian", npcId: 4576, where: "Undercity", x: 70.8, y: 30.7 } },
      ],
    },
    towns: {
      A: [
        { name: "Eldrin", npcId: 1103, where: "Eastvale Logging Camp, Elwynn Forest", x: 79.2, y: 69.0 },
        { name: "Grondal Moonbreeze", npcId: 4193, where: "Auberdine, Darkshore", x: 38.2, y: 40.5 },
      ],
      H: [
        { name: "Bowen Brisboise", npcId: 3523, where: "Cold Hearth Manor, Tirisfal Glades", x: 52.6, y: 55.5 },
        { name: "Kil'hala", npcId: 3484, where: "The Crossroads, The Barrens", x: 52.2, y: 31.7 },
      ],
    },
  },
  enchanting: {
    cities: {
      A: [
        { city: "Stormwind", npc: { name: "Lucan Cordell", npcId: 1317, where: "Stormwind City", x: 52.9, y: 74.5 } },
        { city: "Ironforge", npc: { name: "Gimble Thistlefuzz", npcId: 5157, where: "Ironforge", x: 59.8, y: 45.4 } },
        { city: "Darnassus", npc: { name: "Taladan", npcId: 4213, where: "Darnassus", x: 58.4, y: 13.1 } },
      ],
      H: [
        { city: "Orgrimmar", npc: { name: "Godan", npcId: 3345, where: "Orgrimmar", x: 53.9, y: 38.7 } },
        { city: "Thunder Bluff", npc: { name: "Teg Dawnstrider", npcId: 3011, where: "Thunder Bluff", x: 44.9, y: 37.5 } },
        { city: "Undercity", npc: { name: "Lavinia Crowe", npcId: 4616, where: "Undercity", x: 62.5, y: 61.8 } },
      ],
    },
    towns: {
      A: [{ name: "Alanna Raveneye", npcId: 3606, where: "The Oracle Glade, Teldrassil", x: 36.7, y: 34.2 }],
      H: [{ name: "Vance Undergloom", npcId: 5695, where: "Brill, Tirisfal Glades", x: 61.8, y: 51.6 }],
    },
  },
  alchemy: {
    cities: {
      A: [
        { city: "Stormwind", npc: { name: "Lilyssia Nightbreeze", npcId: 5499, where: "Stormwind City", x: 55.7, y: 86.1 } },
        { city: "Ironforge", npc: { name: "Tally Berryfizz", npcId: 5177, where: "Ironforge", x: 66.6, y: 55.7 } },
        { city: "Darnassus", npc: { name: "Ainethil", npcId: 4160, where: "Darnassus", x: 54.9, y: 24.0 } },
      ],
      H: [
        { city: "Orgrimmar", npc: { name: "Yelmak", npcId: 3347, where: "Orgrimmar", x: 56.8, y: 33.0 } },
        { city: "Thunder Bluff", npc: { name: "Bena Winterhoof", npcId: 3009, where: "Thunder Bluff", x: 46.6, y: 33.2 } },
        { city: "Undercity", npc: { name: "Doctor Herbert Halsey", npcId: 4611, where: "Undercity", x: 47.8, y: 73.3 } },
      ],
    },
    towns: {
      A: [
        { name: "Cyndra Kindwhisper", npcId: 3603, where: "Dolanaar, Teldrassil", x: 57.6, y: 60.8 },
        { name: "Ghak Healtouch", npcId: 1470, where: "Thelsamar, Loch Modan", x: 37.1, y: 49.4 },
      ],
      H: [
        { name: "Carolai Anise", npcId: 2132, where: "Brill, Tirisfal Glades", x: 59.4, y: 52.2 },
        { name: "Miao'zan", npcId: 3184, where: "Sen'jin Village, Durotar", x: 55.4, y: 73.9 },
      ],
    },
  },
  blacksmithing: {
    cities: {
      // Darnassus has no blacksmithing trainer.
      A: [
        { city: "Stormwind", npc: { name: "Therum Deepforge", npcId: 5511, where: "Stormwind City", x: 63.7, y: 37.0 } },
        { city: "Ironforge", npc: { name: "Bengus Deepforge", npcId: 4258, where: "Ironforge", x: 52.5, y: 41.5 } },
      ],
      H: [
        { city: "Orgrimmar", npc: { name: "Saru Steelfury", npcId: 3355, where: "Orgrimmar", x: 82.3, y: 23.0 } },
        { city: "Thunder Bluff", npc: { name: "Karn Stonehoof", npcId: 2998, where: "Thunder Bluff", x: 39.4, y: 55.1 } },
        { city: "Undercity", npc: { name: "James Van Brunt", npcId: 4596, where: "Undercity", x: 61.3, y: 30.6 } },
      ],
    },
    towns: {
      A: [
        { name: "Smith Argus", npcId: 514, where: "Goldshire, Elwynn Forest", x: 41.7, y: 65.5 },
        { name: "Tognus Flintfire", npcId: 1241, where: "Kharanos, Dun Morogh", x: 45.3, y: 51.9 },
        { name: "Delfrum Flintbeard", npcId: 6299, where: "Auberdine, Darkshore", x: 38.2, y: 40.9 },
      ],
      H: [
        { name: "Dwukk", npcId: 3174, where: "Razor Hill, Durotar", x: 52.0, y: 40.7 },
        { name: "Guillaume Sorouy", npcId: 3557, where: "The Sepulcher, Silverpine Forest", x: 43.2, y: 41.1 },
        { name: "Traugh", npcId: 3478, where: "The Crossroads, The Barrens", x: 51.3, y: 28.9 },
      ],
    },
  },
  leatherworking: {
    cities: {
      A: [
        { city: "Stormwind", npc: { name: "Simon Tanner", npcId: 5564, where: "Stormwind City", x: 71.7, y: 63.0 } },
        { city: "Ironforge", npc: { name: "Fimble Finespindle", npcId: 5127, where: "Ironforge", x: 40.2, y: 33.7 } },
        { city: "Darnassus", npc: { name: "Telonis", npcId: 4212, where: "Darnassus", x: 64.4, y: 21.5 } },
      ],
      H: [
        { city: "Orgrimmar", npc: { name: "Karolek", npcId: 3365, where: "Orgrimmar", x: 62.8, y: 44.1 } },
        { city: "Thunder Bluff", npc: { name: "Una", npcId: 3007, where: "Thunder Bluff", x: 41.5, y: 42.6 } },
        { city: "Undercity", npc: { name: "Arthur Moore", npcId: 4588, where: "Undercity", x: 70.2, y: 57.4 } },
      ],
    },
    towns: {
      A: [
        { name: "Adele Fielder", npcId: 1632, where: "Crystal Lake, Elwynn Forest", x: 46.4, y: 62.0 },
        { name: "Nadyia Maneweaver", npcId: 3605, where: "Ban'ethil Hollow, Teldrassil", x: 41.9, y: 49.4 },
        { name: "Aayndia Floralwind", npcId: 3967, where: "Astranaar, Ashenvale", x: 36.0, y: 52.1 },
      ],
      H: [
        { name: "Chaw Stronghide", npcId: 3069, where: "Bloodhoof Village, Mulgore", x: 44.9, y: 61.5 },
        { name: "Shelene Rhobart", npcId: 3549, where: "Balnir Farmstead, Tirisfal Glades", x: 65.4, y: 60.1 },
        { name: "Krulmoo Fullmoon", npcId: 3703, where: "Camp Taurajo, The Barrens", x: 44.8, y: 59.5 },
      ],
    },
  },
  engineering: {
    cities: {
      // Darnassus and Thunder Bluff have no engineering trainer.
      A: [
        { city: "Stormwind", npc: { name: "Lilliam Sparkspindle", npcId: 5518, where: "Stormwind City", x: 62.1, y: 30.3 } },
        { city: "Ironforge", npc: SPRINGSPINDLE_FIZZLEGEAR },
      ],
      H: [
        { city: "Orgrimmar", npc: ROXXIK },
        { city: "Undercity", npc: { name: "Franklin Lloyd", npcId: 11031, where: "Undercity", x: 76.1, y: 74.0 } },
      ],
    },
    towns: {
      // Town trainers teach Apprentice only (Classic): train Journeyman in a city.
      A: [
        { name: "Bronk Guzzlegear", npcId: 1702, where: "Kharanos, Dun Morogh", x: 50.2, y: 50.4 },
        { name: "Deek Fizzlebizz", npcId: 3290, where: "Stonewrought Dam, Loch Modan", x: 45.9, y: 13.4 },
        { name: "Jenna Lemkenilli", npcId: 11037, where: "Auberdine, Darkshore", x: 38.3, y: 41.1 },
      ],
      H: [
        { name: "Mukdrak", npcId: 11025, where: "Razor Hill, Durotar", x: 52.2, y: 40.8 },
        { name: "Twizwick Sprocketgrind", npcId: 10993, where: "Red Rocks, Mulgore", x: 58.6, y: 39.4 },
        { name: "Tinkerwiz", npcId: 3494, where: "Ratchet, The Barrens", x: 62.7, y: 36.3 },
      ],
    },
  },
};

/** Where a rank is trained: named trainers per faction, any trainer, or somewhere the map can't point to. */
export type RankTrainers =
  | { kind: "any" }
  | { kind: "named"; trainers: Readonly<Record<PlayerFaction, TrainerNpc>> }
  | { kind: "dungeon"; name: string; dungeon: string; dungeonLink: string; detail: string };

export interface CraftingRank {
  /** Skill you must reach to train it. */
  skill: number;
  name: "Journeyman" | "Expert" | "Artisan";
  level: number;
  /** New skill cap. */
  cap: number;
  trainers: RankTrainers;
  /** Shown on the rank before, so the trip isn't a surprise. */
  headsUp?: string;
  confidence: Confidence;
}

// Artisan Blacksmithing: one neutral trainer for both factions (Classic).
const BRIKK_KEENCRAFT: TrainerNpc = { name: "Brikk Keencraft", npcId: 2836, where: "Booty Bay, Stranglethorn Vale", x: 29.0, y: 75.6 };
// Artisan Engineering: likewise.
const BUZZEK_BRACKETSWING: TrainerNpc = { name: "Buzzek Bracketswing", npcId: 8736, where: "Gadgetzan, Tanaris", x: 52.3, y: 27.7 };

const JOURNEYMAN: CraftingRank = { skill: 50, name: "Journeyman", level: 10, cap: 150, trainers: { kind: "any" }, confidence: "confirmed" };

/** Rank-ups on the way to 300 (Apprentice, cap 75, comes with learning the profession). */
export const CRAFTING_RANKS: Readonly<Record<CraftingProfession, readonly CraftingRank[]>> = {
  tailoring: [
    JOURNEYMAN,
    {
      skill: 125,
      name: "Expert",
      level: 20,
      cap: 225,
      trainers: {
        kind: "named",
        trainers: {
          A: { name: "Georgio Bolero", npcId: 1346, where: "Stormwind City", x: 53.1, y: 81.3 },
          H: { name: "Josef Gregorian", npcId: 4576, where: "Undercity", x: 70.8, y: 30.7 },
        },
      },
      headsUp: "Artisan (at 200) is trained far away — Theramore for Alliance, Tarren Mill for Horde.",
      confidence: "unconfirmed",
    },
    {
      skill: 200,
      name: "Artisan",
      level: 35,
      cap: 300,
      trainers: {
        kind: "named",
        trainers: {
          A: { name: "Timothy Worthington", npcId: 11052, where: "Theramore Isle, Dustwallow Marsh", x: 66.2, y: 51.8 },
          H: { name: "Daryl Stack", npcId: 2399, where: "Tarren Mill, Hillsbrad Foothills", x: 63.7, y: 20.8 },
        },
      },
      confidence: "unconfirmed",
    },
  ],
  enchanting: [
    JOURNEYMAN,
    {
      skill: 125,
      name: "Expert",
      level: 20,
      cap: 225,
      trainers: {
        kind: "named",
        trainers: {
          A: { name: "Kitta Firewind", npcId: 11072, where: "Brackwell Pumpkin Patch, Elwynn Forest", x: 64.9, y: 70.7 },
          H: { name: "Hgarth", npcId: 11074, where: "Sun Rock Retreat, Stonetalon Mountains", x: 49.2, y: 57.2 },
        },
      },
      headsUp: "Artisan (at 200) is trained inside the Uldaman dungeon — plan a group or wait until you're about level 45.",
      confidence: "unconfirmed",
    },
    {
      skill: 200,
      name: "Artisan",
      level: 35,
      cap: 300,
      trainers: {
        kind: "dungeon",
        name: "Annora",
        dungeon: "Uldaman",
        dungeonLink: "/wow-forever/map?npc=classic-i-286",
        detail: "She's past mobs in the low 40s — bring a group or come back at about level 45.",
      },
      confidence: "unconfirmed",
    },
  ],
  alchemy: [
    JOURNEYMAN,
    {
      skill: 125,
      name: "Expert",
      level: 20,
      cap: 225,
      trainers: {
        kind: "named",
        trainers: {
          A: { name: "Ainethil", npcId: 4160, where: "Darnassus", x: 54.9, y: 24.0 },
          H: { name: "Doctor Herbert Halsey", npcId: 4611, where: "Undercity", x: 47.8, y: 73.3 },
        },
      },
      headsUp: "Artisan (at 200) is trained far away — Sardor Isle in Feralas for Alliance, Stonard in Swamp of Sorrows for Horde.",
      confidence: "unconfirmed",
    },
    {
      skill: 200,
      name: "Artisan",
      level: 35,
      cap: 300,
      trainers: {
        kind: "named",
        trainers: {
          A: { name: "Kylanna Windwhisper", npcId: 7948, where: "Sardor Isle, Feralas", x: 32.6, y: 43.8 },
          H: { name: "Rogvar", npcId: 1386, where: "Stonard, Swamp of Sorrows", x: 48.5, y: 55.8 },
        },
      },
      confidence: "unconfirmed",
    },
  ],
  blacksmithing: [
    JOURNEYMAN,
    {
      skill: 125,
      name: "Expert",
      level: 20,
      cap: 225,
      trainers: {
        kind: "named",
        trainers: {
          A: { name: "Bengus Deepforge", npcId: 4258, where: "Ironforge", x: 52.5, y: 41.5 },
          H: { name: "Saru Steelfury", npcId: 3355, where: "Orgrimmar", x: 82.3, y: 23.0 },
        },
      },
      headsUp: "Artisan (at 200) is trained in one place for both factions — Booty Bay, at the south tip of Stranglethorn Vale.",
      confidence: "unconfirmed",
    },
    {
      skill: 200,
      name: "Artisan",
      level: 35,
      cap: 300,
      trainers: { kind: "named", trainers: { A: BRIKK_KEENCRAFT, H: BRIKK_KEENCRAFT } },
      confidence: "unconfirmed",
    },
  ],
  leatherworking: [
    JOURNEYMAN,
    {
      skill: 125,
      name: "Expert",
      level: 20,
      cap: 225,
      trainers: {
        kind: "named",
        trainers: {
          A: { name: "Simon Tanner", npcId: 5564, where: "Stormwind City", x: 71.7, y: 63.0 },
          H: { name: "Karolek", npcId: 3365, where: "Orgrimmar", x: 62.8, y: 44.1 },
        },
      },
      headsUp: "Artisan (at 200) is trained by Telonis in Darnassus (Alliance) or Una in Thunder Bluff (Horde).",
      confidence: "unconfirmed",
    },
    {
      skill: 200,
      name: "Artisan",
      level: 35,
      cap: 300,
      trainers: {
        kind: "named",
        trainers: {
          A: { name: "Telonis", npcId: 4212, where: "Darnassus", x: 64.4, y: 21.5 },
          H: { name: "Una", npcId: 3007, where: "Thunder Bluff", x: 41.5, y: 42.6 },
        },
      },
      confidence: "unconfirmed",
    },
  ],
  engineering: [
    {
      skill: 50,
      name: "Journeyman",
      level: 10,
      cap: 150,
      trainers: { kind: "named", trainers: { A: SPRINGSPINDLE_FIZZLEGEAR, H: ROXXIK } },
      confidence: "unconfirmed",
    },
    {
      skill: 125,
      name: "Expert",
      level: 20,
      cap: 225,
      trainers: { kind: "named", trainers: { A: SPRINGSPINDLE_FIZZLEGEAR, H: ROXXIK } },
      headsUp: "Artisan (at 200) is trained in one place for both factions — Gadgetzan, in Tanaris.",
      confidence: "unconfirmed",
    },
    {
      skill: 200,
      name: "Artisan",
      level: 35,
      cap: 300,
      trainers: { kind: "named", trainers: { A: BUZZEK_BRACKETSWING, H: BUZZEK_BRACKETSWING } },
      confidence: "unconfirmed",
    },
  ],
};
