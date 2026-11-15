import type { GuildHelpEquippedItem } from "@/games/wow-forever/types/guild/guildHelpEquippedItem";
import type { GuildHelpProfession } from "@/games/wow-forever/types/guild/guildHelpProfession";
import type { GuildMemberTalentTree } from "@/games/wow-forever/types/guild/guildMemberTalentTree";

/** One live guild member with their latest stored sheet data (`GET /api/wow/guilds/{slug}/help`). */
export interface GuildHelpMember {
  slug: string;
  name: string;
  surname: string;
  class_name: string | null;
  level: number;
  /** Items the member currently wears. */
  equipped: GuildHelpEquippedItem[];
  /**
   * Blizzard SkillLineAbility ids for every known recipe across all professions.
   * Map to crafting-file spell ids via `recipeSpell()`.
   */
  recipe_ability_ids: number[];
  professions: GuildHelpProfession[];
  /** Active talent tree point totals; null when never fetched or last call failed. */
  talents: GuildMemberTalentTree[] | null;
}
