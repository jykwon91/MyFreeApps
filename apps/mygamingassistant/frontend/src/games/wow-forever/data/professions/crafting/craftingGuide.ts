import type { ForeverChange, HowToStep } from "@/games/wow-forever/data/professions/professionTypes";
import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import { ENCHANTING_LOOT_RULES, type LootRule } from "@/games/wow-forever/data/professions/crafting/disenchantOrSell";

export interface CraftingGuide {
  label: string;
  steps: readonly HowToStep[];
  routeIntro: string;
  /** Under the shopping list. */
  shoppingNote?: string;
  /** In the prices panel: what isn't asked for because you make it yourself. */
  pricedFromMaterials: string;
  forever: readonly ForeverChange[];
  /** "Disenchant or sell?" — only for professions that break loot into materials. */
  lootRules?: readonly LootRule[];
}

export const CRAFTING_GUIDES: Readonly<Record<CraftingProfession, CraftingGuide>> = {
  tailoring: {
    label: "Tailoring",
    steps: [
      {
        id: "train",
        title: "Train Tailoring at a tailoring trainer",
        detail: "Any trainer below teaches Apprentice Tailoring and your first recipes. Tailoring is one of your two main professions.",
      },
      {
        id: "thread",
        title: "Buy thread and dye from a trade goods vendor",
        detail: "Coarse, Fine, Silken and Heavy Silken Thread and the dyes are sold by trade goods vendors in every town — never farm them.",
      },
      {
        id: "cloth",
        title: "Keep every piece of cloth",
        detail: "Cloth drops from humanoid mobs (people, not beasts). Don't vendor it — the route needs hundreds.",
        warning: "If you also level First Aid, it uses the same cloth. Buy extra at the auction house rather than starving one of them.",
      },
      {
        id: "craft",
        title: "Craft the row for your skill until it turns green",
        detail: "Open your Tailoring window (press K, or find it in your spellbook) and craft. Type your skill below and the route points at your row.",
        command: "/cast Tailoring",
      },
    ],
    routeIntro: "Craft each recipe from the first skill to the second, then move to the next row.",
    pricedFromMaterials: "Bolts of cloth and Mooncloth are priced from the cloth they're made of.",
    forever: [
      {
        text: "Forever lowered the skill of many Tailoring recipes — e.g. Heavy Linen Gloves turns yellow at 50 instead of 60. The route uses Forever's numbers.",
        confidence: "confirmed",
      },
      {
        text: "Forever adds 180 Tailoring recipes (Stormsewn, Earthenweave, Ghostweave and more). Where their patterns come from isn't known yet.",
        confidence: "confirmed",
      },
    ],
  },
  enchanting: {
    label: "Enchanting",
    steps: [
      {
        id: "train",
        title: "Train Enchanting at an enchanting trainer",
        detail: "Any trainer below teaches Apprentice Enchanting, Disenchant and your first enchants.",
      },
      {
        id: "disenchant",
        title: "Disenchant the green items you loot",
        detail: "Disenchant breaks a green (or better) weapon or armour piece into dust and essences — the materials every enchant uses. Any Enchanting skill can disenchant any green. A few greens and blues are worth more sold — see Disenchant or sell? below.",
        command: "/cast Disenchant",
        stuck: "Nothing to disenchant yet? Green items drop from mobs and quest rewards. Tailoring's green crafts disenchant too.",
      },
      {
        id: "rod",
        title: "Make the Runed Copper Rod first",
        detail: "Most enchants need a runed rod in your bags. You make each one yourself, right before the route needs it.",
        warning: "Don't sell or bank your rod — enchants that need it won't show as craftable without it.",
      },
      {
        id: "craft",
        title: "Enchant your own gear to level",
        detail: "An enchant goes on an item — your own is fine. Type your skill below and the route points at your row.",
        command: "/cast Enchanting",
      },
    ],
    routeIntro: "Enchant from the first skill to the second, then move to the next row. Rod rows are one craft each — make the rod and move on.",
    pricedFromMaterials: "Motes of Magic and Enchanted Leather are priced from their materials.",
    shoppingNote: "Enchanting materials come from disenchanting green items. Tailoring and Leatherworking greens work.",
    lootRules: ENCHANTING_LOOT_RULES,
    forever: [
      {
        text: "New in Forever: Mote of Magic. Dust to Motes turns 1 Strange Dust into 3 Motes; the Runed Copper Rod and the first enchants use them.",
        confidence: "confirmed",
      },
      {
        text: "Enchant Bracer – Minor Health is now Enchant Bracer – Inferior Stamina.",
        confidence: "confirmed",
      },
      {
        text: "Beta players report Motes of Magic are sold by Enchanting Supplies vendors.",
        confidence: "unconfirmed",
      },
      {
        text: "In Classic Era any Enchanting skill can disenchant any item. Whether Forever adds a skill requirement isn't known yet.",
        confidence: "unconfirmed",
      },
      {
        text: "Forever adds 63 Enchanting recipes (necklace enchants, staves, the Arcane Salvager and more). Where their formulas come from isn't known yet.",
        confidence: "confirmed",
      },
    ],
  },
};
