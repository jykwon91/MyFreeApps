import type { RecipePhoto } from "./RecipePhoto";

export interface PhotoPreviewProps {
  photo: RecipePhoto;
  /** Why the last read failed, if it did. */
  problem: string | null;
  onExtract: () => Promise<void>;
  onChooseAgain: () => void;
}
