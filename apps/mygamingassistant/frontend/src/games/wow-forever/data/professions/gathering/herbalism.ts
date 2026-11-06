import type { ForeverChange, HowToStep, RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import { CONFIDENCE_BASIS } from "@/games/wow-forever/types/confidenceBasis";
import type { GatheringNode } from "@/games/wow-forever/types/gathering/gatheringNode";

/**
 * The herbs, lowest skill first. The skill each needs is NOT here: it is the
 * Forever client's Lock skill on the generated `objectSpots` rows
 * (`resolveNodes`). Item ids and herb names are those rows' keys.
 */
export const HERBALISM_NODES: readonly GatheringNode[] = [
  { name: "Peacebloom", itemId: 2447, node: "Peacebloom" },
  { name: "Silverleaf", itemId: 765, node: "Silverleaf" },
  { name: "Earthroot", itemId: 2449, node: "Earthroot" },
  { name: "Mageroyal", itemId: 785, node: "Mageroyal" },
  { name: "Briarthorn", itemId: 2450, node: "Briarthorn" },
  { name: "Stranglekelp", itemId: 3820, node: "Stranglekelp" },
  { name: "Bruiseweed", itemId: 2453, node: "Bruiseweed" },
  { name: "Wild Steelbloom", itemId: 3355, node: "Wild Steelbloom" },
  { name: "Grave Moss", itemId: 3369, node: "Grave Moss" },
  { name: "Kingsblood", itemId: 3356, node: "Kingsblood" },
  { name: "Liferoot", itemId: 3357, node: "Liferoot" },
  { name: "Fadeleaf", itemId: 3818, node: "Fadeleaf" },
  { name: "Goldthorn", itemId: 3821, node: "Goldthorn" },
  { name: "Khadgar's Whisker", itemId: 3358, node: "Khadgar's Whisker" },
  { name: "Wintersbite", itemId: 3819, node: "Wintersbite" },
  { name: "Firebloom", itemId: 4625, node: "Firebloom" },
  { name: "Purple Lotus", itemId: 8831, node: "Purple Lotus" },
  { name: "Arthas' Tears", itemId: 8836, node: "Arthas' Tears" },
  { name: "Sungrass", itemId: 8838, node: "Sungrass" },
  { name: "Blindweed", itemId: 8839, node: "Blindweed" },
  { name: "Ghost Mushroom", itemId: 8845, node: "Ghost Mushroom" },
  { name: "Gromsblood", itemId: 8846, node: "Gromsblood" },
  { name: "Golden Sansam", itemId: 13464, node: "Golden Sansam" },
  { name: "Dreamfoil", itemId: 13463, node: "Dreamfoil" },
  { name: "Mountain Silversage", itemId: 13465, node: "Mountain Silversage" },
  { name: "Plaguebloom", itemId: 13466, node: "Plaguebloom" },
  { name: "Icecap", itemId: 13467, node: "Icecap" },
  { name: "Black Lotus", itemId: 13468, node: "Black Lotus", rare: true },
];

/** Getting going. `Find Herbs` (spell 2383) is in the Forever launch client, so the command is real. */
export const HERBALISM_STEPS: readonly HowToStep[] = [
  {
    id: "train",
    title: "Train Herbalism",
    detail: "No tool needed. Junior Herbalism Trainers teach up to 75; at 50 go to a town or capital trainer.",
    stuck: "Stuck at 75? Train Journeyman at a town or capital trainer.",
  },
  {
    id: "track",
    title: "Turn on Find Herbs",
    detail: "Herbs show as yellow dots on your minimap. Turn it on from the Professions window.",
    command: "/cast Find Herbs",
    stuck: "Tracking switches off when you die. You can't track herbs and minerals at the same time.",
  },
  {
    id: "pick",
    title: "Pick every herb you pass",
    detail: "Right-click the herb. Its tooltip shows the skill needed (red if yours is too low). Herbs give skill until they turn gray.",
  },
  {
    id: "artisan-early",
    title: "Learn Artisan before Tanaris or Searing Gorge",
    detail: "Neither zone has an herbalism trainer, so train Artisan at 200 before you go.",
    warning: "Turn up at 225 without Artisan and every herb stops giving skill.",
  },
];

/** The Classic route to 300 — zones and ranks are Classic Era, none confirmed for Forever. */
export const HERBALISM_ROUTE: readonly RouteStep[] = [
  {
    kind: "craft",
    skill: "1–70",
    name: "Peacebloom, Silverleaf, Earthroot and Mageroyal",
    materials: {
      A: "Elwynn Forest, Dun Morogh, Teldrassil or Zephras Isle",
      H: "Durotar, Mulgore, Tirisfal Glades or Zephras Isle",
    },
    source: "Forever adds Wilted Peacebloom and Stunted Silverleaf here (reported in the beta).",
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "50",
    name: "Learn Journeyman Herbalism",
    detail: "A town or capital trainer — not a Junior one. Needs level 10; 5 silver in Classic. Raises your cap to 150.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "70–115",
    name: "Briarthorn, Stranglekelp and Bruiseweed",
    materials: {
      A: "Darkshore, Loch Modan, Westfall or Redridge Mountains",
      H: "The Barrens, Silverpine Forest, Ashenvale or Stonetalon Mountains",
    },
    source: "Stranglekelp grows underwater along the coast.",
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "125",
    name: "Learn Expert Herbalism",
    detail: "Needs level 20; 50 silver in Classic. Raises your cap to 225.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "115–170",
    name: "Wild Steelbloom, Grave Moss, Kingsblood, Liferoot and Fadeleaf",
    materials: "Hillsbrad Foothills, Stonetalon Mountains, Wetlands, Arathi Highlands or Thousand Needles",
    source: "Duskwood has the most Grave Moss.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "170–205",
    name: "Goldthorn, Khadgar's Whisker and Wintersbite",
    materials: "Arathi Highlands, north Stranglethorn Vale, Swamp of Sorrows, Dustwallow Marsh or Feralas",
    source: "Wintersbite grows only in Alterac Mountains.",
    confidence: "unconfirmed",
  },
  {
    kind: "milestone",
    skill: "200",
    name: "Learn Artisan Herbalism",
    detail:
      "Needs level 35; 5 gold in Classic. Raises your cap to 300 — learn it before Tanaris or Searing Gorge, neither has an herbalism trainer.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "205–230",
    name: "Firebloom, Purple Lotus and Arthas' Tears",
    materials: "Tanaris, Searing Gorge or The Hinterlands",
    source: "Firebloom grows in Tanaris, Searing Gorge and Badlands.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "230–270",
    name: "Sungrass, Blindweed, Ghost Mushroom, Gromsblood and Golden Sansam",
    materials: "The Hinterlands, Feralas, Felwood or Un'Goro Crater",
    source: "Ghost Mushroom grows in caves — The Hinterlands and Desolace.",
    confidence: "unconfirmed",
  },
  {
    kind: "craft",
    skill: "270–300",
    name: "Dreamfoil, Mountain Silversage, Plaguebloom and Icecap",
    materials: "Felwood, Un'Goro Crater, Winterspring, Western and Eastern Plaguelands, or Silithus",
    source: "Black Lotus is rare — pick it whenever you see one.",
    confidence: "unconfirmed",
  },
];

/**
 * What Forever changed. `confirmed` rows are in the Forever launch client
 * (1.60.1.70790): the new herbs and their items, the seeds, the camp recipes
 * and their skills, the Lotus Claw enchant and First Aid's healing potions.
 * The rest are beta reports — server-side, so unconfirmed.
 */
export const HERBALISM_FOREVER_CHANGES: readonly ForeverChange[] = [
  {
    text: "Junior trainers teach Herbalism up to 75. New starter herbs: Wilted Peacebloom and Stunted Silverleaf.",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
  { text: "New herbs: Marefoil, Demonsage and Death Lotus.", confidence: "confirmed" },
  {
    text: "Death Lotus: any herb you pick in Hyjal has a small chance to give one, with the Lotus Claw glove enchant.",
    confidence: "confirmed",
  },
  { text: "Scarce materials: Frilled Lichen, Rosecap and Stranglevine.", confidence: "confirmed" },
  {
    text: "Herb seeds in four tiers (Commonplace, Uncommon, Unusual, Scarce): grow them in a Greenhouse or combine them at a Seed Hybridizer at your camp.",
    confidence: "confirmed",
  },
  {
    text: "Herbalism makes camp items: an Incense Candle at 20, a Greenhouse at 140 and a Seed Hybridizer at 300.",
    confidence: "confirmed",
  },
  {
    text: "The Incense Candle gives Intellect (it doesn't stack with Arcane Intellect). The Greenhouse blueprint drops from Shadetooth at the Wetlands Excavation Site.",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
  {
    text: "Healing potions are First Aid now, not Alchemy: Peacebloom, Briarthorn, Bruiseweed, Liferoot, Sungrass and Golden Sansam go into them — see the First Aid guide.",
    confidence: "confirmed",
  },
  {
    text: "Find Herbs stacks with Hunter tracking and the Dwarf's Find Treasure, but not with Find Minerals.",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
  {
    text: "\"Wild Harvest\", a reward from early quests, teaches Herbalism with +2 skill, up to 15.",
    confidence: "unconfirmed",
    basis: CONFIDENCE_BASIS.beta,
  },
];
