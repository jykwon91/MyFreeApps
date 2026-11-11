import type { FishRecipe, HowToStep, RouteStep } from "@/games/wow-forever/data/professions/professionTypes";

/**
 * Where to fish by skill — the Classic route. Zone fishing levels are
 * server-side, so none of it is confirmed for Forever yet. The launch client
 * (1.60.1.70790, checked 2026-11-05) has the Expert book at level 20 and skill
 * 125, as Classic; who sells it, and Nat Pagle's quest, are server-side.
 */
export const FISHING_ROUTE: readonly RouteStep[] = [
  {
    kind: "craft",
    skill: "1–75",
    name: "Fish in the starting zones",
    materials: {
      A: "Elwynn Forest, Dun Morogh or Teldrassil lakes and rivers, or the Stormwind canals",
      H: "Durotar, Mulgore or Tirisfal Glades lakes and rivers",
    },
    source: "Any water in your starting zone",
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "50",
    name: "Learn Journeyman Fishing",
    detail: "Any fishing trainer. Needs level 10. Raises your cap to 150.",
    teaches: { profession: "fishing", rank: "Journeyman" },
    confidence: "confirmed",
  },
  {
    kind: "craft",
    skill: "50–150",
    name: "Fish in the 10–25 zones",
    materials: {
      A: "Westfall, Loch Modan, Darkshore or Redridge Mountains",
      H: "The Barrens (Ratchet docks) or Silverpine Forest",
    },
    source: "Rivers and coasts",
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "125",
    name: "Buy \"Expert Fishing - The Bass and You\"",
    detail: "1g from Old Man Heming on the Booty Bay docks, Stranglethorn Vale. Needs level 20. Raises your cap to 225.",
    confidence: "unconfirmed",
    buysBook: true,
  },
  {
    kind: "craft",
    skill: "150–225",
    name: "Fish the coasts",
    materials: {
      A: "Stranglethorn Vale coast, Wetlands, Hillsbrad Foothills or Desolace",
      H: "Stranglethorn Vale coast, Hillsbrad Foothills, Desolace or The Hinterlands",
    },
    source: "Coasts and big rivers",
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "225",
    name: "Artisan quest: Nat Pagle, Angler Extreme",
    detail:
      "From Nat Pagle on his island southwest of Theramore, Dustwallow Marsh. Catch one rare fish each in Feralas, Swamp of Sorrows, Desolace and Stranglethorn. Raises your cap to 300.",
    npc: { name: "Nat Pagle", npcId: 12919, where: "The Quagmire, Dustwallow Marsh", x: 58.6, y: 60.1 },
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "225–300",
    name: "Fish the high-level coasts",
    materials: "Tanaris, Feralas or Azshara coasts",
    source: "Open ocean",
    confidence: "unconfirmed",
  },
];

export const FISHING_STEPS: readonly HowToStep[] = [
  {
    id: "train",
    title: "Train Fishing at a fishing trainer — before you buy a pole",
    detail: "Buy a Fishing Pole from the fishing supplier who stands next to the trainer.",
    stuck: "Pole's \"Fishing Pole\" text is red, or it won't equip? You haven't trained Fishing yet.",
  },
  {
    id: "equip",
    title: "Equip the pole and put Fishing on your action bar",
    detail: "Right-click the pole in your bags. Then open your spellbook (P) and drag Fishing to your action bar.",
    command: "/cast Fishing",
  },
  {
    id: "cast",
    title: "Face the water and cast",
    detail:
      "When the bobber splashes, right-click it to loot. A lure (Shiny Bauble, from the fishing supplier) adds skill for 10 minutes and means fewer fish get away.",
  },
  {
    id: "swap-back",
    title: "Swap your weapon back",
    detail: "The pole replaces your weapon.",
    warning: "Re-equip your real weapon before you go fight — the pole does almost no damage.",
  },
];

/** Cooking skill needed to cook each fish. Level both together. */
export const FISH_RECIPES: readonly FishRecipe[] = [
  { skill: 1, fish: [{ id: 6291, name: "Brilliant Smallfish" }, { id: 6303, name: "Slitherskin Mackerel" }] },
  { skill: 50, fish: [{ id: 6289, name: "Longjaw Mud Snapper" }, { id: 6361, name: "Rainbow Fin Albacore" }, { id: 6317, name: "Loch Frenzy" }] },
  { skill: 80, fish: [{ id: 21071, name: "Sagefish" }] },
  { skill: 100, fish: [{ id: 6308, name: "Bristle Whisker Catfish" }] },
  { skill: 175, fish: [{ id: 8365, name: "Mithril Head Trout" }, { id: 6362, name: "Rockscale Cod" }, { id: 21153, name: "Greater Sagefish" }] },
  { skill: 225, fish: [{ id: 4603, name: "Spotted Yellowtail" }, { id: 13754, name: "Glossy Mightfish" }, { id: 13758, name: "Redgill" }] },
  { skill: 250, fish: [{ id: 13759, name: "Nightfin Snapper" }, { id: 13760, name: "Sunscale Salmon" }] },
  { skill: 275, fish: [{ id: 13889, name: "Whitescale Salmon" }, { id: 13888, name: "Darkclaw Lobster" }, { id: 13893, name: "Large Raw Mightfish" }] },
];
