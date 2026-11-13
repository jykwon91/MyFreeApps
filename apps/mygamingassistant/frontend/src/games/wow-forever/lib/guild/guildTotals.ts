import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import type { GuildMember } from "@/games/wow-forever/types/guild/guildMember";
import type { GuildTotals } from "@/games/wow-forever/types/guild/guildTotals";

/** The members' honorable kills and dungeon clears added up (a number Blizzard didn't send counts as nothing), and how many are at the cap. */
export function guildTotals(members: readonly GuildMember[]): GuildTotals {
  return {
    honorableKills: members.reduce((sum, m) => sum + (m.honorable_kills ?? 0), 0),
    dungeonClears: members.reduce((sum, m) => sum + (m.dungeons_done ?? 0), 0),
    atCap: members.filter((m) => m.level === MAX_LEVEL).length,
    members: members.length,
  };
}
