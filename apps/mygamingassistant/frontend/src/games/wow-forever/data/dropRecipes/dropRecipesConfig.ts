import type { CraftingProfession } from "@/games/wow-forever/types/crafting";
import { DROP_RECIPE_SORT, type DropRecipeSort } from "@/games/wow-forever/types/dropRecipes/dropRecipeSort";
import { DROP_RECIPE_SOURCE, type DropRecipeSource } from "@/games/wow-forever/types/dropRecipes/dropRecipeSource";
import { DROP_RECIPE_TRADE, type DropRecipeTrade } from "@/games/wow-forever/types/dropRecipes/dropRecipeTrade";

export const DROP_RECIPES_PATH = "/wow-forever/recipe-drops";

/** Enchanting first: the page was asked for to hunt Formulas. */
export const DROP_RECIPE_PROFESSIONS: readonly CraftingProfession[] = [
  "enchanting",
  "tailoring",
  "leatherworking",
  "blacksmithing",
  "alchemy",
  "engineering",
  "firstaid",
];

export const DEFAULT_DROP_RECIPE_PROFESSION: CraftingProfession = "enchanting";

export const DROP_RECIPE_PARAMS = { profession: "p", source: "source", sort: "sort", trade: "trade", character: "who" } as const;

export const DROP_RECIPE_SOURCE_LABELS: Readonly<Record<DropRecipeSource, string>> = {
  [DROP_RECIPE_SOURCE.openWorld]: "Open world",
  [DROP_RECIPE_SOURCE.dungeon]: "Dungeon",
  [DROP_RECIPE_SOURCE.raid]: "Raid",
  [DROP_RECIPE_SOURCE.random]: "Random drop",
};

export const DROP_RECIPE_SOURCES: readonly DropRecipeSource[] = Object.values(DROP_RECIPE_SOURCE);

export const DROP_RECIPE_TRADE_LABELS: Readonly<Record<DropRecipeTrade, string>> = {
  [DROP_RECIPE_TRADE.auctionHouse]: "Auction House",
  [DROP_RECIPE_TRADE.bindOnPickup]: "Bind on pickup",
};

export const DROP_RECIPE_TRADES: readonly DropRecipeTrade[] = Object.values(DROP_RECIPE_TRADE);

export const DROP_RECIPE_SORT_LABELS: Readonly<Record<DropRecipeSort, string>> = {
  [DROP_RECIPE_SORT.skill]: "Skill",
  [DROP_RECIPE_SORT.odds]: "Best odds",
};

export const DROP_RECIPES_TEXT = {
  title: "Drop-only recipes",
  documentTitle: "Drop-only recipes · WoW Forever",
  subtitle: "Profession recipes you can only get from monster drops, with the best places to farm them.",
  classicNote:
    "Classic data: the mobs, chances and spots come from Classic's server data and may differ in WoW Forever. Recipes Forever added aren't listed: where they drop isn't known yet.",
  vendorNote: "Some of the best recipes come from reputation vendors instead, so they aren't here:",
  vendorLink: "see the profession guide",
  professionLabel: "Profession",
  sourceLabel: "Where it drops",
  allSources: "All",
  sortLabel: "Sort by",
  tradeLabel: "Can you buy it?",
  allTrades: "All",
  count: (n: number) => (n === 1 ? "1 recipe" : `${n} recipes`),
  /** "58 recipes · Jason Kwon knows 5" */
  countKnown: (n: number, known: number, who: string) => `${n === 1 ? "1 recipe" : `${n} recipes`} · ${who} knows ${known}`,
  knownBadge: "Known",
  characterNote: "Pick a character to cross out the recipes they already know. US characters; Blizzard updates a character when they log out.",
  knownLoading: (who: string) => `Reading ${who}'s recipes from Blizzard…`,
  /** "Crossed out: what Jason Kwon knows (Enchanting 225 / 300)." */
  knownReady: (who: string, profession: string, skill: number, maxSkill: number) =>
    `Crossed out: what ${who} knows (${profession} ${skill} / ${maxSkill}).`,
  knownNotLearned: (who: string, profession: string) => `${who} hasn't learned ${profession}, so nothing is crossed out.`,
  knownNotFound: (who: string) => `Blizzard doesn't know a character named ${who}. Check the spelling (US characters only).`,
  knownError: "Couldn't read that character's recipes from Blizzard.",
  showAll: "Clear character",
  empty: "No drop-only recipe matches these filters. Try All on one of them.",
  /** The profession has no drop-only recipe of the picked kind at all, whatever the other filters: say why. */
  noneForTrade: {
    [DROP_RECIPE_TRADE.bindOnPickup]: (profession: string) =>
      `None of ${profession}'s bind-on-pickup recipes are drop-only: vendors sell them, quests give them, or where they drop isn't known yet (most are new in WoW Forever). Try All under Can you buy it?`,
    [DROP_RECIPE_TRADE.auctionHouse]: (profession: string) =>
      `Every drop-only ${profession} recipe binds when picked up, so none can be bought. Try All under Can you buy it?`,
  } satisfies Record<DropRecipeTrade, (profession: string) => string>,
  loadError: "Couldn't load the recipes.",
  bindOnPickup: "Binds when picked up: you have to loot it yourself.",
  tradeable: "Tradeable: someone may be selling it.",
  checkAuctionHouse: "Check the Auction House",
  formula: "Recipe item",
  recipeLink: "Reagents and what it does",
  openWorldHeading: "Open-world mobs",
  instanceHeading: "Dungeons and raids",
  moreTargets: (n: number) => `And ${n} more ${n === 1 ? "mob" : "mobs"}.`,
  /** "Random drop: any of 444 kinds of mobs, level 10–37, mostly in Duskwood, Wetlands." */
  random: (mobs: number, levels: string, zones: readonly string[]) =>
    `Random drop: any of ${mobs.toLocaleString("en-US")} kinds of mobs, ${levels}${zones.length ? `, mostly in ${zones.join(", ")}` : ""}, can drop it, very rarely. There's no good farm spot.`,
  randomTradeable: "Your best bet is the Auction House.",
} as const;
