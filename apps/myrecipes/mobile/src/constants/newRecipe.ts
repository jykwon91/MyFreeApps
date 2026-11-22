import { DISCARD_MESSAGES, type DiscardCopy } from "@platform/mobile";
import type { DraftOrigin } from "../types/DraftOrigin";

/** Copy for creating a recipe on the phone. Problems with what's typed come from the API client. */
export const NEW_RECIPE_MESSAGES = {
  screenTitle: "New recipe",
  newRecipe: "New recipe",
  newRecipeShort: "New",
  signInHeading: "Sign in to create a recipe",
  signInBody: "Recipes are saved to your MyRecipes account, so you can open them on the website too.",
  signIn: "Sign in",
  titleLabel: "Title",
  descriptionLabel: "Description",
  sourceLabel: "Source",
  sourcePlaceholder: "e.g. grandma, a cookbook, a URL",
  servingsLabel: "Servings",
  servingsPlaceholder: "e.g. 4",
  prepLabel: "Prep (min)",
  cookLabel: "Cook (min)",
  ingredientsHeading: "Ingredients",
  ingredientLabel: (number: number) => `Ingredient ${number}`,
  ingredientPlaceholder: "e.g. flour",
  quantityLabel: "Amount",
  quantityPlaceholder: "e.g. 2",
  unitLabel: "Unit",
  unitPlaceholder: "e.g. cups",
  noteLabel: "Note",
  notePlaceholder: "e.g. sifted",
  addIngredient: "Add ingredient",
  stepsHeading: "Steps",
  stepLabel: (number: number) => `Step ${number}`,
  stepPlaceholder: "Describe this step",
  addStep: "Add step",
  moveUp: "Up",
  moveDown: "Down",
  remove: "Remove",
  moveUpLabel: (thing: string) => `Move ${thing} up`,
  moveDownLabel: (thing: string) => `Move ${thing} down`,
  removeLabel: (thing: string) => `Remove ${thing}`,
  create: "Create recipe",
  creating: "Creating…",
  created: "Recipe created.",
  chooseDifferentPhoto: "Choose a different photo",
} as const;

/** Over a draft that came back thin, so it's checked before it's created. */
export const DRAFT_NEEDS_REVIEW: Record<DraftOrigin, string> = {
  discover: "We filled in what we could from the page. Check everything before creating it.",
  photo: "We filled in what we could from your photo. Check everything before creating it.",
};

/** Over a draft that came back whole. Discover's own screen has already said where it's from. */
export const DRAFT_FILLED_IN: Record<DraftOrigin, string | null> = {
  discover: null,
  photo: "We've filled this in from your photo. Edit anything that looks off, then create it.",
};

/**
 * Whether leaving an untouched draft loses nothing: a discovered recipe can be opened again from
 * its page, but a photo's read can't be rebuilt without picking the photo and waiting for another read.
 */
export const DRAFT_CAN_BE_REBUILT: Record<DraftOrigin, boolean> = {
  discover: true,
  photo: false,
};

/** What's asked before a draft is left: a photo's says it would need reading again. */
export const DRAFT_DISCARD_COPY: Record<DraftOrigin, DiscardCopy> = {
  discover: DISCARD_MESSAGES,
  photo: {
    discardTitle: "Leave without creating this recipe?",
    discardBody: "I'd have to read your photo again if you want it back.",
    keepEditing: "Stay here",
    discard: "Leave",
  },
};

/** What's asked before a photo's draft is thrown away to pick another photo. */
export const CHOOSE_AGAIN_DISCARD_COPY: DiscardCopy = {
  discardTitle: "Choose a different photo?",
  discardBody: "This recipe won't be created, and I'd have to read the new photo.",
  keepEditing: "Stay here",
  discard: "Choose another",
};

/** How tall a box for a description or a step starts, so it reads as somewhere to write. */
export const MULTILINE_MIN_HEIGHT = 96;
