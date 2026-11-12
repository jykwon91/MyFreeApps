import type { DiffChangeKind } from "@myrecipes/api-client/types/recipe/diff";

interface ChangeStyle {
  /** Container border + background tint. */
  container: string;
  /** Symbol color. */
  symbolClass: string;
}

/**
 * Colours per diff change kind, kept in one place so ingredient and step diffs
 * read identically: added = green, removed = red, changed = amber. The symbol
 * and label are DIFF_CHANGE_DISPLAY, shared with the phone.
 */
export const CHANGE_STYLES: Record<DiffChangeKind, ChangeStyle> = {
  added: {
    container: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40",
    symbolClass: "text-green-600 dark:text-green-400",
  },
  removed: {
    container: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
    symbolClass: "text-red-600 dark:text-red-400",
  },
  changed: {
    container: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
    symbolClass: "text-amber-600 dark:text-amber-400",
  },
};
