import { DIFF_ENTRY_POINT_BACK_TITLES, RECIPES_BACK_TITLE } from "../constants/backTitles";
import type { DiffEntryPoint } from "../types/DiffEntryPoint";

/** Back's title on a diff, from the `from` route param it was opened with. */
export function diffBackTitle(from: string | undefined): string {
  // Own keys only: a param like "constructor" would otherwise match the object's prototype.
  return from && Object.hasOwn(DIFF_ENTRY_POINT_BACK_TITLES, from)
    ? DIFF_ENTRY_POINT_BACK_TITLES[from as DiffEntryPoint]
    : RECIPES_BACK_TITLE;
}
