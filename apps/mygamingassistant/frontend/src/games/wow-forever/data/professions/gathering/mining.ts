import type { ForeverChange, HowToStep, RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import { CONFIDENCE_BASIS } from "@/games/wow-forever/types/confidenceBasis";
import type { GatheringNode } from "@/games/wow-forever/types/gathering/gatheringNode";

/**
 * The ore veins, lowest skill first. The skill each needs is NOT here: it is
 * the Forever client's Lock skill on the generated `objectSpots` rows
 * (`resolveNodes`). Item ids and vein names are those rows' keys.
 */
export const MINING_NODES: readonly GatheringNode[] = [
  { name: "Copper", itemId: 2770, node: "Copper Vein" },
  { name: "Tin", itemId: 2771, node: "Tin Vein" },
  { name: "Silver", itemId: 2775, node: "Silver Vein", rare: true },
  { name: "Iron", itemId: 2772, node: "Iron Deposit" },
  { name: "Gold", itemId: 2776, node: "Gold Vein", rare: true },
  { name: "Mithril", itemId: 3858, node: "Mithril Deposit" },
  { name: "Truesilver", itemId: 7911, node: "Truesilver Deposit", rare: true },
  { name: "Dark Iron", itemId: 11370, node: "Dark Iron Deposit" },
  { name: "Small Thorium", itemId: 10620, node: "Small Thorium Vein" },
  // Classic Era: yellow 290, green 300, grey 350 — not the usual +25 / +50 / +100.
  { name: "Rich Thorium", itemId: 10620, node: "Rich Thorium Vein", offsets: { yellow: 15, green: 25, grey: 75 } },
];

/**
 * Getting going. `Find Minerals` (spell 2580) and the Mining Pick (item 2901)
 * are both in the Forever launch client, so the command is real.
 */
export const MINING_STEPS: readonly HowToStep[] = [
  {
    id: "train",
    title: "Train Mining",
    detail:
      "Every starting area has a Junior Mining Trainer. Junior trainers only teach up to 75 and don't teach smelting, so at 50 go to a town or capital trainer.",
    stuck: "Mining stopped going up at 75? Train Journeyman at a town or capital trainer.",
  },
  {
    id: "pick",
    title: "Buy a Mining Pick",
    detail: "Trade Supplies and General Goods vendors sell it. Keep it in your bags; no need to equip.",
    warning: "No pick in your bags = you can't mine.",
  },
  {
    id: "track",
    title: "Turn on Find Minerals",
    detail: "Ore veins show as yellow dots on your minimap. Turn it on from the Professions window.",
    command: "/cast Find Minerals",
    stuck: "Tracking switches off when you die. You can't track minerals and herbs at the same time.",
  },
  {
    id: "mine",
    title: "Mine every vein you pass",
    detail: "Right-click a vein until it's empty. Only the first successful mine of a vein gives a skill point.",
  },
  {
    id: "smelt",
    title: "Smelt at a forge (optional)",
    detail: "Smelting is part of Mining; stand at a forge (cities, bigger towns).",
    stuck: "Smelt grayed out? Not close enough to a forge.",
  },
];

/** The Classic route to 300 — zones and ranks are Classic Era, none confirmed for Forever. */
export const MINING_ROUTE: readonly RouteStep[] = [
  {
    kind: "craft",
    skill: "1–65",
    name: "Copper",
    materials: {
      A: "Elwynn Forest, Dun Morogh, Teldrassil (Chunk of Amber gives Copper), Darkshore, or Zephras Isle",
      H: "Durotar, Mulgore, Tirisfal Glades, Silverpine Forest, or Zephras Isle",
    },
    source: "Forever's Poor Copper Vein gives skill only to 20.",
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "50",
    name: "Learn Journeyman Mining",
    detail: "A town or capital trainer — not a Junior one. Needs level 10; 5 silver in Classic. Raises your cap to 150.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "65–125",
    name: "Tin and Silver (and Copper until it's green)",
    materials: {
      A: "Westfall, Loch Modan, Redridge Mountains or Wetlands",
      H: "The Barrens, Silverpine Forest, Hillsbrad Foothills, Stonetalon Mountains or Ashenvale",
    },
    source: "Silver is rare — it spawns in place of Tin.",
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "125",
    name: "Learn Expert Mining",
    detail: "Needs level 20; about 50 silver in Classic. Raises your cap to 225.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "125–175",
    name: "Iron and Gold",
    materials: "Arathi Highlands, Thousand Needles, Desolace, Alterac Mountains, Stranglethorn Vale or Badlands",
    source: "Gold is rare — it spawns in place of Iron.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "175–245",
    name: "Mithril, then Truesilver from 230",
    materials: "The Hinterlands, Tanaris, Badlands or Searing Gorge",
    source: "Truesilver is rare — it spawns in place of Mithril.",
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "200",
    name: "Learn Artisan Mining",
    detail: "Needs level 35; 5 gold in Classic. Raises your cap to 300 — learn it before Mithril takes you past 225.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "245–275",
    name: "Small Thorium",
    materials: "Un'Goro Crater, Felwood, Blasted Lands, Western Plaguelands or Burning Steppes",
    source: "Dark Iron (Searing Gorge, Burning Steppes) is optional.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "275–300",
    name: "Rich and Small Thorium",
    materials: "Un'Goro Crater, Eastern Plaguelands, Winterspring, Burning Steppes or Silithus",
    source: "Rich Thorium turns green at 300 — mine both.",
    confidence: "unconfirmed",
  },
];

/**
 * What Forever changed. `confirmed` rows are in the Forever launch client
 * (1.60.1.70790): the ore stack size, the recipes, their reagents and the
 * object they're cast at. The rest are beta reports — server-side, so unconfirmed.
 */
export const MINING_FOREVER_CHANGES: readonly ForeverChange[] = [
  { text: "Junior trainers teach Mining up to 75 and no smelting.", confidence: "unconfirmed", basis: CONFIDENCE_BASIS.beta },
  {
    text: "Poor Copper Vein and Chunk of Amber (Teldrassil) give Copper Ore, and skill only to 20.",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
  { text: "Ore stacks to 20.", confidence: "confirmed" },
  {
    text: "Smelt Azerothium at 275 (2 Pitchblende + 1 Coal, at a forge). Smelt Heavy Thorium at 300 needs a Molten Foundry.",
    confidence: "confirmed",
  },
  {
    text: "Scarce materials: Pyrite (from Copper, Tin and Iron), Bauxite (Mithril) and Pitchblende (Thorium).",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
  { text: "A Heavy Thorium Vein grows in Mount Hyjal (the Scourge area).", confidence: "unconfirmed", basis: CONFIDENCE_BASIS.beta },
  {
    text: "Mining makes camp items: a Lodestone at 20, a Rock Garden at 140 and a Molten Foundry at 300.",
    confidence: "confirmed",
  },
  {
    text: "The Lodestone gives melee attack power (it doesn't stack with Blessing of Might). The Rock Garden spawns a vein; its blueprint drops from Relic Guardians at the Wetlands Excavation Site.",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
  { text: "Find Minerals now stacks with other tracking, but not with Find Herbs.", confidence: "unconfirmed", basis: CONFIDENCE_BASIS.beta },
  {
    text: "Veins reportedly respawn faster — one source says faster with more players nearby. Reports disagree.",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
  {
    text: "\"Mining for Dummies\", a reward from early starting-zone quests, teaches Mining with +2 skill, up to 15. On Zephras Isle it comes from the quest \"Harvesting Windstones\".",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
  {
    text: "The Legacy talent Bountiful Harvest gives more scarce materials. Gathering earns no Legacy points.",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
];
