export interface RecipeCardFacts {
  /** "3 versions", or null before the first. */
  versions: string | null;
  /** "by Sam", or null when the owner's name isn't known. */
  owner: string | null;
}
