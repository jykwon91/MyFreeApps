import type { GuideProfession } from "@/games/wow-forever/data/professions/professionPicker";
import type { GuildSortKey } from "@/games/wow-forever/data/guild/guildConfig";

/** The member list's search, filters and sort, as kept in the URL. */
export interface GuildMemberFilters {
  query: string;
  /** A class name, or "" for every class. */
  className: string;
  /** The lowest level shown; 0 for every level. */
  minLevel: number;
  /** Only members who have learned this profession; "" for everyone. */
  profession: GuideProfession | "";
  sort: GuildSortKey;
  descending: boolean;
}
