import { SPLIT_SECTION_MODE } from "@/shared/lib/split-section-modes";
import type { SplitSectionMode } from "@/shared/types/transaction/split-section-mode";

/** What the split section shows: the editor, a saved split, or the offer to split. */
export function splitSectionMode(isEditing: boolean, isSplit: boolean): SplitSectionMode {
  if (isEditing) return SPLIT_SECTION_MODE.editing;
  if (isSplit) return SPLIT_SECTION_MODE.split;
  return SPLIT_SECTION_MODE.unsplit;
}
