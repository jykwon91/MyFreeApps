import type { NewRecipeSeed } from "./NewRecipeSeed";

export interface NewRecipeFormProps {
  seed?: NewRecipeSeed;
  /** Offers a way back to where the draft came from, after asking before the draft is thrown away. */
  onChooseAgain?: () => void;
}
