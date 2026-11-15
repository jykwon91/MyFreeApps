import { learnAt, learnSkill, skillColors, sourceUnknown } from "@/games/wow-forever/crafting/craftRoute";
import { ITEM_QUALITIES, type ItemQuality } from "@/games/wow-forever/data/itemSlots";
import { itemIcon, itemQuality, recipeIcon } from "@/games/wow-forever/lib/icons/wowIcons";
import { nameWords, normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import { recipeCategory } from "@/games/wow-forever/lib/recipes/recipeCategory";
import type { CraftingProfession, CraftRecipe, LearnAt } from "@/games/wow-forever/types/crafting";
import type { CraftingData } from "@/games/wow-forever/types/craftingData";
import type { FoodRecord } from "@/games/wow-forever/types/food";
import type { RecipeCategory } from "@/games/wow-forever/types/recipes/recipeCategory";
import type { RecipeBookInput } from "@/games/wow-forever/types/recipes/recipeBookInput";
import type { RecipeEntry } from "@/games/wow-forever/types/recipes/recipeEntry";

function words(text: string): string[] {
  return nameWords(normalizeItemName(text));
}

function category(input: RecipeBookInput, profession: RecipeEntry["profession"], itemId: number | null, itemClass: number | undefined, enchant: boolean): RecipeCategory {
  const place = itemId === null ? undefined : input.categories.placeOf.get(itemId);
  return recipeCategory({ profession, enchant, place, itemClass });
}

function craftEntry(input: RecipeBookInput, profession: CraftingProfession, data: CraftingData, recipe: CraftRecipe): RecipeEntry {
  const learn = learnAt(recipe, data.trainerSkills);
  const colors = skillColors(recipe);
  const made = recipe.creates;
  const makes = made ? { id: made.id, name: made.name, count: made.count, quality: ITEM_QUALITIES[made.quality] ?? "common" } : null;
  const names = made && made.name !== recipe.name ? `${recipe.name} ${made.name}` : recipe.name;
  return {
    key: `${profession}:${recipe.spell}`,
    profession,
    name: recipe.name,
    icon: recipeIcon(recipe),
    makes,
    category: category(input, profession, made?.id ?? null, made?.itemClass, recipe.enchant === true),
    skill: learnSkill(learn),
    ...colors,
    reagents: recipe.reagents,
    learn,
    recipeSources: learn.kind === "item" ? data.sources.recipe(learn.itemId) : null,
    sourceUnknown: sourceUnknown(recipe),
    effect: recipe.effect ?? null,
    spec: data.file.specs?.find((s) => s.spell === recipe.spec)?.name ?? null,
    searchName: normalizeItemName(recipe.name),
    nameWords: words(names),
    recipeItemWords: learn.kind === "item" ? words(learn.item) : [],
    reagentWords: recipe.reagents.map((r) => words(r.name)),
  };
}

function foodLearn(food: FoodRecord, trainerSkills: RecipeBookInput["foodTrainerSkills"]): LearnAt {
  const { learn } = food;
  if (learn.source === "recipe" && learn.recipeItem !== null && learn.recipe !== null) {
    return { kind: "item", skill: learn.skill ?? 1, itemId: learn.recipeItem, item: learn.recipe, estimated: false };
  }
  const skill = trainerSkills[String(food.id)];
  // No recipe item and no trainer asking a skill: Cooking teaches it when you learn the profession.
  if (skill === undefined || skill <= 1) return { kind: "start" };
  return { kind: "trainer", skill, estimated: false, newInForever: false };
}

function foodEntry(input: RecipeBookInput, food: FoodRecord): RecipeEntry {
  const learn = foodLearn(food, input.foodTrainerSkills);
  const quality: ItemQuality = itemQuality(food.id) ?? "common";
  return {
    key: `cooking:${food.id}`,
    profession: "cooking",
    name: food.name,
    icon: itemIcon(food.id),
    makes: { id: food.id, name: food.name, count: 1, quality },
    category: category(input, "cooking", food.id, undefined, false),
    skill: learnSkill(learn),
    yellow: null,
    green: food.learn.greenAt,
    grey: food.learn.greyAt,
    reagents: food.reagents,
    learn,
    recipeSources: learn.kind === "item" ? input.foodSources.recipe(food.id) : null,
    sourceUnknown: false,
    effect: null,
    spec: null,
    searchName: normalizeItemName(food.name),
    nameWords: words(food.name),
    recipeItemWords: learn.kind === "item" ? words(learn.item) : [],
    reagentWords: food.reagents.map((r) => words(r.name)),
  };
}

/** Every recipe, crafting and Cooking, as one list (each profession's own order). */
export function buildRecipeBook(input: RecipeBookInput): RecipeEntry[] {
  const entries: RecipeEntry[] = [];
  for (const [profession, data] of input.crafting) {
    for (const recipe of data.file.recipes) entries.push(craftEntry(input, profession, data, recipe));
  }
  for (const food of input.foods) entries.push(foodEntry(input, food));
  return entries;
}
