import { listedRankTrainers } from "@/games/wow-forever/data/professions/rankTrainers";
import type { TrainerNpc } from "@/games/wow-forever/data/professions/professionTypes";
import type { CraftingRank, CraftingTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";

/**
 * First Aid trainers, the Expert book's vendors and the Artisan quest's
 * doctors. Ids, areas and coordinates are the World Map's Classic (cmangos)
 * rows — a test checks every one against `classicServices.json`. Forever's
 * Junior trainers aren't in that data, so they're only mentioned in text.
 */
export const FIRST_AID_TRAINERS: CraftingTrainers = {
  cities: {
    A: [
      { city: "Stormwind", npc: { name: "Shaina Fuller", npcId: 2327, where: "Stormwind City", x: 53.0, y: 44.7 } },
      { city: "Ironforge", npc: { name: "Nissa Firestone", npcId: 5150, where: "Ironforge", x: 55.1, y: 58.3 } },
      { city: "Darnassus", npc: { name: "Dannelor", npcId: 4211, where: "Darnassus", x: 51.7, y: 12.2 } },
    ],
    H: [
      { city: "Orgrimmar", npc: { name: "Arnok", npcId: 3373, where: "Orgrimmar", x: 34.2, y: 84.6 } },
      { city: "Thunder Bluff", npc: { name: "Pand Stonebinder", npcId: 2798, where: "Thunder Bluff", x: 29.7, y: 21.2 } },
      { city: "Undercity", npc: { name: "Mary Edras", npcId: 4591, where: "Undercity", x: 73.2, y: 55.1 } },
    ],
  },
  towns: {
    A: [
      { name: "Michelle Belle", npcId: 2329, where: "Goldshire, Elwynn Forest", x: 43.4, y: 65.6 },
      { name: "Thamner Pol", npcId: 2326, where: "Kharanos, Dun Morogh", x: 47.2, y: 52.6 },
      { name: "Byancie", npcId: 6094, where: "Dolanaar, Teldrassil", x: 55.3, y: 56.8 },
      { name: "Fremal Doohickey", npcId: 3181, where: "Menethil Harbor, Wetlands", x: 10.8, y: 61.4 },
    ],
    H: [
      { name: "Rawrk", npcId: 5943, where: "Razor Hill, Durotar", x: 54.2, y: 41.9 },
      { name: "Vira Younghoof", npcId: 5939, where: "Bloodhoof Village, Mulgore", x: 46.1, y: 64.0 },
      { name: "Nurse Neela", npcId: 5759, where: "Brill, Tirisfal Glades", x: 61.8, y: 52.8 },
    ],
  },
};

// Expert: the book "Expert First Aid – Under Wraps" (Classic vendors; they also sell the Heavy Silk and Mageweave manuals).
const DENEB_WALKER: TrainerNpc = { name: "Deneb Walker", npcId: 2805, where: "Stromgarde Keep, Arathi Highlands", x: 27.0, y: 58.8 };
const BALAI_LOKWEIN: TrainerNpc = { name: "Balai Lok'Wein", npcId: 13476, where: "Brackenwall Village, Dustwallow Marsh", x: 36.5, y: 30.4 };
// Artisan: the quest "Triage", from the Trauma Surgeons (Classic).
const DOCTOR_GUSTAF: TrainerNpc = { name: "Doctor Gustaf VanHowzen", npcId: 12939, where: "Theramore Isle, Dustwallow Marsh", x: 67.8, y: 49.0 };
const DOCTOR_GREGORY: TrainerNpc = { name: "Doctor Gregory Victor", npcId: 12920, where: "Hammerfall, Arathi Highlands", x: 73.4, y: 36.9 };

/** Rank-ups on the way to 300: a trainer at 50, a book at 125, a quest at 225. */
export const FIRST_AID_RANKS: readonly CraftingRank[] = [
  {
    skill: 50,
    name: "Journeyman",
    level: 10,
    cap: 150,
    trainers: { kind: "list", trainers: listedRankTrainers("firstaid", "Journeyman") },
    confidence: "unconfirmed",
  },
  {
    skill: 125,
    name: "Expert",
    cap: 225,
    trainers: {
      kind: "book",
      book: "Expert First Aid – Under Wraps",
      bookItemId: 16084,
      price: "1 gold in the game files",
      vendors: { A: DENEB_WALKER, H: BALAI_LOKWEIN },
      trip: {
        A: "Stromgarde Keep is in the Eastern Kingdoms — from Darnassus that's a boat trip to Menethil Harbor first. Triage at 225 is on the other continent, in Theramore.",
        H: "Brackenwall Village is in Kalimdor — from Undercity that's a zeppelin trip to Orgrimmar first. Triage at 225 is on the other continent, at Hammerfall.",
      },
    },
    confidence: "unconfirmed",
  },
  {
    skill: 225,
    name: "Artisan",
    level: 35,
    cap: 300,
    trainers: {
      kind: "quest",
      quest: "Triage",
      givers: { A: DOCTOR_GUSTAF, H: DOCTOR_GREGORY },
      detail: {
        A: "Save 15 patients before 6 die, and turn it in the moment you reach 15. Its lead-in, Alliance Trauma, is from Nissa Firestone in Ironforge.",
        H: "Save 15 patients before 6 die, and turn it in the moment you reach 15. Its lead-in, Horde Trauma, is from Arnok in Orgrimmar.",
      },
      trip: {
        A: "Theramore is in Kalimdor — take the boat from Menethil Harbor in the Wetlands to Theramore Isle.",
        H: "Hammerfall is in the Eastern Kingdoms — take the zeppelin from Orgrimmar to Undercity, then head south-east to Arathi Highlands.",
      },
    },
    confidence: "unconfirmed",
  },
];
