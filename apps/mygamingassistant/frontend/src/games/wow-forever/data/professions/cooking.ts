import type { HowToStep, RouteStep } from "@/games/wow-forever/data/professions/professionTypes";

/**
 * Fastest Cooking 1–300. "confirmed" rows were seen on a Forever beta trainer
 * (Stephen Ryback, Stormwind) or in the beta client; the rest are Classic.
 */
export const COOKING_ROUTE: readonly RouteStep[] = [
  {
    kind: "craft",
    skill: "1–10",
    name: "Charred Wolf Meat or Roasted Boar Meat",
    materials: "Stringy Wolf Meat or Chunk of Boar Meat",
    mats: [{ id: 2672, name: "Stringy Wolf Meat" }, { id: 769, name: "Chunk of Boar Meat" }],
    source: "Trainer — you may already know it",
    confidence: "confirmed",
  },
  {
    kind: "craft",
    skill: "10–50",
    name: "Spiced Wolf Meat",
    materials: "Stringy Wolf Meat + Mild Spices",
    mats: [{ id: 2672, name: "Stringy Wolf Meat" }, { id: 2678, name: "Mild Spices" }],
    source: "Trainer, 50c. Mild Spices from the cooking supplier next to the trainer",
    confidence: "confirmed",
  },
  {
    kind: "milestone",
    skill: "50",
    name: "Learn Journeyman Cook",
    detail: "Any cooking trainer, 5s. Raises your cap to 150.",
    confidence: "confirmed",
  },
  {
    kind: "craft",
    skill: "50–80",
    name: "Coyote Steak or Boiled Clams",
    materials: "Coyote Meat, or Clam Meat + Refreshing Spring Water",
    mats: [{ id: 2673, name: "Coyote Meat" }, { id: 5503, name: "Clam Meat" }, { id: 159, name: "Refreshing Spring Water" }],
    source: "Trainer, 1s each",
    note: "Coyotes roam Westfall and Redridge; clams drop from murlocs and coastal crawlers.",
    confidence: "confirmed",
  },
  {
    kind: "craft",
    skill: "80–125",
    name: "Dry Pork Ribs",
    materials: "Boar Ribs + Mild Spices",
    mats: [{ id: 2677, name: "Boar Ribs" }, { id: 2678, name: "Mild Spices" }],
    source: "Trainer, 1s 50c",
    note: "Boar Ribs drop from boars all over the 15–30 zones.",
    confidence: "confirmed",
  },
  {
    kind: "milestone",
    skill: "125",
    name: "Buy the Expert Cookbook",
    detail: {
      A: "1g from Shandrina in Ashenvale. Needs level 20. Raises your cap to 225.",
      H: "1g from Wulan in Shadowprey Village, Desolace. Needs level 20. Raises your cap to 225.",
    },
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "125–175",
    name: "Goblin Deviled Clams",
    materials: "Tangy Clam Meat + Hot Spices",
    mats: [{ id: 5504, name: "Tangy Clam Meat" }, { id: 2692, name: "Hot Spices" }],
    source: "Trainer, 3s",
    confidence: "confirmed",
  },
  {
    kind: "craft",
    skill: "175–215",
    name: "Roast Raptor, Hot Wolf Ribs or Mithril Head Trout",
    materials: "Raptor Flesh, Red Wolf Meat or Raw Mithril Head Trout",
    mats: [{ id: 12184, name: "Raptor Flesh" }, { id: 12203, name: "Red Wolf Meat" }, { id: 8365, name: "Raw Mithril Head Trout" }],
    source: "Recipe vendors in Booty Bay, Arathi Highlands and Gadgetzan",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "200–225",
    name: "Spider Sausage",
    materials: "2 White Spider Meat",
    mats: [{ id: 12205, name: "White Spider Meat" }],
    source: "Trainer",
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "225",
    name: "Artisan quest: Clamlette Surprise",
    detail:
      "From Dirge Quikcleave in the Gadgetzan inn, Tanaris. Needs level 35. Bring 12 Giant Egg, 10 Zesty Clam Meat and 20 Alterac Swiss. Raises your cap to 300.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "225–265",
    name: "Monster Omelet",
    materials: "Giant Egg + Soothing Spices",
    mats: [{ id: 12207, name: "Giant Egg" }, { id: 3713, name: "Soothing Spices" }],
    source: "Recipe vendors in Tanaris",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "265–300",
    name: "Nightfin Soup or Poached Sunscale Salmon",
    materials: "Raw Nightfin Snapper + Refreshing Spring Water, or Raw Sunscale Salmon",
    mats: [{ id: 13759, name: "Raw Nightfin Snapper" }, { id: 159, name: "Refreshing Spring Water" }, { id: 13760, name: "Raw Sunscale Salmon" }],
    source: "Gikkix in Tanaris",
    note: "Both are fish — cheapest if you fish them yourself.",
    confidence: "unconfirmed",
  },
];

export const COOKING_STEPS: readonly HowToStep[] = [
  {
    id: "train",
    title: "Train Cooking at a cooking trainer",
    detail: "It's free to start. Nothing shows in your spellbook until you do.",
  },
  {
    id: "spellbook",
    title: "Put Cooking on your action bar",
    detail: "Open your spellbook (P), find Cooking and drag it to your action bar.",
    stuck:
      "Not there? Check the General tab and turn the page. Or type the command below in chat — if it says you don't know the spell, go back to step 1.",
    command: "/cast Cooking",
  },
  {
    id: "fire",
    title: "Stand next to a cooking fire",
    detail:
      "In Forever, the Stormwind and Orgrimmar city fires reportedly don't count. The Ironforge fire pits and the fire beside the Undercity trainer do. Outside a city, place a campfire: Flint and Tinder + Simple Wood, sold by the cooking trainer.",
    stuck: "Recipes grayed out with \"Requires cooking fire\"? You're too far from a working fire.",
  },
  {
    id: "cook",
    title: "Pick a recipe and click Create All",
    detail: "Each cook takes a couple of seconds. Moving cancels the rest.",
  },
];
