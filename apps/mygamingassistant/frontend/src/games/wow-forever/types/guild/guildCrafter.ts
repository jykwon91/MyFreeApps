/** A guild member who knows a recipe (GET /api/wow/guilds/{slug}/recipes). */
export interface GuildCrafter {
  slug: string;
  name: string;
  surname: string;
  /** Blizzard's class name ("Warlock"); null when unknown. */
  class_name: string | null;
  /** Their skill in the recipe's profession, from their newest stored professions; null when none is stored. */
  skill: number | null;
  max_skill: number | null;
}
