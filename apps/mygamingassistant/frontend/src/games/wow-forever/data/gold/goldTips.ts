import type { ChecklistItem } from "@/games/wow-forever/data/guide/guideTypes";
import type { BandTips, ClassGoldTips, GatheringTip, GoldTip } from "@/games/wow-forever/data/gold/goldTypes";

/**
 * Making gold in Forever. Classic Era advice unless a tip says otherwise —
 * no prices: Forever's economy starts fresh at launch.
 *
 * AFTER LAUNCH (2026-11-04): re-check every `confidence: "unknown"` tip and
 * the Forever-only ones, then update `GOLD_DATA_STATUS`.
 */
export const GOLD_DATA_STATUS = {
  stage: "Pre-launch",
  checkedOn: "2026-10-01",
} as const;

export const BAND_TIPS: readonly BandTips[] = [
  {
    band: "1-20",
    label: "Levels 1–20",
    top: [
      {
        id: "two-gathering",
        title: "Take two gathering professions",
        detail: "Skinning, Mining or Herbalism cost nothing to level and everything you pick up sells. Skin every beast you kill.",
        confidence: "classic",
      },
      {
        id: "sell-trade-goods",
        title: "Sell trade goods at the auction house, not the vendor",
        detail: "Cloth, leather, ore, bars and herbs sell to players for far more than a vendor pays. Grey items are the only things to vendor without thinking.",
        confidence: "classic",
      },
      {
        id: "quest-dont-grind",
        title: "Quest instead of grinding",
        detail: "Quest gold and quest rewards you can sell beat killing mobs for drops at this level — and you level faster.",
        confidence: "classic",
      },
    ],
    more: [
      {
        id: "keep-cloth",
        title: "Keep linen and wool if you'll level First Aid or Tailoring",
        detail: "Otherwise sell it — new characters always need cloth.",
        confidence: "classic",
      },
      {
        id: "skip-ranks",
        title: "Don't buy spell ranks you won't use",
        detail: "Training every rank of every spell adds up. Skip ranks of spells you don't cast while leveling.",
        confidence: "classic",
      },
      {
        id: "well-fed",
        title: "Eat cooked food before you fight",
        detail: "Forever's Well Fed buff also gives +5% experience from kills — faster leveling means more gold per hour.",
        confidence: "forever",
      },
      {
        id: "small-bags",
        title: "Small bags sell",
        detail: "Linen and Woolen bags from Tailoring, and bags that drop, always find a buyer — everyone needs bag space early.",
        confidence: "classic",
      },
    ],
  },
  {
    band: "20-40",
    label: "Levels 20–40",
    top: [
      {
        id: "save-for-mount",
        title: "Save for your first mount",
        detail: "In Classic, riding at 40 is the biggest cost of leveling. Forever hasn't published its mount level or price yet — save anyway.",
        confidence: "unknown",
      },
      {
        id: "mid-mats",
        title: "Gather what's in demand",
        detail: "Iron Ore, Mithril Ore, Liferoot and Kingsblood sell well — crafters leveling their professions need them in bulk.",
        confidence: "classic",
      },
      {
        id: "check-greens",
        title: "Check the auction house before you vendor a green",
        detail: "Some green weapons and armour sell for many times their vendor price. Look before you sell.",
        confidence: "classic",
      },
    ],
    more: [
      {
        id: "elemental-pearls",
        title: "Keep Elemental Earth and pearls",
        detail: "Elementals and drops like Iridescent and Black Pearls sell to crafters.",
        confidence: "classic",
      },
      {
        id: "repairs",
        title: "Avoid big repair bills",
        detail: "Dying repeatedly costs real gold at this level. Pull carefully and use bandages and food.",
        confidence: "classic",
      },
      {
        id: "world-recipes",
        title: "Sell recipes you can't use",
        detail: "World-drop patterns, plans and formulas are often worth more to a crafter than anything else you loot.",
        confidence: "classic",
      },
    ],
  },
  {
    band: "40-60",
    label: "Levels 40–60",
    top: [
      {
        id: "late-mats",
        title: "Farm high-end materials",
        detail: "Runecloth, Thorium Ore, Arcane Crystals and Black Lotus are what every max-level crafter and raider needs.",
        confidence: "classic",
      },
      {
        id: "elementals",
        title: "Collect elementals",
        detail: "Essence of Fire, Earth, Water and Air sell steadily for crafting and raid gear.",
        confidence: "classic",
      },
      {
        id: "disenchant",
        title: "Disenchant dungeon greens",
        detail: "If you or a friend are an enchanter, dusts and essences from dungeon greens often sell for more than the item.",
        confidence: "classic",
      },
    ],
    more: [
      {
        id: "felwood-winterspring",
        title: "Felwood and Winterspring",
        detail: "Both are rich in herbs, ore and cloth-dropping mobs for the late levels.",
        confidence: "classic",
      },
      {
        id: "black-market",
        title: "The Black Market auction house is a gold sink",
        detail: "Forever adds one in Powderfuse Port. Treat it as somewhere to spend gold, not to make it.",
        confidence: "forever",
      },
      {
        id: "new-zones",
        title: "New Forever zones",
        detail: "What sells from Forever's new zones isn't known until people play them.",
        confidence: "unknown",
      },
    ],
  },
];

