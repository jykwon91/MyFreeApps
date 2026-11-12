/** The guild recipe search's URL state. */
export interface RecipeSearchParam {
  /** `?recipe=`; "" for none. */
  recipe: string;
  setRecipe: (text: string) => void;
}
