import type { CookCopy } from "./CookCopy";

export interface SavedCookCopiesProps {
  copies: CookCopy[];
  onOpen: (recipeId: string) => void;
}