export const CLASS_GOLD_TIPS: readonly ClassGoldTips[] = [
  {
    classId: "mage",
    tips: [
      {
        id: "mage-aoe",
        title: "AoE farm groups of mobs",
        detail: "Mages can pull and kill whole packs at once for cloth and drops. Whether Forever changes the spells this relies on isn't known yet.",
        confidence: "unknown",
      },
      {
        id: "mage-portals",
        title: "Sell portals",
        detail: "Once you learn portals, players pay tips to be sent to a capital. Conjured food and water can't be sold to vendors.",
        confidence: "classic",
      },
    ],
  },
  {
    classId: "warlock",
    tips: [
      {
        id: "warlock-drain",
        title: "Let your pet tank and drain",
        detail: "Warlocks lose little health and mana between fights, so they farm with almost no downtime or repair bills.",
        confidence: "classic",
      },
      {
        id: "warlock-summon",
        title: "Summon players for tips",
        detail: "Ritual of Summoning brings players to a dungeon or meeting stone — many tip for it.",
        confidence: "classic",
      },
    ],
  },
  {
    classId: "rogue",
    tips: [
      {
        id: "rogue-pickpocket",
        title: "Pick pockets before you kill",
        detail: "Humanoids drop extra coin and lockboxes when pickpocketed.",
        confidence: "classic",
      },
      {
        id: "rogue-lockpick",
        title: "Open lockboxes for others",
        detail: "Lockpicking opens other players' lockboxes — offer it in town for tips.",
        confidence: "classic",
      },
    ],
  },
  {
    classId: "hunter",
    tips: [
      {
        id: "hunter-elites",
        title: "Solo elites and rares",
        detail: "A hunter's pet lets you kill elite and rare mobs alone for their better drops.",
        confidence: "classic",
      },
      {
        id: "hunter-skinning",
        title: "Pair it with Skinning",
        detail: "You kill beasts all day anyway — skin every one.",
        confidence: "classic",
      },
    ],
  },
  {
    classId: "druid",
    tips: [
      {
        id: "druid-herbs",
        title: "Herbalism with travel form",
        detail: "Druids can stay in travel form between herbs and avoid most fights, so herb routes go fast.",
        confidence: "classic",
      },
    ],
  },
  {
    classId: "paladin",
    tips: [
      {
        id: "paladin-undead",
        title: "Farm undead",
        detail: "Paladins are strong against undead, which drop cloth and sell well in places like the Eastern Plaguelands.",
        confidence: "classic",
      },
    ],
  },
  {
    classId: "priest",
    tips: [
      {
        id: "priest-wand",
        title: "Wand and save mana",
        detail: "Finishing mobs with a wand keeps downtime low, so you farm longer between drinks.",
        confidence: "classic",
      },
    ],
  },
  {
    classId: "shaman",
    tips: [
      {
        id: "shaman-ghost-wolf",
        title: "Ghost Wolf for gathering routes",
        detail: "Ghost Wolf makes you faster between herbs and ore before you have a mount.",
        confidence: "classic",
      },
    ],
  },
  {
    classId: "warrior",
    tips: [
      {
        id: "warrior-repairs",
        title: "Watch your repair bill",
        detail: "Warriors take the most damage and pay the most in repairs. Gather while you level and eat between fights instead of resting.",
        confidence: "classic",
      },
    ],
  },
];

export const GATHERING_TIPS: readonly GatheringTip[] = [
  { profession: "Skinning", what: "Leather and hides from every beast you kill.", pairsWith: "Herbalism or Mining — or with Leatherworking later." },
  { profession: "Herbalism", what: "Herbs for potions and flasks; demand never stops.", pairsWith: "Mining or Skinning, or Alchemy later." },
  { profession: "Mining", what: "Ore, stone and gems for every gear crafter.", pairsWith: "Herbalism or Skinning, or Blacksmithing / Engineering later." },
];

export const SELL_ITEMS: readonly GoldTip[] = [
  { id: "sell-mats", title: "Crafting materials", detail: "Cloth, leather, ore, bars, herbs, elementals.", confidence: "classic" },
  { id: "sell-recipes", title: "Recipes", detail: "Patterns, plans and formulas you can't use.", confidence: "classic" },
  { id: "sell-greens", title: "Good greens and blues", detail: "Check the auction house first.", confidence: "classic" },
  { id: "sell-bags", title: "Bags", detail: "Every new character needs them.", confidence: "classic" },
];

export const VENDOR_ITEMS: readonly GoldTip[] = [
  { id: "vendor-greys", title: "Grey items", detail: "Junk — vendor all of it.", confidence: "classic" },
  { id: "vendor-cheap-greens", title: "Greens nobody buys", detail: "If the auction house has many unsold for less than vendor price, vendor yours.", confidence: "classic" },
  { id: "vendor-food", title: "Low-level food and water", detail: "Rarely worth an auction-house deposit.", confidence: "classic" },
];

export const AH_BASICS: readonly string[] = [
  "Look at what's listed before you post — price just under the lowest sensible listing, not far below it.",
  "Posting costs a deposit you lose if it doesn't sell, so don't list cheap junk.",
  "Sell in stacks of 20 (or the size crafters buy) — singles take longer to sell.",
  "Prices are usually higher in the evening and at weekends when more people play.",
];

export const GOLD_DONT_DO: readonly ChecklistItem[] = [
  {
    id: "no-buying-gold",
    title: "Don't buy gold",
    detail: "It's against the rules and gets accounts banned — and the sites that sell it steal accounts.",
  },
  {
    id: "no-blind-vendoring",
    title: "Don't vendor greens without checking",
    detail: "Some sell for many times the vendor price.",
  },
  {
    id: "no-dropping-profession",
    title: "Don't drop a high profession for a quick change",
    detail: "Unlearning loses all your skill — you'd start again from 1.",
  },
  {
    id: "no-big-undercuts",
    title: "Don't undercut by a lot",
    detail: "Undercutting by half pushes the whole market down, including your next sale.",
  },
  {
    id: "no-craft-for-profit",
    title: "Don't level a crafting profession to make money",
    detail: "Leveling one costs gold; it pays off later, if at all. Gathering is what makes money while you level.",
  },
];
