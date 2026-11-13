import { formatCount } from "@/games/wow-forever/lib/character/formatCount";
import type { GuildSearch } from "@/games/wow-forever/types/guild/guildSearch";

/** The line above the results. */
export function guildSearchStatus(result: GuildSearch): string {
  if (result.guilds.length === 0) return `No guilds matching "${result.query}"`;
  const found = formatCount(result.guilds.length, "guild", "guilds");
  if (result.truncated) return `First ${found} matching "${result.query}". Type more of the name to narrow it down`;
  return `${found} matching "${result.query}"`;
}

/** "40 members", or null before the first roster. */
export function guildMemberCount(count: number | null): string | null {
  return count === null ? null : formatCount(count, "member", "members");
}
