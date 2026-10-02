import type { ChecklistItem } from "@/games/wow-forever/data/guide/guideTypes";
import {
  LEVEL_BAND,
  type BandTips,
  type ClassGoldTips,
  type GatheringTip,
  type GoldTip,
  type LevelBand,
} from "@/games/wow-forever/data/gold/goldTypes";

/**
 * Making gold in Forever. Classic Era advice unless a tip says otherwise —
 * no auction-house prices: Forever's economy starts fresh at launch. Where
 * to farm (with vendor-price numbers) is generated: see `gold/goldFarms.ts`.
 *
 * AFTER LAUNCH (2026-11-04): re-check every `confidence: "unknown"` tip and
 * the Forever-only ones, then update `GOLD_DATA_STATUS`.
 */
export const GOLD_DATA_STATUS = {
  stage: "Pre-launch",
  checkedOn: "2026-10-02",
} as const;

export const BAND_TIPS: readonly BandTips[] = [
  {
    band: "1-20",
    label: "Levels 1–20",
    top: [
      {
        id: "loot-everything",
        title: "Quest, and loot every mob you kill",
        detail:
          "At this level most of your gold is quest rewards and what mobs drop. Never skip a corpse — grey junk is the vendor money that pays for your spells.",
        confidence: "classic",
      },
      {
        id: "skinning-plus-one",
        title: "Take Skinning, plus Mining or Herbalism",
        detail:
          "Skinning pays from the first beast you kill, with no detour. Gather the ore or herbs you pass on the way to quests — don't go out of your way for them yet.",
        confidence: "classic",
      },
      {
        id: "keep-cloth-leather",
        title: "Keep cloth, leather, ore and herbs — vendor everything else",
        detail:
          "Linen and Wool Cloth, leather, ore and herbs sell to other players for more than a vendor pays. Grey items and white weapons and armour go straight to the vendor.",
        confidence: "classic",
      },
    ],
    more: [
      {
        id: "sell-every-town",
        title: "Empty your bags in every town you hand quests in",
        detail: "Sell junk whenever you pass a vendor so a full bag never makes you stop looting.",
        confidence: "classic",
      },
      {
        id: "bags-first",
        title: "Bags before anything else you buy",
        detail: "Every slot is more loot per trip. Buy bags, or ask a tailor, before gear upgrades.",
        confidence: "classic",
      },
      {
        id: "skip-ranks",
        title: "Don't buy spell ranks you won't use",
        detail: "Train the ranks of the spells you actually cast while leveling; skip the rest until you need them.",
        confidence: "classic",
      },
      {
        id: "well-fed",
        title: "Eat cooked food before you fight",
        detail: "Forever's Well Fed buff also gives +5% experience from kills — faster leveling means more gold per hour.",
        confidence: "forever",
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
        detail:
          "In Classic, riding is the biggest cost of leveling. Forever hasn't published its mount level or price yet — don't spend on auction-house gear you'll replace in a few levels.",
        confidence: "unknown",
      },
      {
        id: "humanoids-or-beasts",
        title: "Humanoids for cloth, beasts if you skin",
        detail:
          "Humanoids drop coin and cloth; beasts drop no coin, but their junk vendors well and you can skin them. The farm list below shows both — tick Skinning to see what it adds.",
        confidence: "classic",
      },
      {
        id: "check-greens",
        title: "Keep greens until you've seen the auction house",
        detail: "Some green weapons and armour sell to players for many times their vendor price. Look before you sell.",
        confidence: "classic",
      },
    ],
    more: [
      {
        id: "elemental-pearls",
        title: "Keep elementals and pearls",
        detail: "Elemental Earth, Fire and Water, and Iridescent and Black Pearls, sell to crafters.",
        confidence: "classic",
      },
      {
        id: "repairs",
        title: "Avoid big repair bills",
        detail: "Every death costs repairs. Farm mobs at or below your level, not above it.",
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
        id: "late-cloth",
        title: "Farm humanoids for Mageweave, then Runecloth",
        detail:
          "Every max-level crafter needs Runecloth, and it drops from humanoids from about level 50. Switch the farm list below to Most cloth to find the camps.",
        confidence: "classic",
      },
      {
        id: "elementals",
        title: "Keep every elemental and Felcloth",
        detail: "Essences, Elemental Fire and Felcloth sell steadily for crafting and raid gear.",
        confidence: "classic",
      },
      {
        id: "disenchant",
        title: "Keep dungeon blues and greens to check",
        detail: "Some sell to players; an enchanter turns the rest into dust and essences that often sell for more.",
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
        detail: "Forever's new zones aren't in the farm list — what drops there isn't known until people play them.",
        confidence: "unknown",
      },
    ],
  },
];

