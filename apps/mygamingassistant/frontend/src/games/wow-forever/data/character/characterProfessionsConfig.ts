/**
 * Known "recipes" that aren't crafts. Disenchant (13262) has skill numbers in
 * the client but gives no skill-ups (Classic rule), so colouring it would mislead.
 */
export const NOT_A_RECIPE_SPELLS: ReadonlySet<number> = new Set([13262]);

export const PROFESSIONS_FAILED_NOTE =
  "Blizzard didn't send this character's professions. Log in and out once, then look again.";
export const NO_PROFESSIONS_NOTE = "This character hasn't learned a profession yet.";
export const RECIPE_COLOR_CAPTION = "Orange always gives a skill point; gray never does.";
