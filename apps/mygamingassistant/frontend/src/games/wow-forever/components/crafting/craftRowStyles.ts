/** Skill+recipe | crafts | reagents | learn — one grid for the header and every row. */
export const CRAFT_ROW_GRID = "grid gap-2 sm:grid-cols-[minmax(0,1.6fr)_3.5rem_minmax(0,1.2fr)_minmax(0,1.2fr)] sm:gap-4";

/** Done = below your skill (muted, still readable); current = where you are. */
export type RowState = "done" | "current" | "ahead";

export function rowStateClass(state: RowState): string {
  if (state === "current") return "border-l-4 border-primary bg-primary/5";
  if (state === "done") return "opacity-60";
  return "";
}
