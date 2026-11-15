import type { OpenRecipeState } from "@/games/wow-forever/types/recipes/openRecipeState";
import { RECIPE_CATEGORY, type RecipeCategory } from "@/games/wow-forever/types/recipes/recipeCategory";
import type { RecipeProfession } from "@/games/wow-forever/types/recipes/recipeProfession";

/** The Recipes page. */
export const RECIPES_PAGE_PATH = "/wow-forever/recipes";

/** The page's URL keys. */
export const RECIPE_PARAMS = { query: "q", profession: "p", category: "c" } as const;

/** Wait this long after typing stops before the search runs and the URL updates. */
export const RECIPE_SEARCH_DELAY_MS = 200;

/** Results shown at first, and per "Show more". */
export const RECIPE_PAGE_SIZE = 40;

/** The professions, A–Z. */
export const RECIPE_PROFESSIONS: readonly RecipeProfession[] = [
  "alchemy",
  "blacksmithing",
  "cooking",
  "enchanting",
  "engineering",
  "firstaid",
  "leatherworking",
  "tailoring",
];

export const RECIPE_PROFESSION_LABELS: Readonly<Record<RecipeProfession, string>> = {
  alchemy: "Alchemy",
  blacksmithing: "Blacksmithing",
  cooking: "Cooking",
  enchanting: "Enchanting",
  engineering: "Engineering",
  firstaid: "First Aid",
  leatherworking: "Leatherworking",
  tailoring: "Tailoring",
};

export const RECIPE_CATEGORIES: readonly RecipeCategory[] = Object.values(RECIPE_CATEGORY);

export const RECIPE_CATEGORY_LABELS: Readonly<Record<RecipeCategory, string>> = {
  food: "Food & drink",
  potions: "Potions & elixirs",
  bandages: "Bandages",
  weapons: "Weapons",
  armor: "Armor",
  bags: "Bags",
  enchants: "Enchants",
  ammo: "Ammo",
  explosives: "Explosives",
  devices: "Devices",
  consumables: "Other consumables",
  "trade-goods": "Trade goods",
  other: "Other",
};

/** Item class (the game files' ClassID) -> category, for items the Auction house list doesn't file. */
export const ITEM_CLASS_CATEGORY: Readonly<Record<number, RecipeCategory>> = {
  0: RECIPE_CATEGORY.consumables,
  1: RECIPE_CATEGORY.bags,
  2: RECIPE_CATEGORY.weapons,
  4: RECIPE_CATEGORY.armor,
  5: RECIPE_CATEGORY.tradeGoods,
  6: RECIPE_CATEGORY.ammo,
  7: RECIPE_CATEGORY.tradeGoods,
  11: RECIPE_CATEGORY.bags,
};

/** Consumable subclass (the game's item subclass) -> category. Anything else consumable is "Other consumables". */
export const CONSUMABLE_SUBCLASS_CATEGORY: Readonly<Record<number, RecipeCategory>> = {
  0: RECIPE_CATEGORY.explosives,
  1: RECIPE_CATEGORY.potions,
  2: RECIPE_CATEGORY.potions,
  3: RECIPE_CATEGORY.potions,
  5: RECIPE_CATEGORY.food,
  7: RECIPE_CATEGORY.bandages,
  14: RECIPE_CATEGORY.devices,
};

export const RECIPES_TEXT = {
  subtitle: "Every recipe in one search: what it makes, what goes into it, and where to learn it.",
  searchLabel: "Search recipes",
  searchPlaceholder: "A recipe, the item it makes, or an ingredient",
  prompt: "Type a recipe, the item it makes, or an ingredient (\"silk cloth\") — or pick a profession or category to list its recipes.",
  noMatch: "No recipe matches. Try fewer words, or clear the profession and category.",
  loadError: "The recipes didn't load.",
  allProfessions: "All",
  professionLabel: "Profession",
  makesLabel: "Makes",
  anything: "Anything",
  uses: "Uses",
  levelingGuide: "leveling guide",
  learnFrom: "Learn from",
  learnAt: "Learn at",
  knownFromStart: "Known from the start",
  trainer: "Trainer",
  vendor: "Vendor",
  quest: "Quest",
  /** Taught by an NPC (or an object) in Classic, not a trainer. */
  npc: "NPC",
  drop: "Drop",
  worldDrop: "World drop",
  container: "Container",
  /** A recipe item the Classic data has no source for (not a Forever-only recipe: that one gets the chip). */
  noSourceListed: "No source listed",
  sourcesTag: "Vendors, drops and quests:",
  noSource: "Where this recipe comes from isn't known yet.",
} as const;

/** A recipe's hover tooltip (guild crafter search). */
/** The link state a recipe-name link sends, so the Recipes page opens the recipe named in the search. */
export const OPEN_RECIPE_STATE: OpenRecipeState = { openRecipe: true };

export const RECIPE_TOOLTIP_TEXT = {
  reagents: "Materials",
  noReagents: "No materials listed.",
  open: "Click for the full recipe: its skill colours and where to learn it.",
} as const;

/** The Profession toggle's "every profession" value (never in the URL). */
export const RECIPE_ALL_PROFESSIONS = "all" as const;

/** The skill colours a recipe passes through, in order; the word carries it, not the swatch. */
export const RECIPE_SKILL_COLORS = [
  { key: "yellow", label: "Yellow", swatch: "bg-yellow-400" },
  { key: "green", label: "Green", swatch: "bg-green-500" },
  { key: "grey", label: "Gray", swatch: "bg-gray-400" },
] as const;
