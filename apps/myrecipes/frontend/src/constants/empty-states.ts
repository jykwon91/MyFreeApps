// Per-page empty-state copy — kept out of components per project convention.

export interface EmptyStateCopy {
  iconName: string;
  heading: string;
  body: string;
  actionLabel: string;
}

export const RECIPES_EMPTY_STATE: EmptyStateCopy = {
  iconName: "ChefHat",
  heading: "No recipes yet",
  body: "Save your first recipe and every tweak you make from here will be tracked as a new version — so you can see exactly what changed and whether it got better.",
  actionLabel: "New recipe",
};

export const RECIPES_SEARCH_EMPTY = {
  iconName: "Search",
  heading: "No matches",
  body: "No recipes match your search. Try a different title.",
} as const;
