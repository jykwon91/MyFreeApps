import type { PhotoImportProblem } from "./PhotoImportProblem";
import type { PhotoSource } from "./PhotoSource";

export interface PhotoChooserProps {
  problem: PhotoImportProblem | null;
  /** Where a photo is being got from, while the picker or the re-encoding is busy. */
  picking: PhotoSource | null;
  onChoose: (source: PhotoSource) => Promise<void>;
}
