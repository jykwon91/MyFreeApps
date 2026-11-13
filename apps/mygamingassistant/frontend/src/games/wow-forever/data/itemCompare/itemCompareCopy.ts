import { CHARACTER_PAGE_PATH } from "@/games/wow-forever/data/character/characterConfig";

export const ITEM_COMPARE_COPY = {
  heading: "Currently equipped",
  dialogLabel: "Item and the gear you wear in its slot",
  replacesTwoHander: "Replaces your two-hander",
  damageNotCompared: "Damage not compared",
  otherEffectsNotCompared: "Other effects (procs, on-use, Equip:) aren't compared",
  enchantsNotCounted: "Enchants on your gear aren't counted",
  noCharacter: "Compare with your gear: look up your character and press Use for MGA's pages.",
  noCharacterLink: "Look up your character",
  characterLookupPath: CHARACTER_PAGE_PATH,
  characterError: "Couldn't load your character's gear, so there's nothing to compare with.",
  itemsError: "Couldn't load the item list, so your gear can't be compared.",
  nothingEquipped: "Nothing equipped in this slot yet.",
  noChanges: "No stat changes",
  equippedUnknown: "Stats not known: this item isn't in the game files with fixed stats.",
  candidateUnknown: "Its stats depend on its random enchantment, so it can't be compared.",
} as const;
