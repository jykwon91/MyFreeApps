/**
 * Fake, fictional demo data for MyRecipes portfolio screenshots.
 *
 * Shapes mirror the backend request schemas (see
 * apps/myrecipes/backend/app/schemas/recipe/*.py):
 *   - RecipeFixture       -> RecipeCreateRequest (POST /recipes)
 *   - HeroVersionDelta     -> the ingredient/step edits a tweak applies on
 *                             top of the previous version (POST
 *                             /recipes/{id}/versions)
 *   - CookLogFixture       -> CookLogCreateRequest (POST
 *                             /recipes/{id}/versions/{vid}/cooks)
 */

export interface IngredientFixture {
  name: string;
  quantity?: number;
  unit?: string;
  note?: string;
}

export interface RecipeFixture {
  title: string;
  description?: string;
  source?: string;
  servings?: string;
  prepMinutes?: number;
  cookMinutes?: number;
  ingredients: IngredientFixture[];
  steps: string[];
}

export interface CookLogFixture {
  rating: number;
  outcomeNotes: string;
  /** How many days before "now" this cook happened — keeps the timeline readable. */
  daysAgo: number;
}

// ===========================================================================
// The HERO recipe — 4 versions telling a real "converging on the best result"
// story: chicken breast -> thighs, more garam masala + bloomed spices, and a
// lighter cream/coconut-milk swap. Ratings climb 3 -> 4 -> 4 -> 5 across cooks.
// ===========================================================================

export const HERO_TITLE = "Weeknight Chicken Tikka Masala";

export const heroRecipe: RecipeFixture = {
  title: HERO_TITLE,
  description:
    "A cozy, spice-forward tikka masala that's evolved over a dozen weeknight " +
    "dinners — from a rich, cream-heavy first draft to a lighter, more " +
    "aromatic version we now make on repeat.",
  source: "Adapted from a few family favorites",
  servings: "4",
  prepMinutes: 25,
  cookMinutes: 35,
  ingredients: [
    { name: "Boneless chicken breast", quantity: 1.5, unit: "lb", note: "cut into bite-size pieces" },
    { name: "Plain yogurt", quantity: 0.5, unit: "cup" },
    { name: "Garlic", quantity: 4, unit: "cloves", note: "minced" },
    { name: "Fresh ginger", quantity: 1, unit: "tbsp", note: "grated" },
    { name: "Garam masala", quantity: 1, unit: "tsp" },
    { name: "Ground cumin", quantity: 1, unit: "tsp" },
    { name: "Ground coriander", quantity: 1, unit: "tsp" },
    { name: "Smoked paprika", quantity: 1, unit: "tsp" },
    { name: "Yellow onion", quantity: 1, note: "diced" },
    { name: "Crushed tomatoes", unit: "can (28 oz)" },
    { name: "Heavy cream", quantity: 1, unit: "cup" },
    { name: "Butter", quantity: 2, unit: "tbsp" },
    { name: "Salt", note: "to taste" },
    { name: "Cilantro", note: "chopped, for garnish" },
  ],
  steps: [
    "Toss the chicken with yogurt, half the garlic, half the ginger, and a pinch of salt. Marinate at least 20 minutes (or overnight).",
    "Melt the butter in a large skillet over medium-high heat and sear the marinated chicken until browned on the outside, about 5 minutes. Remove and set aside.",
    "In the same skillet, saute the onion until soft, then add the remaining garlic and ginger and cook 1 minute.",
    "Stir in the garam masala, cumin, coriander, and paprika and cook 30 seconds until fragrant.",
    "Add the crushed tomatoes, bring to a simmer, and cook 10 minutes, stirring occasionally.",
    "Stir in the heavy cream and return the chicken to the skillet. Simmer 10-15 minutes until the chicken is cooked through and the sauce has thickened.",
    "Season with salt to taste and garnish with cilantro before serving over rice.",
  ],
};

/** An edit applied to one ingredient, addressed by its position in v1's list. */
export interface IngredientEdit {
  index: number;
  name?: string;
  quantity?: number;
  unit?: string;
  note?: string;
}

/** A step text replacement, addressed by position (steps have no lineage key). */
export interface StepEdit {
  index: number;
  instruction: string;
}

export interface HeroVersionDelta {
  /** The version_number this delta produces (2, 3, or 4). */
  versionNumber: number;
  changeNote: string;
  ingredientEdits: IngredientEdit[];
  ingredientAdds: IngredientFixture[];
  stepEdits: StepEdit[];
}

