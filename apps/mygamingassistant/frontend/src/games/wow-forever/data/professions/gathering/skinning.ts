import type { ForeverChange, HowToStep, RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import { skinReach } from "@/games/wow-forever/gathering/skinBandText";
import { CONFIDENCE_BASIS } from "@/games/wow-forever/types/confidenceBasis";

/** Getting going. The Skinning Knife (item 7005) is in the Forever launch client. */
export const SKINNING_STEPS: readonly HowToStep[] = [
  {
    id: "train",
    title: "Train Skinning",
    detail: "Every starting area has a Junior Skinning Trainer. Junior trainers only teach up to 75, so at 50 go to a town or capital trainer.",
    stuck: "Skinning stopped going up at 75? Train Journeyman at a town or capital trainer.",
  },
  {
    id: "knife",
    title: "Buy a Skinning Knife",
    detail: "Leatherworking Supplies and General Goods vendors sell it. Keep it in your bags; no need to equip.",
    warning: "No knife in your bags = you can't skin.",
  },
  {
    id: "loot",
    title: "Loot first, then skin",
    detail: "Kill a beast, take everything from it, then right-click the corpse again. Most beasts can be skinned.",
  },
  {
    id: "level",
    title: "Skin beasts your skill can handle",
    detail:
      "Up to skill 100 you can skin mobs up to level skill ÷ 10 + 10 (skill 50 → level 15). From skill 100 it's skill ÷ 5 (skill 150 → level 30). Mobs level 10 and under need only skill 1.",
    stuck: "The corpse needs more skill? The mob's level is too high — skin lower-level beasts.",
  },
];

/**
 * The Classic route to 300 — zones and ranks are Classic Era, none confirmed
 * for Forever. What each level skins into comes from the generated data (the
 * Reference table), so it isn't repeated here.
 */
export const SKINNING_ROUTE: readonly RouteStep[] = [
  {
    kind: "craft",
    skill: "1–75",
    name: "Starting-zone beasts",
    materials: {
      A: "Elwynn Forest (wolves, boars), Dun Morogh, Teldrassil or Zephras Isle",
      H: "Durotar (boars, scorpids), Mulgore (plainstriders), Tirisfal Glades or Zephras Isle",
    },
    source: skinReach(75),
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "50",
    name: "Learn Journeyman Skinning",
    detail: "A town or capital trainer — not a Junior one. Needs level 10; 5 silver in Classic. Raises your cap to 150.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "75–125",
    name: "Beasts level 16–22",
    materials: {
      A: "Loch Modan, Westfall, Redridge Mountains or Darkshore",
      H: "The Barrens (west of Northwatch Hold) or Silverpine Forest",
    },
    source: skinReach(125),
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "125",
    name: "Learn Expert Skinning",
    detail: "Needs level 20; about 50 silver in Classic. Raises your cap to 225.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "125–150",
    name: "Beasts level 25–30",
    materials: "Wetlands raptors, Hillsbrad Foothills, Ashenvale or Duskwood",
    source: skinReach(150),
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "150–200",
    name: "Beasts level 30–40",
    materials: "Hillsbrad Foothills or Alterac Mountains yetis, Arathi Highlands, Thousand Needles or Stranglethorn Vale",
    source: skinReach(200),
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "200",
    name: "Learn Artisan Skinning",
    detail: "Needs level 35; 5 gold in Classic. Raises your cap to 300 — learn it before you pass 225.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "200–260",
    name: "Beasts level 40–52",
    materials: "Feralas (yetis in Feral Scar Vale), The Hinterlands or Tanaris",
    source: skinReach(260),
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "260–300",
    name: "Beasts level 50–60",
    materials: "Un'Goro Crater (dimetrodons, pterrordaxes), Winterspring, Felwood or Burning Steppes",
    source: skinReach(300),
    confidence: "unconfirmed",
  },
];

/**
 * What Forever changed. `confirmed` rows are in the Forever launch client
 * (1.60.1.70790): the new leathers and hides, the book and the camp items and
 * their blueprints (Skinning's skill line). The rest are beta reports —
 * server-side, so unconfirmed.
 */
export const SKINNING_FOREVER_CHANGES: readonly ForeverChange[] = [
  { text: "Junior trainers teach Skinning up to 75.", confidence: "unconfirmed", basis: CONFIDENCE_BASIS.beta },
  { text: "New skins: Pristine Leather, Pristine Hide and Pristine Scale, and Fel Leather and Fel Hide.", confidence: "confirmed" },
  {
    text: "Skinning makes camp items: a Camp Chair, a Field Guide and a Trapper's Workbench (the last two from blueprints).",
    confidence: "confirmed",
  },
  {
    text: "The Field Guide also gives Track Beasts, and each camp item reportedly gives 2% crit.",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
  {
    text: "\"Pelt Collecting for Beginners\", a reward from early starting-zone quests, teaches Skinning. On Zephras Isle it comes from the quest \"Harvesting Windstones\".",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
  { text: "Skinning itself reportedly works as it did in Classic.", confidence: "unconfirmed", basis: CONFIDENCE_BASIS.beta },
];
