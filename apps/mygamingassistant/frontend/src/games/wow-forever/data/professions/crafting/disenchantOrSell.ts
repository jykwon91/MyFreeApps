/**
 * "Disenchant or sell?" on the Enchanting guide. Classic Era rules (checked 2026-10-04):
 * no Enchanting skill is needed to disenchant, only green / blue / purple gear can be,
 * and the Bind on Equip check matters most because a new enchanter can destroy a valuable item.
 */

export const LOOT_CALL = {
  disenchant: "disenchant",
  compare: "compare",
  vendor: "vendor",
} as const;
export type LootCall = (typeof LOOT_CALL)[keyof typeof LOOT_CALL];

export interface LootRule {
  id: string;
  /** The kind of item, as the player sees it on the tooltip. */
  when: string;
  call: LootCall;
  why: string;
}

export const LOOT_SECTION_ID = "disenchant";

export const LOOT_RULES_INTRO = "Go down the list — the first line that fits the item is your answer.";

export const LOOT_RULES_TIP =
  "Need essences? Disenchant weapons — green weapons mostly give essence. Green armor mostly gives dust.";

export const ENCHANTING_LOOT_RULES: readonly LootRule[] = [
  {
    id: "gray-white",
    when: "Gray or white item",
    call: LOOT_CALL.vendor,
    why: "Only green, blue and purple items can be disenchanted. Sell it to any vendor.",
  },
  {
    id: "soulbound",
    when: "Soulbound — quest rewards and gear that says “Soulbound”",
    call: LOOT_CALL.disenchant,
    why: "It can't go on the Auction House, so it's disenchant or vendor. Disenchant it while you level Enchanting; once you're done, vendor it if the vendor price beats what its materials sell for.",
  },
  {
    id: "stat-green",
    when: "Green weapon, or green “of the Monkey”, “of the Eagle” and the like",
    call: LOOT_CALL.compare,
    why: "Weapons and the sought-after suffixes (of the Monkey, Eagle, Owl, Bear, Tiger, Wolf, Falcon) are Bind on Equip greens that often sell on the Auction House for more than their dust and essence. Sell it if it's worth more than the materials; disenchant it if not.",
  },
  {
    id: "blue",
    when: "Blue item",
    call: LOOT_CALL.compare,
    why: "A blue gives one shard almost every time. Sell it if it lists for more than a shard does.",
  },
  {
    id: "green-leveling",
    when: "Any other green, while you level Enchanting",
    call: LOOT_CALL.disenchant,
    why: "The route needs hundreds of dust and essences, and disenchanting what you loot is the cheapest way to get them.",
  },
  {
    id: "green-done",
    when: "Any other green, once you're done leveling",
    call: LOOT_CALL.compare,
    why: "Take the best of three: the item's Auction House price, what its materials sell for, or the vendor price. Low-level dust can be worth less than the green's vendor price.",
  },
];