/** The tips for a level; no level = the start. */
export function tipsForLevel(level: number | null): BandTips {
  let band: LevelBand = LEVEL_BAND.early;
  if (level !== null && level >= 40) band = LEVEL_BAND.late;
  else if (level !== null && level >= 20) band = LEVEL_BAND.mid;
  return BAND_TIPS.find((b) => b.band === band) ?? BAND_TIPS[0];
}

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
        id: "warlock-dots",
        title: "DoT a pack, Drain Life the last one",
        detail:
          "Corruption and Curse of Agony on two or three mobs, your pet on another, then Drain Life to finish. You hardly stop between fights, so you kill more an hour than most classes.",
        confidence: "classic",
      },
      {
        id: "warlock-life-tap",
        title: "Life Tap instead of drinking",
        detail: "Life Tap turns health into mana and Drain Life puts it back — you buy almost no food or water, and that's gold you keep.",
        confidence: "classic",
      },
      {
        id: "warlock-soul-pouch",
        title: "Get a Soul Pouch",
        detail: "Soul Shards fill your bags. A Soul Pouch (made by tailors) holds them, freeing your bags for loot.",
        confidence: "classic",
      },
      {
        id: "warlock-felcloth",
        title: "Felcloth from satyrs in Felwood",
        detail: "From level 48, Felwood's satyrs drop Felcloth, which tailors and warlocks' own patterns need. Keep every piece.",
        confidence: "classic",
      },
      {
        id: "warlock-summon",
        title: "Summon players for tips",
        detail: "Ritual of Summoning needs two party members to help, so it's for when you're grouped, not farming alone.",
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
        detail: "Humanoids drop extra coin and lockboxes when pickpocketed — farm humanoid camps, not beasts.",
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
        detail: "You kill beasts all day anyway — skin every one, and tick Skinning in the farm list.",
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
  { id: "sell-cloth", title: "Every kind of cloth", detail: "Linen, Wool, Silk, Mageweave, Runecloth, Felcloth.", confidence: "classic" },
  { id: "sell-mats", title: "Leather, ore, bars, herbs", detail: "Whatever your gathering profession brings in.", confidence: "classic" },
  {
    id: "sell-elementals",
    title: "Elementals and pearls",
    detail: "Elemental Earth, Fire, Water and Air; essences; Iridescent and Black Pearls.",
    confidence: "classic",
  },
  { id: "sell-recipes", title: "Recipes", detail: "Patterns, plans and formulas you can't use.", confidence: "classic" },
  { id: "sell-greens", title: "Greens from level 20, and blues", detail: "Check the auction house first.", confidence: "classic" },
];

export const VENDOR_ITEMS: readonly GoldTip[] = [
  { id: "vendor-greys", title: "Grey items", detail: "Junk — vendor all of it, every time you pass a vendor.", confidence: "classic" },
  { id: "vendor-whites", title: "White weapons and armour", detail: "Players don't buy them; the vendor does.", confidence: "classic" },
  { id: "vendor-low-greens", title: "Greens under level 20", detail: "Rarely worth an auction-house deposit.", confidence: "classic" },
  { id: "vendor-food", title: "Low-level food and water", detail: "Vendor what you won't eat.", confidence: "classic" },
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
    id: "no-elites",
    title: "Don't farm elites, rares or dungeons alone for gold",
    detail: "They're slow and you die; repairs eat the profit. Ordinary mobs in packs, at or below your level, pay best.",
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
