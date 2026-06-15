import type { DiffChangeKind } from "@/types/recipe/diff";

interface ChangeStyle {
  /** Container border + background tint. */
  container: string;
  /** Leading symbol shown before the line. */
  symbol: string;
  /** Symbol color. */
  symbolClass: string;
  /** Short label for screen readers / headers. */
  label: string;
}

/**
 * Visual treatment per diff change kind, kept in one place so ingredient and
 * step diffs read identically: added = green/+, removed = red/-, changed =
 * amber/~ with a before -> after presentation.
 */
export const CHANGE_STYLES: Record<DiffChangeKind, ChangeStyle> = {
  added: {
    container: "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40",
    symbol: "+",
    symbolClass: "text-green-600 dark:text-green-400",
    label: "Added",
  },
  removed: {
    container: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40",
    symbol: "−",
    symbolClass: "text-red-600 dark:text-red-400",
    label: "Removed",
  },
  changed: {
    container: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
    symbol: "~",
    symbolClass: "text-amber-600 dark:text-amber-400",
    label: "Changed",
  },
};
