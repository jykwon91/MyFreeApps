/** A recipe (or enchant, or profession spell) the character knows. `id` is its spell id, the same ids as MGA's crafting files. */
export interface CharacterRecipe {
  id: number;
  name: string;
}
