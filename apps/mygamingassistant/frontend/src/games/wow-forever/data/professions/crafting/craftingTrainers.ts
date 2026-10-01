import type { Confidence, TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/**
 * Tailoring and Enchanting trainers. Ids, areas and coordinates are the World
 * Map's Classic (cmangos) rows — a test checks every one against
 * `classicServices.json`. Who teaches which rank is Classic Era; Forever may differ.
 */
export interface CraftingTrainers {
  /** One trainer per capital city, for the chosen faction. */
  cities: Readonly<Record<PlayerFaction, readonly { city: string; npc: TrainerNpc }[]>>;
  /** Trainers in leveling towns. */
  towns: Readonly<Record<PlayerFaction, readonly TrainerNpc[]>>;
}

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
};
