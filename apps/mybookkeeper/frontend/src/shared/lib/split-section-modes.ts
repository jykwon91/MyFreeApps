import type { SplitSectionMode } from "@/shared/types/transaction/split-section-mode";

/** The property split section's modes by name, so a component switches on constants rather than bare strings. */
export const SPLIT_SECTION_MODE = {
  editing: "editing",
  split: "split",
  unsplit: "unsplit",
} as const satisfies Record<SplitSectionMode, SplitSectionMode>;