export const heroVersionDeltas: HeroVersionDelta[] = [
  {
    versionNumber: 2,
    changeNote:
      "Swapped chicken breast for thighs — way juicier, doesn't dry out during the simmer.",
    ingredientEdits: [
      { index: 0, name: "Boneless chicken thighs", quantity: 1.5, unit: "lb", note: "cut into bite-size pieces" },
    ],
    ingredientAdds: [],
    stepEdits: [],
  },
  {
    versionNumber: 3,
    changeNote:
      "Bumped the garam masala and bloomed the spices in butter before the tomatoes — much more aromatic.",
    ingredientEdits: [{ index: 4, quantity: 2 }],
    ingredientAdds: [],
    stepEdits: [
      {
        index: 3,
        instruction:
          "Stir in the garam masala (now 2 tsp), cumin, coriander, and paprika and cook 60 seconds, stirring constantly, until deeply fragrant — this is the flavor base.",
      },
    ],
  },
  {
    versionNumber: 4,
    changeNote:
      "Cut the cream from 1 cup to 1/3 cup and added a splash of coconut milk — lighter without losing richness.",
    ingredientEdits: [{ index: 10, quantity: 0.33 }],
    ingredientAdds: [{ name: "Coconut milk", quantity: 0.25, unit: "cup", note: "full-fat" }],
    stepEdits: [
      {
        index: 5,
        instruction:
          "Stir in the heavy cream and coconut milk, then return the chicken to the skillet. Simmer 10-15 minutes until the chicken is cooked through and the sauce has thickened.",
      },
    ],
  },
];

/** Cook logs keyed by hero version_number (1-4) — ratings climb as the recipe improves. */
export const heroCookLogsByVersion: Record<number, CookLogFixture[]> = {
  1: [
    {
      rating: 3,
      outcomeNotes:
        "Good flavor but a little heavy on the cream, and the chicken breast dried out a bit near the edges.",
      daysAgo: 35,
    },
  ],
  2: [
    {
      rating: 4,
      outcomeNotes:
        "Swapping to thighs was the right call — way juicier all the way through. Still feels a touch rich.",
      daysAgo: 28,
    },
  ],
  3: [
    {
      rating: 4,
      outcomeNotes:
        "Blooming the garam masala in butter first makes the kitchen smell incredible. Sauce is much more aromatic.",
      daysAgo: 21,
    },
    {
      rating: 5,
      outcomeNotes: "Made it again for guests — nobody believed it wasn't from a restaurant.",
      daysAgo: 14,
    },
  ],
  4: [
    {
      rating: 5,
      outcomeNotes:
        "Coconut milk swap keeps it rich without the heaviness. This is the final version — not touching it again.",
      daysAgo: 7,
    },
  ],
};

// ===========================================================================
// The rest of the library — single-version recipes so the list looks lived-in.
// ===========================================================================

