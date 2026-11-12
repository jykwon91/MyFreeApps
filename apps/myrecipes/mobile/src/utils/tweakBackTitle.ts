import { RECIPE_BACK_TITLE, TWEAK_ENTRY_POINT_BACK_TITLES } from "../constants/backTitles";
import type { TweakEntryPoint } from "../types/TweakEntryPoint";

/** Back's title on the tweak form, from the `from` route param it was opened with. */
export function tweakBackTitle(from: string | undefined): string {
  // Own keys only: a param like "constructor" would otherwise match the object's prototype.
  return from && Object.hasOwn(TWEAK_ENTRY_POINT_BACK_TITLES, from)
    ? TWEAK_ENTRY_POINT_BACK_TITLES[from as TweakEntryPoint]
    : RECIPE_BACK_TITLE;
}
