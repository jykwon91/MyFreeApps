import type { GuildCrafter } from "@/games/wow-forever/types/guild/guildCrafter";

/** A recipe someone in the guild knows, and who. */
export interface GuildRecipe {
  id: number;
  name: string;
  /** Blizzard's profession (SkillLine) id: 197 Tailoring, 185 Cooking... */
  profession_id: number;
  /** Highest skill first, then by name. */
  crafters: GuildCrafter[];
}