export const otherRecipes: RecipeFixture[] = [
  {
    title: "Sourdough Discard Pancakes",
    description:
      "Fluffy weekend pancakes that put your sourdough discard to good use — crisp edges, tangy crumb.",
    servings: "3",
    prepMinutes: 10,
    cookMinutes: 15,
    ingredients: [
      { name: "Sourdough discard", quantity: 1, unit: "cup" },
      { name: "All-purpose flour", quantity: 0.5, unit: "cup" },
      { name: "Milk", quantity: 0.75, unit: "cup" },
      { name: "Egg", quantity: 1, unit: "large" },
      { name: "Sugar", quantity: 2, unit: "tbsp" },
      { name: "Baking soda", quantity: 0.5, unit: "tsp" },
      { name: "Salt", quantity: 0.25, unit: "tsp" },
      { name: "Butter", quantity: 2, unit: "tbsp", note: "melted" },
    ],
    steps: [
      "Whisk the sourdough discard, flour, milk, egg, and sugar together until smooth.",
      "Sprinkle the baking soda and salt over the batter and fold in gently — it will bubble slightly.",
      "Stir in the melted butter.",
      "Cook 1/4-cup scoops on a hot, lightly greased griddle until bubbles form on top, then flip and cook until golden.",
      "Serve warm with butter and maple syrup.",
    ],
  },
  {
    title: "Weekend Sourdough Boule",
    description:
      "A crusty, open-crumb country loaf — mix Friday night, shape Saturday morning, bake for Sunday brunch.",
    servings: "1 loaf (10 slices)",
    prepMinutes: 30,
    cookMinutes: 45,
    ingredients: [
      { name: "Bread flour", quantity: 500, unit: "g" },
      { name: "Water", quantity: 375, unit: "g" },
      { name: "Active sourdough starter", quantity: 100, unit: "g" },
      { name: "Salt", quantity: 10, unit: "g" },
    ],
    steps: [
      "Mix the flour and water and let rest (autolyse) for 30 minutes.",
      "Add the starter and salt, then mix until fully incorporated.",
      "Perform 4 sets of stretch-and-folds over the next 2 hours, 30 minutes apart.",
      "Bulk ferment at room temperature until roughly doubled, 4-6 hours.",
      "Shape into a boule, place seam-side up in a floured banneton, and refrigerate overnight.",
      "Bake in a preheated Dutch oven at 475F, covered, for 20 minutes, then uncovered for 20-25 minutes until deeply golden.",
    ],
  },
  {
    title: "Garlicky White Bean & Kale Soup",
    description:
      "A big pot of cozy, one-bowl comfort — lots of garlic, silky white beans, and greens that hold up to reheating.",
    servings: "6",
    prepMinutes: 15,
    cookMinutes: 35,
    ingredients: [
      { name: "Olive oil", quantity: 2, unit: "tbsp" },
      { name: "Yellow onion", quantity: 1, note: "diced" },
      { name: "Garlic", quantity: 6, unit: "cloves", note: "minced" },
      { name: "Carrots", quantity: 2, note: "diced" },
      { name: "Cannellini beans", quantity: 2, unit: "can (15 oz)", note: "drained and rinsed" },
      { name: "Vegetable broth", quantity: 6, unit: "cup" },
      { name: "Kale", quantity: 1, unit: "bunch", note: "stemmed and chopped" },
      { name: "Parmesan rind", note: "optional" },
      { name: "Red pepper flakes", quantity: 0.5, unit: "tsp" },
      { name: "Salt and pepper", note: "to taste" },
    ],
    steps: [
      "Heat the olive oil in a large pot and saute the onion and carrots until softened, about 5 minutes.",
      "Add the garlic and red pepper flakes and cook 1 minute until fragrant.",
      "Stir in the beans, broth, and parmesan rind. Bring to a simmer and cook 20 minutes.",
      "Stir in the kale and cook until wilted, about 5 minutes.",
      "Remove the parmesan rind, season with salt and pepper, and serve with crusty bread.",
    ],
  },
  {
    title: "Sheet-Pan Honey Mustard Salmon",
    description:
      "A 30-minute weeknight dinner — salmon and vegetables roast together on one pan, glazed in a sticky honey mustard sauce.",
    servings: "4",
    prepMinutes: 10,
    cookMinutes: 20,
    ingredients: [
      { name: "Salmon fillets", quantity: 4, note: "skin-on" },
      { name: "Baby potatoes", quantity: 1, unit: "lb", note: "halved" },
      { name: "Green beans", quantity: 8, unit: "oz", note: "trimmed" },
      { name: "Dijon mustard", quantity: 3, unit: "tbsp" },
      { name: "Honey", quantity: 2, unit: "tbsp" },
      { name: "Olive oil", quantity: 2, unit: "tbsp" },
      { name: "Garlic", quantity: 2, unit: "cloves", note: "minced" },
      { name: "Salt and pepper", note: "to taste" },
    ],
    steps: [
      "Preheat the oven to 425F. Toss the potatoes with olive oil, salt, and pepper and roast 15 minutes.",
      "Whisk together the mustard, honey, olive oil, and garlic.",
      "Push the potatoes to one side, add the green beans and salmon, and brush everything with the honey mustard glaze.",
      "Roast 12-15 minutes until the salmon flakes easily and the potatoes are tender.",
      "Spoon any extra glaze over the top before serving.",
    ],
  },
  {
    title: "Brown Butter Chocolate Chip Cookies",
    description:
      "Classic chocolate chip cookies with a nutty, caramelized edge from browning the butter first — chewy centers, crisp edges.",
    servings: "18 cookies",
    prepMinutes: 20,
    cookMinutes: 12,
    ingredients: [
      { name: "Unsalted butter", quantity: 1, unit: "cup", note: "browned and cooled slightly" },
      { name: "Brown sugar", quantity: 1, unit: "cup", note: "packed" },
      { name: "Granulated sugar", quantity: 0.5, unit: "cup" },
      { name: "Eggs", quantity: 2, unit: "large" },
      { name: "Vanilla extract", quantity: 2, unit: "tsp" },
      { name: "All-purpose flour", quantity: 2.25, unit: "cup" },
      { name: "Baking soda", quantity: 1, unit: "tsp" },
      { name: "Salt", quantity: 1, unit: "tsp" },
      { name: "Chocolate chips", quantity: 2, unit: "cup" },
    ],
    steps: [
      "Brown the butter in a saucepan over medium heat until golden and nutty-smelling, then let cool for 10 minutes.",
      "Whisk the browned butter with both sugars until glossy, then beat in the eggs and vanilla.",
      "Fold in the flour, baking soda, and salt until just combined, then fold in the chocolate chips.",
      "Chill the dough for at least 30 minutes.",
      "Scoop onto a lined baking sheet and bake at 375F for 10-12 minutes until the edges are set.",
      "Let cool on the pan for 5 minutes before transferring to a wire rack.",
    ],
  },
];

/** One cook log each on a couple of the other recipes, keyed by recipe title. */
export const otherRecipeCookLogs: Record<string, CookLogFixture> = {
  "Sheet-Pan Honey Mustard Salmon": {
    rating: 4,
    outcomeNotes: "Quick weeknight win, kids ate it without complaint.",
    daysAgo: 10,
  },
  "Brown Butter Chocolate Chip Cookies": {
    rating: 5,
    outcomeNotes: "Brown butter really does make a difference. Chewy edges, gooey center.",
    daysAgo: 6,
  },
};
